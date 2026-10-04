## Node.js Example for configuring the `@rango-dev/sdk` client

This example creates one client in `rango.ts` with `new RangoClient({ apiKey })` and exports it. The entry, `index.ts`, imports that client from `rango.ts`.

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
