## Node.js Example for configuring the `@rango-dev/sdk` client

This example creates one client in `rango.ts` with `new RangoClient({ apiKey, meta: { blockchains } })` and exports it. `meta.blockchains` is the meta API's blockchain list, used to check a set `destination`; the example sets no destination, so it passes `[]`. `quote.ts` imports that client from `rango.ts` and fetches the single best **Route** for the wallets in `selectedWallets`, handling `SdkError` by `type`. The client holds no affiliate settings, so `quote.ts` puts the affiliate fields in the request. It prints its warnings, each described by its `type` in `warnings.ts`. It also handles `INVALID_INPUT`, which is thrown before any request when the input fails a check, by pointing at its `field` in `invalid-input.ts`.

### Requirements:

- @rango-dev/sdk
- Node.js >= 24

### How to run the code?

Set your API key (and, if you set a destination, the blockchains meta) in `rango.ts`, your affiliate (or remove it) and your wallet addresses in `quote.ts`, then run following commands in the root:

```sh
yarn
yarn build
cd /path/to/example/
node --import=tsx index.ts
```
