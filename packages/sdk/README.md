# Rango Exchange SDK

[![npm version](https://badge.fury.io/js/@rango-dev%2Fsdk.svg)](https://badge.fury.io/js/@rango-dev%2Fsdk)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/master/packages/sdk/LICENSE)

> This package is under development. It provides the client configuration and `quotes()`; more API methods come later.

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
- `warnings`, currently always `[]`.
- `error`, currently always `null`.

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
