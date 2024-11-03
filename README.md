# BasePaint Mini

> [!WARNING]
> Work in progress, not everything is working yet

Minimalistic implementation of [BasePaint](https://basepaint.xyz/) dApp.

Principles:

- Compiles down to a self-contained HTML file that can be hosted on IPFS
- Doesn't depend on external RPC providers or any other services

Supported features (work-in-progress):

- [x] Basic wallet connection (via injected EIP-1193)
- [x] Painting on today's canvas
- [x] Minting the previous day's canvas
- [ ] Withdrawing earnings

Out of scope:

- Minting brushes
- Browsing previous days
- Theme voting
- Chat, live cursors, WIP
- Animations

## Getting Started

- `npm run dev` - Starts a dev server at http://localhost:5173/

- `npm run build` - Builds for production, emitting to `dist/`

- `npm run preview` - Starts a server at http://localhost:4173/ to test production build locally
