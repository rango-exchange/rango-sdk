## Node.js Example for configuring the `@rango-dev/sdk` client

This example creates the default client once in `rango.ts` with `createClient`. `consumer.ts` reaches the same client with `getClient()`, without importing `rango.ts`. The entry, `index.ts`, checks that both modules get the same instance. Then `quotes.ts` fetches **Quotes** for a swap and prints them, handling `QuotesError` by `type`.

### Requirements:

- @rango-dev/sdk
- Node.js >= 24

### How to run the code?

Set your API key in `rango.ts`, then run following commands in the root:

```sh
yarn
yarn build
cd /path/to/example/
node --import=tsx index.ts
```
