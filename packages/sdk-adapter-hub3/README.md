# Rango Exchange SDK hub3 adapters

[![npm version](https://badge.fury.io/js/@rango-dev%2Fsdk-adapter-hub3.svg)](https://badge.fury.io/js/@rango-dev%2Fsdk-adapter-hub3)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk-adapter-hub3/LICENSE)

If your wallets run on hub3 (`@hub3js/*`), build each [`@rango-dev/sdk`](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md) [Wallet port](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port) entry from a hub3 provider with its adapter instead of writing it.

## Install

```shell
yarn add @rango-dev/sdk-adapter-hub3 # or: npm install @rango-dev/sdk-adapter-hub3
```

`@rango-dev/sdk` is a peer dependency. The `@hub3js/*` packages, `caip`, `xrpl` and `@stellar/stellar-sdk` are optional peer dependencies: install `@hub3js/core` and `caip`, plus the Install column of each adapter you import. Each import path loads only its own.

| Namespace  | Import from                            | Adapter               | Reads the hub3 namespace | Install                                   |
| ---------- | -------------------------------------- | --------------------- | ------------------------ | ----------------------------------------- |
| `evm`      | `@rango-dev/sdk-adapter-hub3/evm`      | `hub3EvmAdapter`      | `evm`                    | `@hub3js/evm`                             |
| `solana`   | `@rango-dev/sdk-adapter-hub3/solana`   | `hub3SolanaAdapter`   | `solana`                 | `@hub3js/solana`                          |
| `starknet` | `@rango-dev/sdk-adapter-hub3/starknet` | `hub3StarknetAdapter` | `starknet`               | `@hub3js/starknet`                        |
| `ton`      | `@rango-dev/sdk-adapter-hub3/ton`      | `hub3TonAdapter`      | `ton`                    | `@hub3js/tvm`                             |
| `sui`      | `@rango-dev/sdk-adapter-hub3/sui`      | `hub3SuiAdapter`      | `sui`                    | `@hub3js/sui`                             |
| `bip122`   | `@rango-dev/sdk-adapter-hub3/bip122`   | `hub3Bip122Adapter`   | `utxo`                   | `@hub3js/bip122`                          |
| `tron`     | `@rango-dev/sdk-adapter-hub3/tron`     | `hub3TronAdapter`     | `tron`                   | `@hub3js/tron`                            |
| `xrpl`     | `@rango-dev/sdk-adapter-hub3/xrpl`     | `hub3XrplAdapter`     | `xrpl`                   | `@hub3js/xrpl`, `xrpl`                    |
| `stellar`  | `@rango-dev/sdk-adapter-hub3/stellar`  | `hub3StellarAdapter`  | `stellar`                | `@hub3js/stellar`, `@stellar/stellar-sdk` |

## Usage

Each adapter takes the provider `hub.get(providerId)` answers, which is `undefined` for an unknown ID, and each entry may come from a different provider:

```ts
import type { WalletPort } from '@rango-dev/sdk'
import type { Hub } from '@hub3js/core'

import { hub3EvmAdapter } from '@rango-dev/sdk-adapter-hub3/evm'

function walletOf(hub: Hub, providerId: string): WalletPort {
  const provider = hub.get(providerId)
  if (provider === undefined) throw new Error(`No hub3 provider ${providerId}`)
  return {
    // One EVM wallet for every EVM blockchain, Hyperliquid included.
    evm: hub3EvmAdapter(provider),
  }
}
```

The other adapters go under their own **Namespace** the same way:

```ts
import { hub3SolanaAdapter } from '@rango-dev/sdk-adapter-hub3/solana'
const solana = hub3SolanaAdapter(provider)
```

```ts
import { hub3StarknetAdapter } from '@rango-dev/sdk-adapter-hub3/starknet'
const starknet = hub3StarknetAdapter(provider)
```

```ts
import { hub3TonAdapter } from '@rango-dev/sdk-adapter-hub3/ton'
const ton = hub3TonAdapter(provider)
```

```ts
import { hub3SuiAdapter } from '@rango-dev/sdk-adapter-hub3/sui'
const sui = hub3SuiAdapter(provider)
```

```ts
import { hub3TronAdapter } from '@rango-dev/sdk-adapter-hub3/tron'
const tron = hub3TronAdapter(provider)
```

```ts
import { hub3XrplAdapter } from '@rango-dev/sdk-adapter-hub3/xrpl'
const xrpl = hub3XrplAdapter(provider)
```

```ts
import { hub3StellarAdapter } from '@rango-dev/sdk-adapter-hub3/stellar'
const stellar = hub3StellarAdapter(provider)
```

`bip122` also takes the UTXO blockchain it serves, so build one per blockchain inside a `bip122` map:

```ts
import { hub3Bip122Adapter } from '@rango-dev/sdk-adapter-hub3/bip122'
const bip122 = {
  BTC: hub3Bip122Adapter(provider, 'BTC'),
  LTC: hub3Bip122Adapter(provider, 'LTC'),
}
```

- An adapter never connects: connect the wallet through hub3, or the **Execution** is `BLOCKED` `NOT_CONNECTED`.
- An adapter stays bound to its provider. To change wallets, give new adapters in [`beforeResume`](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#beforeresume).
- A user rejection in the wallet fails with `REJECTED_BY_USER`.
- `bip122` answers the provider's account on the blockchain it was built for, which is `BTC`, `LTC`, `DOGE`, `BCH` or `ZCASH`. Put each adapter under its own blockchain: under another, its address doesn't match the **Route**'s, so the **Execution** is `BLOCKED` `ACCOUNT_MISMATCH` and nothing is signed.
- `evm` adds a chain the wallet doesn't know, so the user may be asked to add the network.
- Hyperliquid has no adapter of its own: give `hub3EvmAdapter` under `evm`'s `HYPERLIQUID` key, or as the one or `default` `evm` wallet. It signs Hyperliquid actions with the provider's EVM signer, which needs `signTypedData`, or the action fails with `UNEXPECTED_BEHAVIOUR`.
