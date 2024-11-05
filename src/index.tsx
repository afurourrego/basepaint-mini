import "./style.css";
import { render } from "preact";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { parseAbi, parseAbiItem } from "viem";
import { Address } from "viem";
import Canvas from "./Canvas";
import {
  BASEPAINT_ADDRESS,
  BRUSH_ADDRESS,
  client,
  METADATA_ADDRESS,
  publicClient,
} from "./chain";
import Withdraw from "./Withdraw";
import Mint from "./Mint";
import Button from "./Button";
import { base } from "viem/chains";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return now;
}

function usePromise<T>(promise: () => Promise<T>, deps: any[] = []): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    let isMounted = true;
    promise().then((v) => {
      if (isMounted) {
        setValue(v);
      }
    });

    return () => {
      isMounted = false;
    };
  }, deps);

  return value;
}

async function initialFetch() {
  const [startedAt, epochDuration] = await Promise.all([
    publicClient.readContract({
      abi: parseAbi(["function startedAt() view returns (uint256)"]),
      functionName: "startedAt",
      address: BASEPAINT_ADDRESS,
    }),
    publicClient.readContract({
      abi: parseAbi(["function epochDuration() view returns (uint256)"]),
      functionName: "epochDuration",
      address: BASEPAINT_ADDRESS,
    }),
  ]);
  return { startedAt, epochDuration };
}

async function fetchThemeFromBasepaint(day: number) {
  const request = await fetch(`https://basepaint.xyz/api/theme/${day}`);
  return (await request.json()) as {
    theme: string;
    palette: string[];
    size: number;
  };
}

async function fetchThemeFromBlockchain(day: number) {
  const metadata = await publicClient.readContract({
    address: METADATA_ADDRESS,
    abi: parseAbi([
      "function getMetadata(uint256 id) public view returns ((string name, uint24[] palette, uint96 size, address proposer))",
    ]),
    functionName: "getMetadata",
    args: [BigInt(day)],
  });

  if (!metadata.name) {
    throw new Error(`No theme found for day ${day} onchain`);
  }

  return {
    theme: metadata.name,
    palette: metadata.palette.map(
      (color) => `#${color.toString(16).padStart(6, "0")}`
    ),
    size: Number(metadata.size),
  };
}

async function fetchBrushes(address: Address) {
  const events = await publicClient.getContractEvents({
    abi: parseAbi([
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ]),
    address: BRUSH_ADDRESS,
    eventName: "Transfer",
    args: { to: address },
    strict: true,
    fromBlock: 0n,
  });

  const tokenIds = events.map((e) => e.args.tokenId);
  const owners = await Promise.all(
    tokenIds.map((id) =>
      publicClient.readContract({
        abi: parseAbi(["function ownerOf(uint256) view returns (address)"]),
        functionName: "ownerOf",
        address: BRUSH_ADDRESS,
        args: [id],
      })
    )
  );

  const ownedTokenIds = tokenIds.filter((_, i) => owners[i] === address);
  const strengths = await Promise.all(
    ownedTokenIds.map((id) =>
      publicClient.readContract({
        abi: parseAbi(["function strengths(uint256) view returns (uint256)"]),
        functionName: "strengths",
        address: BRUSH_ADDRESS,
        args: [id],
      })
    )
  );

  return ownedTokenIds
    .map((id, i) => ({ id, strength: strengths[i] }))
    .sort((a, b) => Number(b.strength - a.strength));
}

function useToday() {
  const now = useNow();
  const info = usePromise(initialFetch, []);

  if (!info) {
    return null;
  }

  return Number(
    (BigInt(now) / 1000n - info.startedAt) / info.epochDuration + 1n
  );
}

async function getStrokesFromLogs(
  day: number,
  onNewPixels: (pixels: string) => void,
  ac: AbortController
) {
  let latestBlock = await client.getBlockNumber();
  let logs: { day: number; pixels: string }[] = [];
  const BATCH_SIZE = 10_000n;
  for (let toBlock = latestBlock; toBlock > BATCH_SIZE; toBlock -= BATCH_SIZE) {
    const fromBlock = toBlock - BATCH_SIZE + 1n;
    console.log("Fetching logs from Ethereum", { fromBlock, toBlock });

    const batchLogs = await client.getLogs({
      address: BASEPAINT_ADDRESS,
      event: parseAbiItem(
        "event Painted(uint256 indexed day, uint256 tokenId, address author, bytes pixels)"
      ),
      fromBlock,
      toBlock,
      strict: true,
    });

    logs = [
      ...batchLogs.map((log) => ({
        day: Number(log.args.day),
        pixels: log.args.pixels,
      })),
      ...logs,
    ];

    if (logs[0].day < day) {
      break;
    }
  }

  async function poll() {
    const fromBlock = latestBlock + 1n;
    const toBlock = await client.getBlockNumber();
    console.log("Polling logs from Ethereum", { fromBlock, toBlock });

    const batchLogs = await client.getLogs({
      address: BASEPAINT_ADDRESS,
      event: parseAbiItem(
        "event Painted(uint256 indexed day, uint256 tokenId, address author, bytes pixels)"
      ),
      args: { day: BigInt(day) },
      fromBlock,
      toBlock,
      strict: true,
    });
    console.log(`Got ${batchLogs.length} new logs`);

    latestBlock = toBlock;
    const pixels = batchLogs
      .map((log) => log.args.pixels.replace(/^0x/, ""))
      .join("");
    onNewPixels(pixels);
  }

  let interval = setInterval(() => {
    if (ac.signal.aborted) {
      clearInterval(interval);
    } else {
      poll();
    }
  }, 15_000);

  return logs
    .filter((log) => log.day === day)
    .map((log) => log.pixels.replace(/^0x/, ""))
    .join("");
}

function usePaintedPixels(day: number) {
  const [pixels, setPixels] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    getStrokesFromLogs(
      day,
      (morePixels) => setPixels((old) => old + morePixels),
      ac
    ).then(setPixels);

    return () => ac.abort();
  }, []);

  return pixels;
}

function useWallet() {
  const [address, setAddress] = useState<Address | null>(null);
  const connect = useCallback(() => {
    client
      .requestAddresses()
      .then((addresses) => addresses.length > 0 && setAddress(addresses[0]));
  }, []);

  useEffect(() => {
    client
      .getAddresses()
      .then((addresses) => addresses.length > 0 && setAddress(addresses[0]));
  }, []);

  return { address, connect };
}

function useCurrentChainId() {
  const [chain, setChain] = useState<number | null>(null);

  useEffect(() => {
    client.getChainId().then(setChain);
  }, []);

  const switchChain = useCallback((id: number) => {
    client.switchChain({ id }).then(() => setChain(id));
  }, []);

  return { chain, switchChain };
}

function useTheme(day: number) {
  return usePromise(
    () =>
      fetchThemeFromBlockchain(day).catch(() => fetchThemeFromBasepaint(day)),
    [day]
  );
}

function useBrushes(address: Address) {
  return usePromise(() => fetchBrushes(address).catch(() => []), [address]);
}

function usePrice() {
  return usePromise(
    () =>
      publicClient.readContract({
        abi: parseAbi(["function openEditionPrice() view returns (uint256)"]),
        functionName: "openEditionPrice",
        address: BASEPAINT_ADDRESS,
      }),
    []
  );
}

export function App() {
  const { address, connect } = useWallet();
  if (!address) {
    return (
      <div className="fullscreen">
        <div className="menu">
          <Button onClick={connect}>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  const { chain, switchChain } = useCurrentChainId();
  if (chain !== base.id) {
    return (
      <div className="fullscreen">
        <div className="menu">
          <Button onClick={() => switchChain(base.id)}>Switch to Base</Button>
        </div>
      </div>
    );
  }

  const [ui, setUI] = useState<"paint" | "mint" | "withdraw" | null>(null);

  if (!ui) {
    return (
      <div className="fullscreen">
        <div className="menu">
          <Button onClick={() => setUI("paint")}>Paint</Button>
          <Button onClick={() => setUI("mint")}>Mint</Button>
          <Button onClick={() => setUI("withdraw")}>Withdraw</Button>
        </div>
      </div>
    );
  }

  const today = useToday();
  if (!today) {
    return <Loading what="today" />;
  }

  if (ui === "withdraw") {
    return <Withdraw today={today} address={address} />;
  }

  let day = ui === "mint" ? today - 1 : today;

  const theme = useTheme(day);
  if (!theme) {
    return <Loading what="theme" />;
  }

  const pixels = usePaintedPixels(day);
  if (pixels === null) {
    return <Loading what="pixels" />;
  }

  if (ui === "mint") {
    const price = usePrice();
    if (!price) {
      return <Loading what="price" />;
    }

    return (
      <Mint
        address={address}
        day={day}
        theme={theme.theme}
        palette={theme.palette}
        size={theme.size}
        pixels={pixels}
        price={price}
      />
    );
  }

  const brushes = useBrushes(address);

  return (
    <Canvas
      address={address}
      brushes={brushes ?? []}
      day={day}
      theme={theme.theme}
      palette={theme.palette}
      size={theme.size}
      pixels={pixels}
    />
  );
}

function Loading({ what }: { what: string }) {
  return <div className="fullscreen">Loading {what}…</div>;
}

render(<App />, document.getElementById("app")!);
