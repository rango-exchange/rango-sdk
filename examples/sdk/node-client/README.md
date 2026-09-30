## Node.js Example for configuring the `@rango-dev/sdk` client

This example creates the default client once in `rango.ts` with `createClient`. `consumer.ts` reaches the same client with `getClient()`, without importing `rango.ts`. The entry, `index.ts`, checks that both modules get the same instance. Then `quotes.ts` fetches **Quotes** for a swap and prints them, handling `QuotesError` by `type`. `confirm.ts` confirms the first **Quote** that has no error into a **Route** for the wallets in `selectedWallets`, handling `ConfirmError` by `type`. Finally `quote.ts` fetches the single best **Route** for the wallets in `selectedWallets`, handling `QuoteError` by `type`. Each prints its warnings, each described by its `kind` in `warnings.ts`. Each also handles `INVALID_INPUT`, which is thrown before any request when the input fails a check, by pointing at its `field` in `invalid-input.ts`.

### Requirements:

- @rango-dev/sdk
- Node.js >= 24

### How to run the code?

Set your API key in `rango.ts` and your wallet addresses in `quote.ts`, then run following commands in the root:

```sh
yarn
yarn build
cd /path/to/example/
node --import=tsx index.ts
```
