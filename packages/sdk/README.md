# Rango Exchange SDK

[![npm version](https://badge.fury.io/js/@rango-dev%2Fsdk.svg)](https://badge.fury.io/js/@rango-dev%2Fsdk)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/master/packages/sdk/LICENSE)

> This package is under development. It provides the client configuration only; API methods come later.

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
