# BasePaint Mini

> [!WARNING]
> Work in progress, please report bugs!

Minimalistic implementation of [BasePaint](https://basepaint.xyz/) dApp.

Principles:

- Compiles down to a self-contained HTML file that can be hosted on IPFS
- Doesn't depend on external RPC providers or any other services

Supported features (work-in-progress):

- [x] Basic wallet connection (via injected EIP-1193)
- [x] Painting on today's canvas
- [x] Minting the previous day's canvas
- [x] Withdrawing earnings

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

## Contributing

At this time, we can't promise we'll respond to issues or pull requests.

# License

While BasePaint artwork is distributed as CC0, the code in this repository is licensed under the MIT license. We welcome BasePaint meme proliferation, but please don't forget to include the attribution in your forks, modifications and distributions.

```
MIT License

Copyright (c) 2024 BasePaint Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
