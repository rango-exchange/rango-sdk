## Node.js Example for configuring the `@rango-dev/sdk` client

- `rango.ts` creates the client with `new RangoClient({ apiKey })` and exports it.
- `quotes.ts` fetches **Quotes** for a swap, with the affiliate fields in `req`, and prints them.
- `confirm.ts` confirms the first **Quote** without an `error` into a **Route**, by its `requestId`.
- `quote.ts` fetches the single best **Route** for the wallets in `selectedWallets`.
- `warnings.ts` describes each warning by its `type`.
- `invalid-input.ts` points at the `field` of an `INVALID_INPUT`.

Each module handles `SdkError` by `type`. For what the client caches, see [`client.cache`](../../../packages/sdk/README.md#clientcache).

### Requirements:

- @rango-dev/sdk
- Node.js >= 24

### How to run the code?

Set your API key in `rango.ts`, your affiliate in `quotes.ts` (or remove it) and your wallet addresses in `quote.ts`, then run following commands in the root:

```sh
yarn
yarn build
cd /path/to/example/
node --import=tsx index.ts
```
