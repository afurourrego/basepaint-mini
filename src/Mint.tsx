import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import Pixels from "./pixels";
import Button from "./Button";
import { Address, formatEther, parseAbi } from "viem";
import { BASEPAINT_ADDRESS, client } from "./chain";
import { base } from "viem/chains";

export default function Mint({
  address,
  day,
  theme,
  palette,
  size,
  pixels,
  price,
}: {
  address: Address;
  day: number;
  theme: string;
  palette: string[];
  size: number;
  pixels: string;
  price: bigint;
}) {
  const [count, setCount] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const background = useMemo(() => Pixels.fromString(pixels), [pixels]);
  const PIXEL_SIZE = 3;

  async function mint() {
    const chainId = await client.getChainId();
    if (chainId !== base.id) {
      await client.switchChain(base);
    }

    await client.writeContract({
      account: address,
      chain: base,
      abi: parseAbi([
        "function mint(uint256 day, uint256 count) public payable",
      ]),
      functionName: "mint",
      address: BASEPAINT_ADDRESS,
      args: [BigInt(day), BigInt(count)],
      value: price * BigInt(count),
    });
  }

  useLayoutEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, size * PIXEL_SIZE, size * PIXEL_SIZE);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, size * PIXEL_SIZE, size * PIXEL_SIZE);

    for (const { x, y, color } of background) {
      if (palette[color]) {
        ctx.fillStyle = palette[color];
        ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
  }, [background, palette, PIXEL_SIZE, size, background]);

  return (
    <div className="fullscreen">
      <div className="menu">
        <div>
          Day {day}: {theme}
        </div>
        <div>
          {palette.map((color, i) => (
            <div
              key={i}
              style={{
                backgroundColor: color,
                width: 20,
                height: 20,
                display: "inline-block",
              }}
            />
          ))}
        </div>
        <canvas
          ref={canvasRef}
          width={size * PIXEL_SIZE}
          height={size * PIXEL_SIZE}
        />
        <div className="price">
          <input
            type="number"
            value={count}
            min={1}
            max={10_000}
            onInput={(e) => setCount(+e.currentTarget.value)}
          />
          {formatEther(price * BigInt(count))} ETH
        </div>
        <Button onClick={mint}>Mint</Button>
      </div>
    </div>
  );
}
