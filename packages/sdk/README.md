# Rango Exchange SDK

[![npm version](https://badge.fury.io/js/@rango-dev%2Fsdk.svg)](https://badge.fury.io/js/@rango-dev%2Fsdk)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/LICENSE)

> Under development: it provides the client, `quotes()`, `confirm()` and `quote()`, and, in the browser, the [execution](#execution) methods `execute()`, `cancel()`, `history`, `delete()`, `pause()` and `resume()`.

## Install

```shell
yarn add @rango-dev/sdk # or: npm install @rango-dev/sdk
```

## Usage

```ts
import { RangoClient } from '@rango-dev/sdk'

const client = new RangoClient({ apiKey: 'YOUR_API_KEY' })
```

`baseUrl` defaults to `https://api.rango.exchange`. To run swaps, add an `execution` config with a `wallet`, now or later; see [Execution](#execution).

The package keeps no client of its own. To share one, export it from a module of yours and import it where you need it:

```ts
// rango.ts
import { RangoClient } from '@rango-dev/sdk'

export const client = new RangoClient({ apiKey: 'YOUR_API_KEY' })
```

```ts
// anywhere else
import { client } from './rango.js'
```

## Methods

`quote()` and `confirm()` resolve to `{ data, warnings, _response }`; `quotes()` to `{ data, _response }`, with warnings on each entry. Build on `data`; `warnings` are the [warnings](#warnings) that apply; `_response` is the legacy API's raw response, an escape hatch (to log `traceId`, say). Results are plain JSON.

`quotes()` and `confirm()` take their required inputs, then an optional `{ req, signal }`; `quote()` takes one request, then an optional `{ signal }`.

### `quotes()`

Every available **Quote** for a swap, without a wallet.

```ts
const { data } = await client.quotes(
  { blockchain: 'ETH', symbol: 'ETH', address: null },
  {
    blockchain: 'BSC',
    symbol: 'USDC',
    address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  },
  '1',
  { req: { slippage: '1' } },
)
```

`req` (`QuotesReq`) takes the request's optional fields, such as `slippage`, swapper filters and the affiliate fields.

`data.quotes` has one `{ data, warnings, error? }` entry per server result, in its order; one bad **Quote** never fails the call. An entry's `error` (the first of `NO_RESULT`, `BRIDGE_LIMIT` or `UNKNOWN_SLIPPAGE` that fails) is attached, not thrown: disable that **Quote**, since `confirm()` doesn't check it.

A successful call caches every returned **Quote** for `confirm()`; see [`client.cache`](#clientcache).

- Throws: `INVALID_INPUT`, `REQUEST_CANCELED`, `NO_RESULT`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `SERVER_ERROR`, `REQUEST_FAILED`.
- Warnings per entry: those of `quote()` except `INSUFFICIENT_BALANCE`.

### `confirm()`

Turns the chosen **Quote** into a **Route** for the user's wallets. Pass its `requestId`; `confirm()` reads the **Quote** from the [cache](#clientcache).

```ts
const chosen = data.quotes.find((entry) => !entry.error)
const selectedWallets = {
  ETH: { address: '0x...', walletId: 'metamask' },
  BSC: { address: '0x...', walletId: 'metamask' },
}
const { data: route, warnings } = await client.confirm(
  chosen.data.requestId,
  selectedWallets,
)
```

`selectedWallets` (`SelectedWallets`) holds each blockchain's address and the ID of the wallet that holds it. Rango gets only the addresses; the **Route** keeps each Wallet ID.

`req` (`ConfirmReq`) takes an optional `destination`, checked as in `quote()`. `data` is a `Route`, the same type `quote()` returns, with your `selectedWallets` and the **Quote**'s `slippage` merged in.

The client keeps a copy of the result for [`execute()`](#execute) in the [cache](#clientcache)'s `confirmed` slot, for the last 10 confirms; confirming the same **Quote** again replaces it.

- Throws: `INVALID_INPUT` (`requestId`: `NOT_FOUND`), then those of `quote()`.
- Warnings: those of `quote()`, plus `EXCESSIVE_OUTPUT_AMOUNT_CHANGE`.

### `quote()`

The best **Route** in one step, when you have the user's wallets.

```ts
const { data: route, warnings } = await client.quote({
  from,
  to,
  amount,
  selectedWallets,
})
```

`selectedWallets` is as in `confirm()`. `data` is a `Route`, as from `confirm()`, with the request's `selectedWallets` and `slippage` merged in. A set `destination` is checked against `to`'s blockchain in the [blockchain list](#clientcache), fetched with the call's `signal` if not yet cached; a failed fetch caches nothing.

With `checkPrerequisites: false` the server skips the balance check: no `INSUFFICIENT_BALANCE`, and `createTransaction` may refuse the request ID.

- Throws: `INVALID_INPUT`, `REQUEST_CANCELED`, `NO_RESULT`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `SERVER_ERROR`, `REQUEST_FAILED`, `BRIDGE_LIMIT`, `UNKNOWN_SLIPPAGE`.
- Warnings: `HIGH_VALUE_LOSS`, `UNKNOWN_PRICE`, `INSUFFICIENT_SLIPPAGE`, `HIGH_SLIPPAGE`, `HIGH_FEE`, `LONG_DURATION`, `INSUFFICIENT_BALANCE`.

### `client.cache`

Each client keeps its own in-memory cache, which the SDK fills. Read it with `get`:

```ts
const quotes = client.cache.get('quotes') // ReadonlyMap<string, ReadonlyMap<string, Quote>>, or undefined
const quote = client.cache.get('quotes')?.get(routeId)?.get(requestId) // a Quote, or undefined
const confirmed = client.cache.get('confirmed') // ReadonlyMap<string, ConfirmResult>, or undefined
const blockchains = client.cache.get('blockchains') // readonly BlockchainMeta[], or undefined
```

- `quotes`: the **Quotes** of successful `quotes()` calls, keyed by route ID, then by request ID. The client keeps the last 10 route IDs and drops the oldest.
- `confirmed`: the results of successful `confirm()` calls, keyed by request ID: the **Routes** `execute()` can start. The client keeps the last 10 and drops the oldest; confirming a request ID again replaces its entry and makes it the newest. `execute()` drops an entry once it has stored the **Execution**.
- `blockchains`: the blockchain list `quote()` and `confirm()` check a `destination` against. It is fetched on first need, kept for the client's lifetime and never refetched; a failed fetch caches nothing.

The cache is read-only: don't mutate what you read.

## Execution

The execution methods run a confirmed **Route** to a finished swap, in the browser. For each step, `execute()` creates its transaction, has your wallet sign it, and follows its status until it succeeds, then starts the next step. Each **Execution** is stored in IndexedDB under the **Route**'s request ID, so it survives a reload; progress arrives as [events](#events) and in [`history`](#history).

### Setup

```ts
export const client = new RangoClient({
  apiKey: 'YOUR_API_KEY',
  execution: { wallet, emitter: mitt<ExecutionEvents>() },
})
```

Every key of `execution` (`ExecutionConfig`) is optional:

- `wallet` (`WalletPort`): signs and reads for the user's wallets; see [Wallet port](#wallet-port). Without one, each **Execution** is `BLOCKED` `NOT_CONNECTED` until a wallet is set.
- `emitter` (`Emitter<ExecutionEvents>`): receives the [events](#events) of every **Execution**; a mitt emitter fits as it is.
- `pauseOnStart`: `true` builds the execution engine paused, for an app in several tabs; see [`pause()` and `resume()`](#pause-and-resume).
- `beforeResume`: sets the wallet before each run of an **Execution**; see [`beforeResume`](#beforeresume).

Build one execution client per page, and don't run other `@rango-dev/queue-manager-core` apps on the same origin: they share one database. Execution is browser only: in Node, `quotes()`, `confirm()` and `quote()` work, and `execute()` throws `REQUEST_FAILED`.

### Wallet port

The SDK has no wallet code: you pass a `WalletPort`, one optional key per **Namespace**, holding the methods the SDK calls for it. Implement only the namespaces your app supports; within one, every method is required except `evm`'s `wait`.

```ts
import type { WalletPort } from '@rango-dev/sdk'

// `evm(blockchain)`, `chainIdOf(blockchain)` and `solana` are your code: your app's wallets and chain config.
const wallet: WalletPort = {
  evm: {
    getAccounts: async (req) => evm(req.blockchain).accounts(), // null when not connected
    getChainId: async (req) => evm(req.blockchain).getChainId(),
    switchChain: async (req) =>
      evm(req.blockchain).switchChain(req.chainId, req.chain),
    sign: async (req) =>
      evm(req.blockchain).signAndSend(req.tx, chainIdOf(req.blockchain)),
    getAllowance: async (req) =>
      evm(req.blockchain).allowance(req.prerequisite),
    getTransactionInfo: async (req) => {
      const receipt = await evm(req.blockchain).getTransactionReceipt(req.hash)
      if (receipt === null) return 'pending' // an ethers receipt
      return receipt.status === 1 ? 'success' : 'failed'
    },
  },
  solana: {
    getAccounts: async () => solana.accounts(),
    sign: async (req) => solana.signAndSend(req.tx),
  },
}
```

| Namespace                          | Methods                                                                                           | Signs                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `evm`                              | `getAccounts`, `getChainId`, `switchChain`, `sign`, `wait?`, `getAllowance`, `getTransactionInfo` | EVM transactions and EVM approves, on every EVM blockchain.   |
| `hyperliquid`                      | `getAccounts`, `getChainId`, `switchChain`, `signTypedData`                                       | Hyperliquid actions, on their `signatureChainId`.             |
| `tron`                             | `getAccounts`, `sign`, `getAllowance`, `buildTransaction`, `getTransactionInfo`                   | TRON transactions and TRON approves.                          |
| `xrpl`                             | `getAccounts`, `sign`, `getTrustline`, `getTransactionInfo`                                       | XRPL payments and trustlines (the SDK builds the `TrustSet`). |
| `stellar`                          | `getAccounts`, `sign`, `getTrustline`, `buildTransaction`                                         | Stellar transactions and trustlines.                          |
| `bip122`                           | `getAccounts`, `sign`                                                                             | Transfers on every UTXO blockchain.                           |
| `solana`, `starknet`, `ton`, `sui` | `getAccounts`, `sign`                                                                             | Their own transactions.                                       |

No request carries the address: sign with the wallet's active account. Only `evm` and `bip122` requests carry `blockchain`, the `selectedWallets` key. A method that fails rejects with a `SignerError` (exported with `SignerErrorCode`), whose `code` and `getErrorDetail()` make the stored failure.

- `getAccounts`: answer the addresses the chosen wallet holds, or `null` when it isn't connected. Never prompt.
- `getChainId`: answer the wallet's chain ID, hex or decimal.
- `switchChain`: switch to `chainId`, or reject when the wallet can't. On `evm`, `chain` describes the chain as EIP-3085 does without `chainId`, so a wallet that doesn't know the chain can add `{ chainId, ...chain }` first.
- `sign`: sign and send `tx` and resolve with `{ hash, response?, hashRequiringUpdate? }`; a Stellar `sign` resolves only once the network accepted it.
- `signTypedData`: sign ethers' `{ domain, types, value }` on `chainId` and answer the `0x` signature.
- `wait`: resolve with the hash to follow, or the same `hash` when you have no signer for it, such as after a reload.
- `getAllowance` and `getTrustline`: answer what the wallet already grants as a decimal string, or `null` for nothing.
- `buildTransaction`: build the approve or trustline as plain data, without prompting.
- `getTransactionInfo`: on `evm`, answer `'pending'`, `'success'` or `'failed'` from the receipt; on `tron` and `xrpl`, answer what the chain says, as it is.

### `execute()`

Runs a confirmed **Route** to its end, or unblocks its stored **Execution**.

```ts
await client.execute(route.requestId, {
  transactionOptions: {
    slippage: '1',
    validations: { balance: true, fee: true },
  },
})
```

`ExecutionOptions`: `transactionOptions` is sent to `/tx/create` for every step (`slippage` required, `infiniteApprove` and `validations` sent as given); `swapMode`, `'swap'` (the default) or `'refuel'`, is only stored. The SDK stores a copy, so changing the object afterwards changes nothing.

- **A new Execution:** pass the `requestId` of a **Route** `confirm()` returned. It resolves once the **Execution** is stored and its first task has started, and the **Route** leaves the [cache](#clientcache)'s `confirmed` slot.
- **A `BLOCKED` Execution:** call `execute(requestId)` with no options to run its wallet checks again. Call it on every wallet event (connect, account, network), never from a `stepEvent` or `changed` handler, so unblocking never loops into network prompts.
- **Any other stored Execution** is left as it is, and given options are ignored. An ended one is final: a new attempt starts from a new **Quote**.

Run one **Execution** per wallet at a time.

- Throws: `INVALID_INPUT` (`requestId`: `NOT_FOUND`; `options`: `MISSING`), `CLIENT_PAUSED`, `REQUEST_FAILED`; see [Errors and failures](#errors-and-failures).

### Managing Executions

`cancel()`, `delete()`, `pause()` and `resume()` throw only `REQUEST_FAILED`, when the execution engine can't be loaded (or, for `pause()`, can't pause, as in Node).

#### `cancel()`

Ends a `PENDING`, `RUNNING` or `BLOCKED` **Execution** `CANCELED`, with a `USER_CANCEL` failure, as `await client.cancel(requestId)`; any other is left as it is. It can't close a wallet prompt already open or stop a request in flight.

#### `delete()`

Removes an ended **Execution** from storage, as `await client.delete(requestId)`; any other is left as it is. It's removed from `history` at once, and deleting it from storage is only attempted: a failed delete there isn't noticed, so it can come back after a reload. It emits no event, so refresh your list yourself.

#### `pause()` and `resume()`

```ts
await (isActiveTab ? client.resume() : client.pause()) // at mount
onElectionChange((isActive) => (isActive ? client.resume() : client.pause()))
```

Call `resume()` at mount in every app: it builds the execution engine and resumes the stored `RUNNING` **Executions** after a reload. With several tabs, your election picks the **Active tab**: build with `pauseOnStart: true`, `resume()` the active tab and `pause()` the others at mount and on every election change, and call `execute()` only in the active tab.

#### `beforeResume`

```ts
beforeResume(context, setContext, item) {
  setContext({ wallet: walletFor(item._storage.data.selectedWallets) })
}
```

Called before each run of an **Execution** with the wallet, a `setContext` that sets it and the [`HistoryItem`](#history). `setContext` is client-wide, so set the wallet in every call. It must be synchronous and must not throw.

### `history`

```ts
const item = await client.history.get(route.requestId) // a HistoryItem, or undefined
const items = await client.history.getAll()
```

Each stored **Execution** as a `HistoryItem`, read fresh on each call; read `getAll()` again on each [`loaded`](#events) event. Its shape may still change, as the underscores mark:

- `_queue`: `id` (the request ID), `createdAt`, `status` (`PENDING`, `RUNNING`, `BLOCKED`, `SUCCESS`, `FAILED` or `CANCELED`) and `blocked`, which is `{ reason, metadata: { blockchain, address, requiredChainId? } }` while `BLOCKED`, else `null`.
  - `NOT_CONNECTED`: no wallet, no namespace for the entry, or `getAccounts` gives `null`, `[]` or rejects. Ask the user to connect.
  - `ACCOUNT_MISMATCH`: `address` isn't among the accounts. Ask the user to pick it.
  - `NETWORK_MISMATCH` (EVM/Hyperliquid only): the wallet is still on the wrong chain after one `switchChain`. Ask the user to switch to `requiredChainId`.
- `_storage` (`ExecutionRecord`), a copy of what is stored: the **Route** (`data`), `options`, `transactions` (`s<step>` for a step's main transaction, `s<step>.p<i>` for its **Prerequisites**), `finishedSwapSteps`, `failure` and `finishedAt`. A failed swap failed at step `finishedSwapSteps + 1`.

It throws only `REQUEST_FAILED`, when the execution engine can't be loaded.

### Events

The `emitter` gets four events. Every one but `loaded` carries the current `HistoryItem`, as `view` or as the payload:

- `routeEvent` `{ event, view }`: `started` when step 1 starts, `succeeded` once it ends `SUCCESS`, `failed` once a failure, a cancel included, is stored.
- `stepEvent` `{ event, step, transactionId, view }`: `started` when a step starts; `tx_execution` with `create_tx`, `switch_network`, `send_tx` or `tx_sent` as its transaction is made, signed and sent; `check_status` or `output_revealed` on each status answer; `approval_tx_succeeded` when an approve is proved; `tx_execution_blocked` when it becomes `BLOCKED`; `succeeded` and `failed` when the step ends.
- `changed`: after every stored change, with the `HistoryItem` as the payload.
- `loaded`: after each load of storage, every 5 s in a paused tab, with no payload. Read `history.getAll()` again.

Events may fire again when a task runs again after a reload, so make your handlers idempotent.

### Errors and failures

Each execution method throws only `SdkError`, apart from an error your `emitter` throws:

- `INVALID_INPUT`, from `execute()`: `requestId` `NOT_FOUND` (no confirmed **Route** and no stored **Execution**, such as a **Route** from `quote()`), or `options` `MISSING`.
- `CLIENT_PAUSED`, from `execute()` of a new **Route** in a paused client: nothing is stored and the **Route** stays confirmed, so call `resume()`, then `execute()` again.
- `REQUEST_FAILED`: the execution engine can't be loaded, `execute()` can't store the **Execution**, or `pause()` can't pause, with core's error as `cause`.

A swap that fails while it runs is never thrown: the **Execution** ends `FAILED` (or `CANCELED`) with `{ reasonCode, message, detail }` (`ExecutionFailure`) in `_storage.failure`.

| `reasonCode`                  | When                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FETCH_TX_FAILED`             | `/tx/create` fails or answers no transaction, or a Cosmos or unknown transaction type.                                                                             |
| `CLIENT_UNEXPECTED_BEHAVIOUR` | The SDK refuses the transaction, a **Prerequisite**'s read or build rejects or it fails on chain, a status answer has a `newTx`, or a method rejects unexpectedly. |
| `TX_EXPIRED`                  | After a reload, a main transaction was being signed.                                                                                                               |
| `USER_REJECT`                 | The user rejected: a `SignerError` coded `REJECTED_BY_USER`.                                                                                                       |
| `CALL_WALLET_FAILED`          | A `SignerError` coded `SIGN_TX_ERROR`.                                                                                                                             |
| `SEND_TX_FAILED`              | A `SignerError` coded `SEND_TX_ERROR`.                                                                                                                             |
| `TX_FAILED_IN_BLOCKCHAIN`     | A `SignerError` coded `TX_FAILED_IN_BLOCKCHAIN`.                                                                                                                   |
| `INSUFFICIENT_APPROVE`        | A signed approve's allowance isn't confirmed within 30 s.                                                                                                          |
| `TX_FAIL`                     | Rango's status answer says the step failed on chain.                                                                                                               |
| `USER_CANCEL`                 | `cancel()` ended it.                                                                                                                                               |

**Warning: `newTx` leaves funds mid-route.** A step whose status answer has a `newTx` fails mid-route, with the funds in the intermediate token. Tell the user where their funds are.

## Errors

Every method failure rejects with an `SdkError`. Switch on `type` to narrow `metadata` (TypeScript 5.3+); `cause` holds the transport error, or the API response for a `REQUEST_FAILED` the server reported. When a request is rejected, `message` is the response body's `error`, or `The request failed.` when there is none. An error from checking a response, such as `NO_RESULT` for a result with no swaps, `BRIDGE_LIMIT` or `UNKNOWN_SLIPPAGE`, has no `cause`. A swap that fails while it runs is not thrown: it is stored on its **Execution**; see [Errors and failures](#errors-and-failures).

```ts
try {
  await client.quote(request)
} catch (error) {
  if (error instanceof SdkError && error.type === 'BRIDGE_LIMIT')
    console.log(error.metadata.swap.fromAmountMaxValue)
}
```

| Type                | Thrown when                                                                                                                                                                                                               | `metadata`                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `INVALID_INPUT`     | An input is invalid, before any request. `to`: `SAME_ASSET`; `amount`: `NOT_A_NUMBER`, `NOT_POSITIVE`; `requestId`: `NOT_FOUND`; `destination`: `NO_ADDRESS_PATTERNS`, `PATTERN_MISMATCH`; `options`: `MISSING`.          | `{ field, reason }`                      |
| `REQUEST_CANCELED`  | The `signal` aborted, including a timeout.                                                                                                                                                                                | none                                     |
| `NO_RESULT`         | No route: no result, or a result with no swaps.                                                                                                                                                                           | `{ diagnosisMessage? }`                  |
| `BAD_REQUEST`       | HTTP 400.                                                                                                                                                                                                                 | none                                     |
| `UNAUTHORIZED`      | HTTP 401.                                                                                                                                                                                                                 | none                                     |
| `FORBIDDEN`         | HTTP 403.                                                                                                                                                                                                                 | none                                     |
| `NOT_FOUND`         | HTTP 404.                                                                                                                                                                                                                 | none                                     |
| `TOO_MANY_REQUESTS` | HTTP 429.                                                                                                                                                                                                                 | none                                     |
| `SERVER_ERROR`      | HTTP 500 to 599.                                                                                                                                                                                                          | none                                     |
| `REQUEST_FAILED`    | Any other HTTP, network or API error; its code and trace ID are on `cause`. For an [execution method](#execution), the execution engine can't be loaded, paused or store the **Execution**, with core's error as `cause`. | none                                     |
| `BRIDGE_LIMIT`      | A swap's input amount is outside its limits.                                                                                                                                                                              | `{ swap, limit, limitValue, exclusive }` |
| `UNKNOWN_SLIPPAGE`  | Rango failed to compute a swap's slippage.                                                                                                                                                                                | none                                     |
| `CLIENT_PAUSED`     | `execute()` of a new **Route** in a paused client.                                                                                                                                                                        | none                                     |

The metadata types are exported, and their fields are documented in your editor.

## Warnings

A warning means the result is usable but risky. Every warning that applies is returned, never thrown, as `{ type, message, metadata }` (`SdkWarning`): switch on `type` to read `metadata`. `message` is an English sentence for developers, like `Error.message`; a UI words and translates a warning from `type` and `metadata`.

| Type                             | Raised when                                                     | `metadata`                                                                   | Returned by                                               |
| -------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `HIGH_VALUE_LOSS`                | The price impact matches a high value loss threshold.           | `inputUsdValue`, `outputUsdValue`, `priceImpact`, `totalFee`, `warningLevel` | all                                                       |
| `UNKNOWN_PRICE`                  | The input's or output's USD value is unknown.                   | none                                                                         | all                                                       |
| `INSUFFICIENT_SLIPPAGE`          | The slippage is below what a swap recommends.                   | `recommendedSlippages`, `minRequiredSlippage`                                | all                                                       |
| `HIGH_SLIPPAGE`                  | The slippage is above the high slippage and the minimum needed. | `slippage`                                                                   | all                                                       |
| `HIGH_FEE`                       | The total fee is at or above the high fee.                      | `totalFee`                                                                   | all                                                       |
| `LONG_DURATION`                  | The estimated time is at or above the long duration.            | `estimatedTimeInSeconds`                                                     | all                                                       |
| `INSUFFICIENT_BALANCE`           | A wallet lacks an asset (one warning per asset).                | `blockchain`, `address`, `asset`, `required`, `current`, `reason`            | `confirm()`, `quote()` unless `checkPrerequisites: false` |
| `EXCESSIVE_OUTPUT_AMOUNT_CHANGE` | The confirmed output is worth much less than the **Quote**'s.   | `usdValueChange`, `percentageChange`                                         | `confirm()`                                               |

The [thresholds](#thresholds) are fixed; how each figure is computed is in the JSDoc of `SdkWarningMetadata` and the `…WarningMetadata` types, in your editor.

```ts
function describe(warning: SdkWarning): string {
  switch (warning.type) {
    case 'HIGH_VALUE_LOSS':
      return `You lose ${(-warning.metadata.priceImpact).toFixed(2)}% of the value.`
    case 'INSUFFICIENT_BALANCE':
      return `Top up ${warning.metadata.asset.symbol} on ${warning.metadata.blockchain}.`
    default:
      return warning.type
  }
}
```

## Thresholds

| Threshold               | Value                                                      | Used by                                            |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Price impact levels     | `low` at `-3`, `high` at `-10`                             | `HIGH_VALUE_LOSS`'s `warningLevel` (%)             |
| High value loss         | `-10` on an input of 400 USD or more, `-5` on 1000 or more | `HIGH_VALUE_LOSS` (price impact %)                 |
| Excessive output change | `-1` on an input of 1000 USD or more, `-2` on 500 or more  | `EXCESSIVE_OUTPUT_AMOUNT_CHANGE` (output change %) |
| High slippage           | `5`                                                        | `HIGH_SLIPPAGE` (%)                                |
| High fee                | `30`                                                       | `HIGH_FEE` (USD)                                   |
| Long duration           | `900`                                                      | `LONG_DURATION` (seconds)                          |

The values are fixed and can't be configured.

## Refreshing, retries and timeouts

- **Refreshing:** call `confirm()` again with the same request ID; if the **Quote** is stale, call `quotes()` again.
- **Retries:** the SDK never retries; catch the error and call again, for example on `REQUEST_FAILED`.
- **Timeouts:** none built in. Pass `signal: AbortSignal.timeout(10_000)`; it throws `REQUEST_CANCELED`.
