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

```ts
import { RangoClient } from '@rango-dev/sdk'

const client = new RangoClient({
  apiKey: 'YOUR_API_KEY',
  // Optional, defaults to https://api.rango.exchange
  baseUrl: 'https://api.rango.exchange',
})
```

The API key and base URL can't be changed after the client is created. The package keeps no client of its own. To share one, export it from a module of yours and import it where you need it:

```ts
// rango.ts
import { RangoClient } from '@rango-dev/sdk'

export const client = new RangoClient({ apiKey: 'YOUR_API_KEY' })
```

```ts
// anywhere else
import { client } from './rango.js'
```
