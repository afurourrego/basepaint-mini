import { useEffect, useState } from "preact/hooks";

function useTimestamp() {
  const [timestamp, setTimestamp] = useState(() => BigInt(Date.now()) / 1000n);
  useEffect(() => {
    const interval = setInterval(
      () => setTimestamp(BigInt(Date.now()) / 1000n),
      1000
    );
    return () => clearInterval(interval);
  }, []);

  return timestamp;
}

export function getSecondsLeft({
  timestamp,
  startedAt,
  epochDuration,
}: {
  timestamp: bigint;
  startedAt: bigint;
  epochDuration: bigint;
}) {
  const difference = epochDuration - ((timestamp - startedAt) % epochDuration);
  return Number(difference);
}

export default function Countdown({
  startedAt,
  epochDuration,
}: {
  startedAt: bigint;
  epochDuration: bigint;
}) {
  const timestamp = useTimestamp();

  const seconds = getSecondsLeft({ timestamp, startedAt, epochDuration });
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  return (
    <span>
      {(hours % 24).toString().padStart(2, "0")}:
      {(minutes % 60).toString().padStart(2, "0")}:
      {Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0")}
    </span>
  );
}
