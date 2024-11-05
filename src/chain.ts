import "./style.css";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  publicActions,
} from "viem";
import { base } from "viem/chains";

export const BASEPAINT_ADDRESS = "0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83";
export const BRUSH_ADDRESS = "0xD68fe5b53e7E1AbeB5A4d0A6660667791f39263a";
export const METADATA_ADDRESS = "0xcfb86b6aC2cE09f9A01C39af9Dccf3ecba304F95";

export const client = createWalletClient({
  transport: custom((window as any).ethereum),
}).extend(publicActions);

export const publicClient = client;
