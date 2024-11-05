import { memo } from "preact/compat";
import { useEffect, useMemo, useReducer, useRef } from "preact/hooks";
import Pixels from "./pixels";
import {
  ArrowUpCircle,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Trash,
} from "./icons";
import { BASEPAINT_ADDRESS, client } from "./chain";
import { Address, parseAbi } from "viem";

function Canvas({
  day,
  theme,
  palette,
  size,
  pixels,
  address,
  brushes,
}: {
  day: number;
  theme: string;
  palette: string[];
  size: number;
  pixels: string;
  address: Address;
  brushes: { id: bigint; strength: bigint }[];
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const PIXEL_SIZE = state.pixelSize;

  const background = useMemo(() => Pixels.fromString(pixels), [pixels]);

  async function save() {
    const chainId = await client.getChainId();
    if (chainId !== client.chain.id) {
      await client.switchChain(client.chain);
    }

    const response = prompt(
      "What brush token ID do you want to use?",
      brushes[0]?.id.toString() ?? "0"
    );
    if (!response) {
      return;
    }

    const brushId = BigInt(response);

    client.writeContract({
      account: address,
      abi: parseAbi([
        "function paint(uint256 day, uint256 tokenId, bytes calldata pixels)",
      ]),
      functionName: "paint",
      address: BASEPAINT_ADDRESS,
      args: [BigInt(day), brushId, `0x${state.pixels}`],
    });
  }

  useEffect(() => {
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

    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= size; x++) {
      ctx.moveTo(x * PIXEL_SIZE, 0);
      ctx.lineTo(x * PIXEL_SIZE, size * PIXEL_SIZE);
    }
    for (let y = 0; y <= size; y++) {
      ctx.moveTo(0, y * PIXEL_SIZE);
      ctx.lineTo(size * PIXEL_SIZE, y * PIXEL_SIZE);
    }
    ctx.stroke();

    for (const { x, y, color } of state.pixels) {
      if (palette[color]) {
        ctx.fillStyle = palette[color];
        ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
  }, [background, palette, PIXEL_SIZE, size, state.pixels]);

  const locate = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasSize = rect.width;

    // Calculate the actual size of each pixel
    const actualPixelSize = canvasSize / size;

    // Calculate the position relative to the canvas
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;

    // Convert to grid coordinates
    const x = Math.floor(relativeX / actualPixelSize);
    const y = Math.floor(relativeY / actualPixelSize);

    // Ensure the coordinates are within the canvas bounds
    const boundedX = Math.max(0, Math.min(x, size - 1));
    const boundedY = Math.max(0, Math.min(y, size - 1));

    return { x: boundedX, y: boundedY };
  };

  return (
    <div className="main">
      <Toolbar
        day={day}
        theme={theme}
        colorIndex={state.colorIndex}
        palette={palette}
        dispatch={dispatch}
        onSave={save}
      />
      <div className="container">
        <canvas
          ref={canvasRef}
          onMouseDown={(e) =>
            dispatch({ type: "down", where: locate(e), erase: e.button === 2 })
          }
          onMouseMove={(e) => dispatch({ type: "move", where: locate(e) })}
          onMouseUp={() => dispatch({ type: "up" })}
          onMouseLeave={() => dispatch({ type: "leave" })}
          onContextMenu={(e) => e.preventDefault()}
          width={size * PIXEL_SIZE}
          height={size * PIXEL_SIZE}
        />
      </div>
    </div>
  );
}

function Toolbar({
  day,
  theme,
  palette,
  colorIndex,
  dispatch,
  onSave,
}: {
  day: number;
  theme: string;
  palette: string[];
  colorIndex: number;
  dispatch: (action: Action) => void;
  onSave: () => void;
}) {
  return (
    <div className="toolbar">
      <div className="theme-name">
        Day {day}: {theme}
      </div>
      <button onClick={() => onSave()}>
        <ArrowUpCircle />
      </button>
      <button onClick={() => dispatch({ type: "reset" })}>
        <Trash />
      </button>
      <button onClick={() => dispatch({ type: "zoom-in" })}>
        <MagnifyingGlassPlus />
      </button>
      <button onClick={() => dispatch({ type: "zoom-out" })}>
        <MagnifyingGlassMinus />
      </button>
      <div>
        {palette.map((color, index) => (
          <button
            key={index}
            className="color-button"
            style={{
              backgroundColor: palette[index],
              borderColor: index === colorIndex ? "black" : "transparent",
            }}
            onClick={() => dispatch({ type: "pick", index })}
          ></button>
        ))}
      </div>
    </div>
  );
}

type Point2D = { x: number; y: number };

type State = {
  size: number;
  down: boolean;
  erasing: boolean;
  pixelSize: number;
  colorIndex: number;
  pixels: Pixels;
};

const initialState: State = {
  size: 256,
  down: false,
  erasing: false,
  pixelSize: 3,
  colorIndex: 0,
  pixels: new Pixels(),
};

type Action =
  | { type: "init"; size: number }
  | { type: "pick"; index: number }
  | { type: "down"; where: Point2D; erase: boolean }
  | { type: "move"; where: Point2D }
  | { type: "up" }
  | { type: "leave" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "pick":
      return {
        ...state,
        colorIndex: action.index,
      };

    case "down":
    case "move":
      if (
        action.where.x < 0 ||
        action.where.x >= state.size ||
        action.where.y < 0 ||
        action.where.y >= state.size
      ) {
        return state;
      }

      if (action.type === "move" && !state.down) {
        return state;
      }

      const erasing = action.type === "down" ? action.erase : state.erasing;

      return {
        ...state,
        erasing,
        down: true,
        pixels: state.pixels.set(
          action.where.x,
          action.where.y,
          erasing ? null : state.colorIndex
        ),
      };

    case "up":
    case "leave":
      return { ...state, down: false, erasing: false };

    case "reset":
      return { ...state, pixels: new Pixels() };

    case "zoom-in":
      return { ...state, pixelSize: Math.min(20, state.pixelSize + 1) };

    case "zoom-out":
      return { ...state, pixelSize: Math.max(1, state.pixelSize - 1) };

    default:
      return state;
  }
}

export default memo(Canvas);
