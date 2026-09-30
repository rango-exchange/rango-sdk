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
  // Optional, see "Warning thresholds"
  validation: { highSlippage: 3 },
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

  if (quotes.length === 0) {
    console.log('No route exists for this swap.')
  }
} catch (error) {
  if (error instanceof QuotesError && error.type === 'REQUEST_FAILED') {
    console.error(error.metadata.errorCode, error.metadata.traceId)
  }
}
```

The request is a `QuotesRequest`: the source and destination assets, the amount, and optional routing options such as `slippage`, `swappers` or `blockchains`. It has no affiliate fields. The client adds them from its current affiliate settings on every call, so a `setAffiliate()` applies to the next call.

When no route exists, `quotes()` resolves to an empty list. It doesn't throw.

### The Quote shape

Each **Quote** has:

- `requestId`, `outputAmount`, `resultType`, `swaps`, `scores`, `tags` and `missingBlockchains`, from the routing result.
- `from`, `to`, `requestAmount`, `slippage` and `routingOptions`: the request the **Quote** came from. `routingOptions` holds the other routing options you sent.
- `warnings`: the [warnings](#warnings) that apply to this **Quote**: `HIGH_VALUE_LOSS`, `UNKNOWN_PRICE`, `INSUFFICIENT_SLIPPAGE` and `HIGH_SLIPPAGE`. Use them to badge risky options before the user picks one.
- `error`: `null` when the **Quote** is usable, or a `QuoteError` (not thrown) when it isn't. The type is `AMOUNT_OUT_OF_RANGE` or `SLIPPAGE_TOO_LOW`, with the same `metadata` that [`quote()`](#quote) would throw. Disable or hide a **Quote** that has an error: [`confirm()`](#confirm) refuses it. One bad **Quote** never makes `quotes()` fail.

### Errors

`quotes()` throws a `QuotesError` when the request itself fails. Its `type` is one of:

- `CANCELED`: the `signal` you passed aborted the request.
- `REQUEST_FAILED`: an HTTP or network failure, or the API answered with an error. `metadata` holds `errorCode` and `traceId`. Share the trace ID with Rango support when you report a problem.

`metadata` narrows on `type`. This narrowing needs TypeScript 5.3 or later. On older versions, `instanceof QuotesError` doesn't narrow `metadata`, and it stays typed as `any`. `cause` holds the underlying error, or the API response when the API answered with an error.

```ts
if (error instanceof QuotesError) {
  if (error.type === 'CANCELED') {
    // A newer request replaced this one. Ignore it.
  }
}
```

The `Asset`, `QuotesRequest`, `Quote`, `SwapResult` and `BlockchainValidationStatus` types are all exported from `@rango-dev/sdk`.

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

The confirm request carries the **Quote**'s request ID, `selectedWallets` and the optional `destination`. It has no affiliate fields: `quotes()` already applied the affiliate settings. The **Route**'s `slippage` comes from the **Quote**.

`confirm()` resolves to `{ route, warnings }`, the same shape as [`quote()`](#quote). `warnings` lists every [warning](#warnings) that `quote()` would return, including `INSUFFICIENT_BALANCE`, plus `EXCESSIVE_OUTPUT_CHANGE` when the confirmed output is worth much less than the **Quote** you passed in.

### Errors

`confirm()` throws a `ConfirmError`. It has the same `type` values, `metadata` types and mapping order as the `QuoteError` thrown by [`quote()`](#quote), with one addition: a confirm response with `ok: false` is also `REQUEST_FAILED`. Its `metadata.errorCode` is a number, or `null` when the API gives no numeric code.

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

The `ConfirmRequest`, `ConfirmResult` and `ConfirmError` types, and `ConfirmErrorType` and `ConfirmErrorMetadata`, are exported from `@rango-dev/sdk`.

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

`quote()` throws a `QuoteError` when there's no usable **Route**. Its `type` is one of:

- `CANCELED`: the `signal` you passed aborted the request.
- `NO_ROUTE`: the server found no route. `metadata.diagnosisMessage` holds the server's reason, when it gives one.
- `AMOUNT_OUT_OF_RANGE`: a swap's input amount is outside its limits. `metadata` holds `swapIndex`, `swap`, `min`, `max` and `restrictionType`. With `EXCLUSIVE`, an amount equal to `min` or `max` is out of range. With `INCLUSIVE`, it's in range. `min` or `max` is `null` when that side has no limit.
- `SLIPPAGE_TOO_LOW`: the slippage is too low for a swap to go through. `metadata.recommendedSlippages` lists `{ swapIndex, slippage }` for each swap that reported a slippage error, and `metadata.minRequiredSlippage` is the highest slippage recommended by any swap in the route.
- `REQUEST_FAILED`: an HTTP or network failure, or the API answered with an error. `metadata` holds `errorCode` and `traceId`.

When more than one applies, the first match in this order wins:

1. The request was aborted: `CANCELED`.
2. HTTP 400: `NO_ROUTE`.
3. Any other HTTP or network failure: `REQUEST_FAILED`.
4. The API answered with an error: `REQUEST_FAILED`.
5. The result is empty or has no swaps: `NO_ROUTE`.
6. A swap's input amount is out of range: `AMOUNT_OUT_OF_RANGE`.
7. A swap reported a slippage error: `SLIPPAGE_TOO_LOW`.

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

### Warning thresholds

The thresholds default to the Rango widget's values:

| Key | Default | Used by |
| --- | --- | --- |
| `priceImpact` | `{ low: -3, high: -10 }` | The `level` of `HIGH_VALUE_LOSS`: `high` at or below `high`, `low` otherwise |
| `highValueLoss` | `[{ threshold: -10, minInput: 400 }, { threshold: -5, minInput: 1000 }]` | `HIGH_VALUE_LOSS`. `threshold` is a price impact in percent, `minInput` an input value in USD |
| `excessiveOutputChange` | `[{ threshold: -1, minInput: 1000 }, { threshold: -2, minInput: 500 }]` | `EXCESSIVE_OUTPUT_CHANGE`. `threshold` is an output change in percent, `minInput` an input value in USD |
| `highSlippage` | `5` | `HIGH_SLIPPAGE`, in percent |

Set your own on the client with `validation`, and override them for a single call with `opts.validation`. The call's values override the client's, and the client's override the defaults. Merging is per top-level key: a key you leave out keeps its value, and a key you set replaces it whole. An array you supply replaces the default array, it isn't merged with it.

```ts
import { RangoClient } from '@rango-dev/sdk'

const client = new RangoClient({
  apiKey: 'YOUR_API_KEY',
  validation: {
    highSlippage: 3,
    // Replaces both default entries
    highValueLoss: [{ threshold: -5, minInput: 100 }],
  },
})

// For this call only: highSlippage is 10, highValueLoss is still the client's
const quotes = await client.quotes(request, { validation: { highSlippage: 10 } })
```

The thresholds can't be changed after the client is created. The `ValidationThresholds` type describes a full set, and `ValidationConfig` a partial one.
