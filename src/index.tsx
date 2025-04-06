import "./style.css";
import { render } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  createWalletClient,
  custom,
  parseAbi,
  parseAbiItem,
  publicActions,
} from "viem";
import { Address } from "viem";
import Canvas from "./Canvas";
import {
  BASEPAINT_ADDRESS,
  BRUSH_ADDRESS,
  METADATA_ADDRESS,
} from "./constants";
import Withdraw from "./Withdraw";
import Mint from "./Mint";
import Button from "./Button";
import { base } from "viem/chains";
import { UniversalProvider } from "@walletconnect/universal-provider";

export type Client = NonNullable<ReturnType<typeof useClient>>;

function useClient() {
  const [ethereum] = useState(() => (window as any).ethereum);
  const [wcProvider, setWcProvider] = useState<any>(null);

  const client = useMemo(() => {
    if (ethereum) {
      return createWalletClient({
        chain: base,
        transport: custom(ethereum),
      }).extend(publicActions);
    } else if (wcProvider) {
      return createWalletClient({
        chain: base,
        transport: custom(wcProvider),
      }).extend(publicActions);
    }
    return null;
  }, [ethereum, wcProvider]);

  useEffect(() => {
    if (!ethereum && !wcProvider) {
      UniversalProvider.init({
        projectId: "TU_PROJECT_ID_AQUI", // Reemplaza con tu projectId de WalletConnect
        metadata: {
          name: "BasePaint Mini",
          description: "A minimal BasePaint dApp",
          url: "https://your-dapp-url.com", // Reemplaza con tu URL
          icons: [],
        },
      })
        .then((provider) => {
          setWcProvider(provider);
        })
        .catch((error) => console.error("Failed to init WalletConnect:", error));
    }
  }, [ethereum, wcProvider]);

  return { client, wcProvider };
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

async function initialFetch(client: Client) {
  const [startedAt, epochDuration] = await Promise.all([
    client.readContract({
      abi: parseAbi(["function startedAt() view returns (uint256)"]),
      functionName: "startedAt",
      address: BASEPAINT_ADDRESS,
    }),
    client.readContract({
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

async function fetchThemeFromBlockchain(client: Client, day: number) {
  const metadata = await client.readContract({
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

async function fetchBrushes(client: Client, address: Address) {
  const events = await client.getContractEvents({
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
      client.readContract({
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
      client.readContract({
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

function useToday(client: Client) {
  const info = usePromise(() => initialFetch(client), [client]);
  const [day, setDay] = useState<number | null>(null);

  if (!info) {
    return null;
  }

  useEffect(() => {
    function computeDay() {
      if (!info) {
        return;
      }

      setDay(
        Number(
          (BigInt(Date.now()) / 1000n - info.startedAt) / info.epochDuration +
            1n
        )
      );
    }

    computeDay(); // Initial value

    const interval = setInterval(computeDay, 1000);
    return () => clearInterval(interval);
  }, [info]);

  if (!day) {
    return null;
  }

  return { day, ...info };
}

async function getStrokesFromLogs(
  client: Client,
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

function usePaintedPixels(client: Client, day: number) {
  const [pixels, setPixels] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    getStrokesFromLogs(
      client,
      day,
      (morePixels) => setPixels((old) => old + morePixels),
      ac
    ).then(setPixels);

    return () => ac.abort();
  }, [client]);

  return pixels;
}

function useWallet(client: Client, wcProvider: any) {
  const [address, setAddress] = useState<Address | null>(null);

  const connect = useCallback(() => {
    client
      .requestAddresses()
      .then((addresses) => addresses.length > 0 && setAddress(addresses[0]))
      .catch((error) => console.error("Failed to connect wallet:", error));
  }, [client]);

  const connectWalletConnect = useCallback(() => {
    if (wcProvider) {
      wcProvider
        .connect({
          chains: [base.id],
        })
        .then((session) => {
          const accounts = session.namespaces.evm.accounts;
          const address = accounts[0].split(":")[2] as Address;
          setAddress(address);
        })
        .catch((error) => console.error("WalletConnect error:", error));
    }
  }, [wcProvider]);

  useEffect(() => {
    client
      .getAddresses()
      .then((addresses) => addresses.length > 0 && setAddress(addresses[0]));
  }, [client]);

  return { address, connect, connectWalletConnect };
}

function useCurrentChainId(client: Client) {
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);

  useEffect(() => {
    client.getChainId().then(setCurrentChainId);
  }, [client]);

  const switchChain = useCallback(
    (id: number) => {
      client.switchChain({ id }).then(() => setCurrentChainId(id));
    },
    [client]
  );

  return { currentChainId, switchChain };
}

function useTheme(client: Client, day: number) {
  return usePromise(
    () =>
      fetchThemeFromBlockchain(client, day).catch(() =>
        fetchThemeFromBasepaint(day)
      ),
    [day]
  );
}

function useBrushes(client: Client, address: Address) {
  return usePromise(
    () => fetchBrushes(client, address).catch(() => []),
    [address]
  );
}

function usePrice(client: Client) {
  return usePromise(
    () =>
      client.readContract({
        abi: parseAbi(["function openEditionPrice() view returns (uint256)"]),
        functionName: "openEditionPrice",
        address: BASEPAINT_ADDRESS,
      }),
    []
  );
}

export function App() {
  const { client, wcProvider } = useClient();

  if (!client) {
    return (
      <div className="fullscreen">
        <BasePaintHero />
        <p>Loading wallet provider...</p>
      </div>
    );
  }

  const { address, connect, connectWalletConnect } = useWallet(client, wcProvider);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (!address) {
    return (
      <div className="fullscreen">
        <BasePaintHero />
        <div className="menu">
          <Button onClick={connect}>Connect Wallet</Button>
          {isMobile && (
            <Button onClick={connectWalletConnect}>Connect with WalletConnect</Button>
          )}
          {wcProvider?.session && isMobile && (
            <p>Scan this URI with your wallet: {wcProvider.uri}</p>
          )}
        </div>
      </div>
    );
  }

  const { currentChainId, switchChain } = useCurrentChainId(client);
  if (currentChainId !== client.chain.id) {
    return (
      <div className="fullscreen">
        <BasePaintHero />
        <div className="menu">
          <Button onClick={() => switchChain(client.chain.id)}>
            Switch to {client.chain.name}
          </Button>
        </div>
      </div>
    );
  }

  const [ui, setUI] = useState<"paint" | "mint" | "withdraw" | null>(null);

  if (!ui) {
    return (
      <div className="fullscreen">
        <BasePaintHero />
        <div className="menu">
          <Button onClick={() => setUI("paint")}>Paint</Button>
          <Button onClick={() => setUI("mint")}>Mint</Button>
          <Button onClick={() => setUI("withdraw")}>Withdraw</Button>
        </div>
      </div>
    );
  }

  const today = useToday(client);
  if (!today) {
    return <Loading what="today" />;
  }

  if (ui === "withdraw") {
    return <Withdraw client={client} today={today.day} address={address} />;
  }

  let day = ui === "mint" ? today.day - 1 : today.day;

  const theme = useTheme(client, day);
  if (!theme) {
    return <Loading what="theme" />;
  }

  const pixels = usePaintedPixels(client, day);
  if (pixels === null) {
    return <Loading what="pixels" />;
  }

  if (ui === "mint") {
    const price = usePrice(client);
    if (!price) {
      return <Loading what="price" />;
    }

    return (
      <Mint
        client={client}
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

  const brushes = useBrushes(client, address);

  return (
    <Canvas
      client={client}
      address={address}
      brushes={brushes ?? []}
      day={day}
      epochDuration={today.epochDuration}
      startedAt={today.startedAt}
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

function BasePaintHero() {
  return (
    <div className="hero">
      <svg
        width="255"
        height="102"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M104 1v5h7V1h10v6h19v6h19v7h19v6h20v6h19v6h13v13h6v6h7v13H60v-1h10v-6h5v-5h6v-5h5V37h-5V26h-6v-5H65v-5H49v5h-5v5h-6v6h-5v26h5v5h-5v5h-5v2H8v-5H7v-7H0V32h6v-6h6V13h6V7h19V1h48v4h-5v6h-5v5h5v6h5v5h6v-5h5v-6h6v-5h2V1ZM28 70v4h16v-4h10v4h6v-4h183v11h5v6h-5v1h-1v5h-6v-5h-7v6h-9v7h-35v-7h-25v-6h-20v-6H90v6h1v6h12v8H45v-6H32v-7H19v-7h-5v-5H8v-7h20Zm26 0H44v-1h5v-6h10v5h-5v2ZM38 1v6-6ZM19 8v5-5ZM1 44v-4 4Zm0 2v5-5Zm0 6v6h6-6v-6Zm0-1Zm0-6Zm6-13v-6 6Zm-6 1v5-5Zm0 6Zm12-13v-5 5Zm-1-6v-6 6Zm1 0ZM8 64v-6 6Zm0-6Zm25 37h12-12v-6 6Zm13 0Zm0 1v5h57-57v-5Zm-26-7h12-12Zm13 0Zm222-2h-7v6h7v-6Zm-1-19h-6 6v-6 6Zm-7-7h8v8h-8v-8Zm-138 39v-6 6h6-6Zm7 1h6v-8h-14v8h8Zm6-1h-6 6Z"
          fill="#0042DF"
        />
      </svg>
      <h1>BasePaint Mini</h1>
      <p>
        Tiny implementation of the{" "}
        <a href="https://basepaint.xyz" target="_blank" rel="noreferrer">
          BasePaint
        </a>{" "}
        dApp with minimal dependencies.
      </p>
      <p>
        Press{" "}
        {navigator.userAgent.toLowerCase().indexOf("mac") !== -1
          ? "Cmd"
          : "Ctrl"}
        +D to bookmark this page.
      </p>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
