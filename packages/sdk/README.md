# Rango Exchange SDK

[![npm version](https://badge.fury.io/js/@rango-dev%2Fsdk.svg)](https://badge.fury.io/js/@rango-dev%2Fsdk)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/master/packages/sdk/LICENSE)

> Under development: it provides the client and `quote()`; more methods come later.

## Install

```shell
yarn add @rango-dev/sdk # or: npm install @rango-dev/sdk
```

## Usage

```ts
import { RangoClient } from '@rango-dev/sdk'

const client = new RangoClient({
  apiKey: 'YOUR_API_KEY',
  meta: { blockchains },
})
```

`meta.blockchains` is required: pass the meta API's blockchain list. `quote()` checks a set `destination` against the destination blockchain's address patterns in it. `baseUrl` defaults to `https://api.rango.exchange`.

The package keeps no client of its own. To share one, export it from a module of yours and import it where you need it:

```ts
// rango.ts
import { RangoClient } from '@rango-dev/sdk'

export const client = new RangoClient({
  apiKey: 'YOUR_API_KEY',
  meta: { blockchains },
})
```

```ts
// anywhere else
import { client } from './rango.js'
```

## Methods

`quote()` resolves to `{ data, warnings, _response }`. Build on `data`; `warnings` are the [warnings](#warnings) that apply; `_response` is the legacy API's raw response, an escape hatch (to log `traceId`, say). It takes an optional `signal` in its options, and results are plain JSON.

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

`data` is a `Route`, with the request's `selectedWallets` and `slippage` merged in. A set `destination` is checked against `to`'s blockchain in the client's `meta.blockchains`.

With `checkPrerequisites: false` the server skips the balance check: no `INSUFFICIENT_BALANCE`, and `createTransaction` may refuse the request ID.

- Throws: `INVALID_INPUT`, `REQUEST_CANCELED`, `NO_RESULT`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `SERVER_ERROR`, `REQUEST_FAILED`, `BRIDGE_LIMIT`, `UNKNOWN_SLIPPAGE`.
- Warnings: `HIGH_VALUE_LOSS`, `UNKNOWN_PRICE`, `INSUFFICIENT_SLIPPAGE`, `HIGH_SLIPPAGE`, `HIGH_FEE`, `LONG_DURATION`, `INSUFFICIENT_BALANCE`.

## Errors

Every method failure rejects with an `SdkError`. Switch on `type` to narrow `metadata` (TypeScript 5.3+); `cause` holds the transport error, or the API response for a `REQUEST_FAILED` the server reported. When a request is rejected, `message` is the response body's `error`, or `The request failed.` when there is none. An error from checking a response, such as `NO_RESULT` for a result with no swaps, `BRIDGE_LIMIT` or `UNKNOWN_SLIPPAGE`, has no `cause`.

```ts
try {
  await client.quote(request)
} catch (error) {
  if (error instanceof SdkError && error.type === 'BRIDGE_LIMIT')
    console.log(error.metadata.swap.fromAmountMaxValue)
}
```

| Type                | Thrown when                                                                                                                                 | `metadata`                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `INVALID_INPUT`     | Before any request. `to`: `SAME_ASSET`; `amount`: `NOT_A_NUMBER`, `NOT_POSITIVE`; `destination`: `PATTERN_MISMATCH`, `NO_ADDRESS_PATTERNS`. | `{ field, reason }`                      |
| `REQUEST_CANCELED`  | The `signal` aborted, including a timeout.                                                                                                  | none                                     |
| `NO_RESULT`         | No route: no result, or a result with no swaps.                                                                                             | `{ diagnosisMessage? }`                  |
| `BAD_REQUEST`       | HTTP 400.                                                                                                                                   | none                                     |
| `UNAUTHORIZED`      | HTTP 401.                                                                                                                                   | none                                     |
| `FORBIDDEN`         | HTTP 403.                                                                                                                                   | none                                     |
| `NOT_FOUND`         | HTTP 404.                                                                                                                                   | none                                     |
| `TOO_MANY_REQUESTS` | HTTP 429.                                                                                                                                   | none                                     |
| `SERVER_ERROR`      | HTTP 500 to 599.                                                                                                                            | none                                     |
| `REQUEST_FAILED`    | Any other HTTP, network or API error; its code and trace ID are on `cause`.                                                                 | none                                     |
| `BRIDGE_LIMIT`      | A swap's input amount is outside its limits.                                                                                                | `{ swap, limit, limitValue, exclusive }` |
| `UNKNOWN_SLIPPAGE`  | Rango failed to compute a swap's slippage.                                                                                                  | none                                     |

The metadata types are exported, and their fields are documented in your editor.

## Warnings

A warning means the result is usable but risky. Every warning that applies is returned, never thrown, as `{ type, message, metadata }` (`SdkWarning`): switch on `type` to read `metadata`. `message` is an English sentence for developers, like `Error.message`; a UI words and translates a warning from `type` and `metadata`.

| Type                    | Raised when                                                     | `metadata`                                                                   |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `HIGH_VALUE_LOSS`       | The price impact matches a high value loss threshold.           | `inputUsdValue`, `outputUsdValue`, `priceImpact`, `totalFee`, `warningLevel` |
| `UNKNOWN_PRICE`         | The input's or output's USD value is unknown.                   | none                                                                         |
| `INSUFFICIENT_SLIPPAGE` | The slippage is below what a swap recommends.                   | `recommendedSlippages`, `minRequiredSlippage`                                |
| `HIGH_SLIPPAGE`         | The slippage is above the high slippage and the minimum needed. | `slippage`                                                                   |
| `HIGH_FEE`              | The total fee is at or above the high fee.                      | `totalFee`                                                                   |
| `LONG_DURATION`         | The estimated time is at or above the long duration.            | `estimatedTimeInSeconds`                                                     |
| `INSUFFICIENT_BALANCE`  | A wallet lacks an asset (one warning per asset).                | `blockchain`, `address`, `asset`, `required`, `current`, `reason`            |

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

| Threshold           | Value                                                      | Used by                                |
| ------------------- | ---------------------------------------------------------- | -------------------------------------- |
| Price impact levels | `low` at `-3`, `high` at `-10`                             | `HIGH_VALUE_LOSS`'s `warningLevel` (%) |
| High value loss     | `-10` on an input of 400 USD or more, `-5` on 1000 or more | `HIGH_VALUE_LOSS` (price impact %)     |
| High slippage       | `5`                                                        | `HIGH_SLIPPAGE` (%)                    |
| High fee            | `30`                                                       | `HIGH_FEE` (USD)                       |
| Long duration       | `900`                                                      | `LONG_DURATION` (seconds)              |

The values are fixed and can't be configured.

## Retries and timeouts

- **Retries:** the SDK never retries; catch the error and call again, for example on `REQUEST_FAILED`.
- **Timeouts:** none built in. Pass `signal: AbortSignal.timeout(10_000)`; it throws `REQUEST_CANCELED`.
