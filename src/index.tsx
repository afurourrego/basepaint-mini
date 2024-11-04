import "./style.css";
import { render } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { parseAbi } from "viem";
import { Address } from "viem";
import Canvas from "./Canvas";
import {
  BASEPAINT_ADDRESS,
  BRUSH_ADDRESS,
  client,
  publicClient,
} from "./chain";
import Withdraw from "./Withdraw";
import Mint from "./Mint";
import Button from "./Button";

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

async function fetchTheme(day: number) {
  const request = await fetch(`https://basepaint.xyz/api/theme/${day}`);
  return (await request.json()) as {
    theme: string;
    palette: string[];
    size: number;
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

function usePaintedPixels(day: number) {
  const oldEvents = usePromise(
    () =>
      publicClient
        .getContractEvents({
          abi: parseAbi([
            "event Painted(uint256 indexed day, uint256 tokenId, address author, bytes pixels)",
          ]),
          address: BASEPAINT_ADDRESS,
          eventName: "Painted",
          args: { day: BigInt(day) },
          strict: true,
          fromBlock: 0n,
        })
        .then((logs) => logs.map((l) => l.args)),
    [day]
  );

  const [newEvents, setNewEvents] = useState<typeof oldEvents>([]);

  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      abi: parseAbi([
        "event Painted(uint256 indexed day, uint256 tokenId, address author, bytes pixels)",
      ]),
      address: BASEPAINT_ADDRESS,
      eventName: "Painted",
      strict: true,
      args: { day: BigInt(day) },
      onLogs: (logs) =>
        setNewEvents((prev) => [...prev!, ...logs!.map((l) => l.args)]),
    });

    return unwatch;
  }, [day]);

  const allEvents = useMemo(
    () => [...(oldEvents ?? []), ...(newEvents ?? [])],
    [oldEvents, newEvents]
  );
  const pixels = useMemo(
    () => allEvents.map((e) => e.pixels.replace(/^0x/, "")).join(""),
    [allEvents]
  );

  return oldEvents ? pixels : null;
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

function useTheme(day: number) {
  return usePromise(() => fetchTheme(day), [day]);
}

function useBrushes(address: Address) {
  return usePromise(() => fetchBrushes(address), [address]);
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
        <Button onClick={connect}>Connect Wallet</Button>
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
  if (!brushes) {
    return <Loading what="brushes" />;
  }

  return (
    <Canvas
      address={address}
      brushes={brushes}
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
