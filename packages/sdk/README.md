# Rango Exchange SDK

[![npm version](https://badge.fury.io/js/@rango-dev%2Fsdk.svg)](https://badge.fury.io/js/@rango-dev%2Fsdk)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/master/packages/sdk/LICENSE)

> This package is under development. It provides the client configuration, `quotes()`, `confirm()` and `quote()`; more API methods come later.

## Installation

```shell
  yarn add @rango-dev/sdk
  # or
  npm install @rango-dev/sdk --save
```

## Usage

### Create the default client

Call `createClient` once, usually at startup. It creates the default client and returns it.

```ts
import { createClient } from '@rango-dev/sdk'

export const client = createClient({
  apiKey: 'YOUR_API_KEY',
  // Optional, defaults to https://api.rango.exchange
  baseUrl: 'https://api.rango.exchange',
  // Optional
  affiliate: {
    ref: 'YOUR_REFERRAL_CODE',
    percent: 0.1,
    wallets: { ETH: '0x...' },
  },
  // Optional, see "Thresholds"
  validation: { highSlippage: 3, slippage: { max: 10 } },
})
```

The API key and base URL can't be changed after the client is created. Calling `createClient` a second time throws.

### Get the default client

Any other module can reach the same client with `getClient()`, without importing the module that created it.

```ts
import { getClient } from '@rango-dev/sdk'

const client = getClient()
```

`getClient()` throws if it's called before `createClient`.

### Replace the affiliate settings

`setAffiliate` replaces the affiliate settings as a whole. Fields from the old settings are not kept.

```ts
getClient().setAffiliate({ ref: 'ANOTHER_REFERRAL_CODE' })
```

### Standalone clients

If you need more than one client, or don't want a global, create a standalone client. A standalone client is never registered as the default, so it doesn't change what `getClient()` returns.

```ts
import { RangoClient } from '@rango-dev/sdk'

const client = new RangoClient({ apiKey: 'YOUR_API_KEY' })
```

### Hot module reloading

With hot module reloading, a reload can run the module that calls `createClient` again, and that call throws. Call `createClient` in a module that rarely changes, such as your app's entry or a dedicated config module.

## Quotes

`quotes()` returns every available **Quote** for swapping an amount of one asset into another. It doesn't need a connected wallet, so you can use it to show prices before the user connects one.

```ts
import { getClient, QuotesError } from '@rango-dev/sdk'

const controller = new AbortController()

try {
  const quotes = await getClient().quotes(
    {
      from: { blockchain: 'ETH', symbol: 'ETH', address: null },
      to: {
        blockchain: 'BSC',
        symbol: 'USDC',
        address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      },
      amount: '1',
      // Optional
      slippage: '1.0',
    },
    { signal: controller.signal },
  )
} catch (error) {
  if (error instanceof QuotesError && error.type === 'INVALID_INPUT') {
    console.log(`Check the ${error.metadata.field}: ${error.metadata.reason}`)
  }
  if (error instanceof QuotesError && error.type === 'NO_ROUTE') {
    console.log('No route exists for this swap.', error.metadata.diagnosisMessage)
  }
  if (error instanceof QuotesError && error.type === 'REQUEST_FAILED') {
    console.error(error.metadata.errorCode, error.metadata.traceId)
  }
}
```

The request is a `QuotesRequest`: the source and destination assets, the amount, and optional routing options such as `slippage`, `swappers` or `blockchains`. It has no affiliate fields. The client adds them from its current affiliate settings on every call, so a `setAffiliate()` applies to the next call.

When no route exists, `quotes()` throws a `QuotesError` of type `NO_ROUTE`, the same way [`quote()`](#quote) does. It never resolves to an empty list.

### The Quote shape

Each **Quote** has:

- `requestId`, `outputAmount`, `resultType`, `swaps`, `scores`, `tags` and `missingBlockchains`, from the routing result.
- `from`, `to`, `requestAmount`, `slippage` and `routingOptions`: the request the **Quote** came from. `routingOptions` holds the other routing options you sent.
- `warnings`: the [warnings](#warnings) that apply to this **Quote**: `HIGH_VALUE_LOSS`, `UNKNOWN_PRICE`, `INSUFFICIENT_SLIPPAGE` and `HIGH_SLIPPAGE`. Use them to badge risky options before the user picks one.
- `error`: `null` when the **Quote** is usable, or a `QuoteError` (not thrown) when it isn't. The type is `NO_ROUTE` for a **Quote** with no swaps (without a `diagnosisMessage`), or `AMOUNT_OUT_OF_RANGE` or `SLIPPAGE_TOO_LOW`, with the same `metadata` that [`quote()`](#quote) would throw. Disable or hide a **Quote** that has an error: [`confirm()`](#confirm) refuses it. One bad **Quote** never makes `quotes()` fail.

### Errors

`quotes()` throws a `QuotesError` when the input is invalid, no route exists or the request itself fails. Its `type` is one of:

- `INVALID_INPUT`: the request failed an [input check](#input-checks). No request was sent. `metadata` holds `field` and `reason`.
- `CANCELED`: the `signal` you passed aborted the request.
- `NO_ROUTE`: no route exists. The server answered HTTP 400, or returned no results. `metadata.diagnosisMessage` holds the server's reason when it gives one: the HTTP 400 body's error message, or the response's first diagnosis message.
- `REQUEST_FAILED`: any other HTTP or network failure, or the API answered with an error. The HTTP status stays on `cause`. `metadata` holds `errorCode` and `traceId`. Share the trace ID with Rango support when you report a problem.

`metadata` narrows on `type`. This narrowing needs TypeScript 5.3 or later. On older versions, `instanceof QuotesError` doesn't narrow `metadata`, and it stays typed as `any`. `cause` holds the underlying error, or the API response when the API answered with an error.

```ts
if (error instanceof QuotesError) {
  if (error.type === 'CANCELED') {
    // A newer request replaced this one. Ignore it.
  }
}
```

The `Asset`, `QuotesRequest`, `Quote`, `SwapResult` and `BlockchainValidationStatus` types are all exported from `@rango-dev/sdk`.

## Input checks

`quote()` and `quotes()` check the request before sending it, so bad input is reported as an input error rather than a server failure. A failed check throws the method's own error class (`QuoteError` or `QuotesError`) with type `INVALID_INPUT`, and no request is sent. `metadata.field` names the input that is wrong, and `metadata.reason` says why.

The checks run in this order, and the first to fail is thrown:

| Check | `field` | `reason` |
| --- | --- | --- |
| `from` and `to` are present | `from` or `to` | `MISSING` |
| `from` and `to` are not the same asset, compared by blockchain, symbol and address | `to` | `SAME_ASSET` |
| `amount` is a number | `amount` | `NOT_A_NUMBER` |
| `amount` is greater than 0 | `amount` | `NOT_POSITIVE` |
| `slippage`, when given, is a number | `slippage` | `NOT_A_NUMBER` |
| `slippage`, when given, is greater than 0 and at most `validation.slippage.max` (default 30) | `slippage` | `OUT_OF_RANGE` |

A missing `slippage` isn't checked. The lower bound of the slippage is fixed, and the maximum is a [threshold](#thresholds) you can change.

[`confirm()`](#confirm) checks the `destination` instead, against the destination blockchain's address patterns. There `field` is `destination`, and `reason` is `PATTERN_MISMATCH` or `NO_ADDRESS_PATTERNS`.

```ts
if (error instanceof QuoteError && error.type === 'INVALID_INPUT') {
  switch (error.metadata.field) {
    case 'amount':
      // Highlight the amount field.
      break
    case 'slippage':
      // Highlight the slippage setting.
      break
  }
}
```

The `InvalidInputMetadata`, `InvalidInputField` and `InvalidInputReason` types are exported from `@rango-dev/sdk`.

## Confirm

`confirm()` turns the **Quote** the user chose into a **Route** for their wallets. This is the second step of the quotes → confirm flow: call `quotes()` without wallets to show the options, let the user choose one, then confirm it once their wallets are connected. The server checks the **Route** against the wallets' balances.

```ts
import { ConfirmError, getClient } from '@rango-dev/sdk'

const client = getClient()
const quotes = await client.quotes(request)
// Let the user choose. A Quote with an error can't be confirmed.
const chosen = quotes.find((quote) => !quote.error)

if (chosen) {
  try {
    const { route, warnings } = await client.confirm(
      chosen,
      {
        // Map of blockchain to the user's selected address
        selectedWallets: { ETH: '0x...', BSC: '0x...' },
        // Optional: send the output to another address
        destination: '0x...',
        // Required with a destination: the blockchains meta you already have
        blockchains,
      },
      { signal: controller.signal },
    )
  } catch (error) {
    if (error instanceof ConfirmError && error.type === 'NO_ROUTE') {
      // The route is no longer available. Fetch the quotes again.
    }
  }
}
```

The confirm request carries the **Quote**'s request ID, `selectedWallets` and the optional `destination`. Which blockchains need a wallet in `selectedWallets` is up to your app: `confirm()` doesn't check `selectedWallets`. It has no affiliate fields: `quotes()` already applied the affiliate settings. The **Route**'s `slippage` comes from the **Quote**.

### The destination

A `destination` sends the output to an address other than the user's wallet. Before sending the request, `confirm()` checks it against the `addressPatterns` of the entry in `blockchains` whose `name` is the **Quote**'s destination blockchain (`quote.to.blockchain`). It must match at least one of them.

- `blockchains` is a list of `BlockchainMeta`, such as the blockchains from the Rango meta API. The SDK never fetches meta itself. TypeScript requires `blockchains` whenever you set `destination`.
- A destination that matches none of the patterns throws `INVALID_INPUT` with `PATTERN_MISMATCH`.
- If the destination blockchain is missing from `blockchains`, or has no address patterns, `confirm()` throws `INVALID_INPUT` with `NO_ADDRESS_PATTERNS`, so an unchecked destination is never sent.
- An empty `destination` (`''`), such as an empty text field, counts as no destination. It's sent as `undefined` and doesn't need `blockchains`.

`confirm()` checks in this order: the **Quote**'s own `error`, then the destination, and only then sends the request. It doesn't check the **Quote**'s fields again.

### The result

`confirm()` resolves to `{ route, warnings }`, the same shape as [`quote()`](#quote). `warnings` lists every [warning](#warnings) that `quote()` would return, including `INSUFFICIENT_BALANCE`, plus `EXCESSIVE_OUTPUT_CHANGE` when the confirmed output is worth much less than the **Quote** you passed in.

### Errors

`confirm()` throws a `ConfirmError`. It has the same `type` values, `metadata` types and mapping order as the `QuoteError` thrown by [`quote()`](#quote), except that its `INVALID_INPUT` comes from the [destination check](#the-destination), with one addition: a confirm response with `ok: false` is also `REQUEST_FAILED`. Its `metadata.errorCode` is a number, or `null` when the API gives no numeric code.

If the **Quote** you pass already has an `error`, `confirm()` throws right away and sends no request. The `ConfirmError` has the same `type` and `metadata` as the **Quote**'s error, and keeps it as `cause`. This matches the Rango widget, which disables its swap button for such a **Quote**. If you think the **Quote** is stale, fetch the quotes again.

`ConfirmError` is its own class, so `instanceof` tells you which step failed. As with `QuoteError`, `metadata` narrows on `type` (TypeScript 5.3 or later), and `cause` holds the underlying error or the API response.

```ts
if (error instanceof ConfirmError) {
  switch (error.type) {
    case 'CANCELED':
      // A newer request replaced this one. Ignore it.
      break
    case 'REQUEST_FAILED':
      console.error(error.metadata.errorCode, error.metadata.traceId)
      break
  }
}
```

The `ConfirmRequest`, `ConfirmResult`, `ConfirmError` and `BlockchainMeta` types, and `ConfirmErrorType` and `ConfirmErrorMetadata`, are exported from `@rango-dev/sdk`.

## Quote

`quote()` returns the best **Route** for a swap in one step, for when you already have the user's wallets and don't need to show a list. Despite its name, it returns a **Route**, not a **Quote**: a swap plan tied to the user's wallets and checked by the server against their balances, ready to be executed.

```ts
import { getClient, QuoteError } from '@rango-dev/sdk'

const controller = new AbortController()

try {
  const { route, warnings } = await getClient().quote(
    {
      from: { blockchain: 'ETH', symbol: 'ETH', address: null },
      to: {
        blockchain: 'BSC',
        symbol: 'USDC',
        address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      },
      amount: '1',
      // Map of blockchain to the user's selected address
      selectedWallets: { ETH: '0x...', BSC: '0x...' },
      // Optional
      slippage: '1.0',
      destination: '0x...',
    },
    { signal: controller.signal },
  )
} catch (error) {
  if (error instanceof QuoteError && error.type === 'NO_ROUTE') {
    console.log(error.metadata.diagnosisMessage)
  }
}
```

The request is a `QuoteRequest`: a `QuotesRequest` plus `selectedWallets` and the optional `destination`, `forceExecution` and `maxLength`. As with `quotes()`, it has no affiliate fields and the client adds them from its current affiliate settings. It also has no `checkPrerequisites`: `quote()` always asks the server to check balances and prerequisites.

`quote()` resolves to `{ route, warnings }`. `warnings` lists every [warning](#warnings) that applies to the **Route**, including `INSUFFICIENT_BALANCE`. Show them before the user signs.

### The Route shape

A **Route** has:

- `requestId`, `from`, `to`, `requestAmount`, `outputAmount`, `resultType`, `swaps` and `validationStatus`, from the routing response. `validationStatus` is the server's balance check for each selected wallet.
- `selectedWallets`, `destination` and `slippage`, from the request.

### Errors

`quote()` throws a `QuoteError` when the input is invalid or there's no usable **Route**. Its `type` is one of:

- `INVALID_INPUT`: the request failed an [input check](#input-checks). No request was sent. `metadata` holds `field` and `reason`.
- `CANCELED`: the `signal` you passed aborted the request.
- `NO_ROUTE`: the server found no route. `metadata.diagnosisMessage` holds the server's reason, when it gives one.
- `AMOUNT_OUT_OF_RANGE`: a swap's input amount is outside its limits. `metadata` holds `swapIndex`, `swap`, `min`, `max` and `restrictionType`. With `EXCLUSIVE`, an amount equal to `min` or `max` is out of range. With `INCLUSIVE`, it's in range. `min` or `max` is `null` when that side has no limit.
- `SLIPPAGE_TOO_LOW`: the slippage is too low for a swap to go through. `metadata.recommendedSlippages` lists `{ swapIndex, slippage }` for each swap that reported a slippage error, and `metadata.minRequiredSlippage` is the highest slippage recommended by any swap in the route.
- `REQUEST_FAILED`: an HTTP or network failure, or the API answered with an error. `metadata` holds `errorCode` and `traceId`.

When more than one applies, the first match in this order wins:

1. The input failed a check: `INVALID_INPUT`, and no request is sent.
2. The request was aborted: `CANCELED`.
3. HTTP 400: `NO_ROUTE`.
4. Any other HTTP or network failure: `REQUEST_FAILED`.
5. The API answered with an error: `REQUEST_FAILED`.
6. The result is empty or has no swaps: `NO_ROUTE`.
7. A swap's input amount is out of range: `AMOUNT_OUT_OF_RANGE`.
8. A swap reported a slippage error: `SLIPPAGE_TOO_LOW`.

As with `QuotesError`, `metadata` narrows on `type` (TypeScript 5.3 or later), and `cause` holds the underlying error or the API response.

```ts
if (error instanceof QuoteError) {
  switch (error.type) {
    case 'AMOUNT_OUT_OF_RANGE':
      console.log(`Enter an amount between ${error.metadata.min} and ${error.metadata.max}.`)
      break
    case 'SLIPPAGE_TOO_LOW':
      console.log(`Set slippage to at least ${error.metadata.minRequiredSlippage}%.`)
      break
  }
}
```

The `QuoteRequest`, `Route` and `QuoteError` types, and the metadata type for each error type, are exported from `@rango-dev/sdk`.

## Warnings

A warning means the result is usable but risky. Warnings are returned, never thrown: each **Quote** from `quotes()` has a `warnings` list, and `quote()` and `confirm()` resolve to `{ route, warnings }`. Every warning that applies is returned, not just the most important one, so you choose which to show. Warnings carry numbers, not display text, so you word and translate them yourself.

Each warning is an object discriminated by `kind`:

- `HIGH_VALUE_LOSS`: the user loses a large share of the value. It has `usdIn`, `usdOut`, `priceImpact` (a negative percentage, such as `-12.5`), `totalFee` (the USD value of the fees not taken from the output) and `level` (`low` or `high`). The USD values come from the assets' USD prices and each fee's own `price`. It's raised when an entry of the `highValueLoss` thresholds matches: the price impact is at or below its `threshold` and the input value is at least its `minInput`. `level` is `high` when the price impact is at or below `priceImpact.high`, and `low` otherwise, including when the price impact is above `priceImpact.low`. An output worth 0 USD is a price impact of `-100`.
- `UNKNOWN_PRICE`: the USD value of the input or the output can't be computed, or the input is worth 0 USD, so no value loss can be checked.
- `INSUFFICIENT_SLIPPAGE`: the requested slippage is below what a swap recommends, but no swap reported a slippage error. `recommendedSlippages` lists `{ swapIndex, slippage }` for each swap that recommends a slippage above the requested one, and `minRequired` is the highest slippage recommended by any swap.
- `HIGH_SLIPPAGE`: the requested `slippage` is above the `highSlippage` threshold and higher than the minimum required.
- `INSUFFICIENT_BALANCE`: a wallet doesn't hold enough of an asset. There is one warning per asset that is short, with `blockchain`, `address`, `asset`, `required`, `current` and `reason` (`FEE`, `INPUT_ASSET` or `FEE_AND_INPUT_ASSET`). `required` and `current` are machine-readable amounts, `{ amount, decimals }`. It comes from the server's balance check, so only `quote()` and `confirm()` return it, not `quotes()`.
- `EXCESSIVE_OUTPUT_CHANGE`: the confirmed output is worth much less than the **Quote** passed to `confirm()`. It has `usdValueChange` (the confirmed output's USD value minus the **Quote**'s) and `percentageChange` (that change as a percentage of the **Quote**'s output value, such as `-2.5`). It's raised when an entry of the `excessiveOutputChange` thresholds matches: the percentage change is at or below its `threshold` and the input value is at least its `minInput`. It's skipped when a USD value can't be computed. Only `confirm()` returns it.

Both slippage warnings are skipped when the request has no `slippage`.

```ts
import type { RouteWarning } from '@rango-dev/sdk'

function describe(warning: RouteWarning): string {
  switch (warning.kind) {
    case 'HIGH_VALUE_LOSS':
      return `You lose ${(-warning.priceImpact).toFixed(2)}% of the value.`
    case 'INSUFFICIENT_BALANCE':
      return `Top up ${warning.asset.symbol} on ${warning.blockchain}.`
    default:
      return warning.kind
  }
}
```

`QuoteWarning` is the union of the warnings a **Quote** can have, `RouteWarning` adds `INSUFFICIENT_BALANCE`, and `ConfirmWarning` adds `EXCESSIVE_OUTPUT_CHANGE`. Each warning type is exported on its own too, such as `HighValueLossWarning`.

### Thresholds

The warning and input thresholds default to the Rango widget's values:

| Key | Default | Used by |
| --- | --- | --- |
| `priceImpact` | `{ low: -3, high: -10 }` | The `level` of `HIGH_VALUE_LOSS`: `high` at or below `high`, `low` otherwise |
| `highValueLoss` | `[{ threshold: -10, minInput: 400 }, { threshold: -5, minInput: 1000 }]` | `HIGH_VALUE_LOSS`. `threshold` is a price impact in percent, `minInput` an input value in USD |
| `excessiveOutputChange` | `[{ threshold: -1, minInput: 1000 }, { threshold: -2, minInput: 500 }]` | `EXCESSIVE_OUTPUT_CHANGE`. `threshold` is an output change in percent, `minInput` an input value in USD |
| `highSlippage` | `5` | `HIGH_SLIPPAGE`, in percent |
| `slippage` | `{ max: 30 }` | The [input check](#input-checks) on `slippage`: `max` is the highest slippage allowed, in percent. The lower bound, greater than 0, is fixed |

Set your own on the client with `validation`, and override them for a single call with `opts.validation`. The call's values override the client's, and the client's override the defaults. Merging is per top-level key: a key you leave out keeps its value, and a key you set replaces it whole. An array you supply replaces the default array, it isn't merged with it.

```ts
import { RangoClient } from '@rango-dev/sdk'

const client = new RangoClient({
  apiKey: 'YOUR_API_KEY',
  validation: {
    highSlippage: 3,
    // Replaces both default entries
    highValueLoss: [{ threshold: -5, minInput: 100 }],
    // Allow a slippage of up to 50%
    slippage: { max: 50 },
  },
})

// For this call only: highSlippage is 10, highValueLoss is still the client's
const quotes = await client.quotes(request, { validation: { highSlippage: 10 } })
```

The thresholds can't be changed after the client is created. The `ValidationThresholds` type describes a full set, and `ValidationConfig` a partial one.

## Refreshing, retries and timeouts

**Refreshing a Route.** Prices and balances change. To refresh a **Route**, for example just before the user signs, keep the **Quote** it came from and call `confirm()` again with the same **Quote**. There is no `refresh()` method, and `confirm()` doesn't take a **Route**. If the **Quote** itself is stale, fetch the quotes again.

```ts
const first = await client.confirm(chosen, { selectedWallets })
// Later, before the user signs:
const refreshed = await client.confirm(chosen, { selectedWallets })
```

**Retries.** The SDK never retries a request by itself, so you stay in control of how often the API is called. To retry, catch the error and call the method again, for example on `REQUEST_FAILED` only.

**Timeouts.** The SDK has no built-in timeout. Pass `AbortSignal.timeout(ms)` as the `signal`. When the time runs out, the method throws its error class with type `CANCELED`, the same as any other abort.

```ts
const quotes = await client.quotes(request, {
  signal: AbortSignal.timeout(10_000),
})
```

To combine a timeout with your own cancellation, pass `AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])`.

**Wallets.** Working out which blockchains need a connected wallet, and so what goes in `selectedWallets`, is your app's job. The SDK doesn't check `selectedWallets`. On `quote()` and `confirm()`, the server's balance check reports what's short as `INSUFFICIENT_BALANCE` warnings.
