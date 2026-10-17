## Node.js Example for configuring the `@rango-dev/sdk` client

This example creates one client in `rango.ts` with `new RangoClient({ apiKey, meta: { blockchains } })` and exports it. `meta.blockchains` is the meta API's blockchain list, used to check a set `destination`; the example sets no destination, so it passes `[]`. The modules that call the API, `quotes.ts`, `confirm.ts` and `quote.ts`, import that client from `rango.ts`. First `quotes.ts` fetches **Quotes** for a swap and prints them, handling `SdkError` by `type`. The client holds no affiliate settings, so `quotes.ts` puts the affiliate fields in the request, and `quote.ts` puts the same ones in its own. `confirm.ts` confirms the **Quote** of the first entry in `data.quotes` that has no `error` into a **Route** for the wallets in `selectedWallets`, passing the entry's `data` as the request's `quote` as it is, reading the **Route** from the result's `data`, and handling `SdkError` by `type`. Finally `quote.ts` fetches the single best **Route** for the wallets in `selectedWallets`, handling `SdkError` by `type`. Each prints its warnings, each described by its `type` in `warnings.ts`. Each also handles `INVALID_INPUT`, which is thrown before any request when the input fails a check, by pointing at its `field` in `invalid-input.ts`.

### Requirements:

- @rango-dev/sdk
- Node.js >= 24

### How to run the code?

Set your API key (and, if you set a destination, the blockchains meta) in `rango.ts`, your affiliate in `quotes.ts` (or remove it) and your wallet addresses in `quote.ts`, then run following commands in the root:

```sh
yarn
yarn build
cd /path/to/example/
node --import=tsx index.ts
```
