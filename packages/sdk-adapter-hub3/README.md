# Rango Exchange SDK hub3 adapters

[![npm version](https://badge.fury.io/js/@rango-dev%2Fsdk-adapter-hub3.svg)](https://badge.fury.io/js/@rango-dev%2Fsdk-adapter-hub3)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk-adapter-hub3/LICENSE)

If your wallets run on hub3 (`@hub3js/*`), build the wallet your [`@rango-dev/sdk`](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md) `getWallet` answers for each namespace (see [Wallet port](https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port)) from a hub3 provider with its adapter instead of writing it.

## Install

```shell
yarn add @rango-dev/sdk-adapter-hub3 # or: npm install @rango-dev/sdk-adapter-hub3
```

`@rango-dev/sdk`, `@hub3js/core` and `caip` are peer dependencies. The other `@hub3js/*` packages are optional peer dependencies: install the Install column of each adapter you import. Each import path loads only its own.

| Namespace  | Import from                            | Adapter               | Reads the hub3 namespace | Install            |
| ---------- | -------------------------------------- | --------------------- | ------------------------ | ------------------ |
| `evm`      | `@rango-dev/sdk-adapter-hub3/evm`      | `hub3EvmAdapter`      | `evm`                    | `@hub3js/evm`      |
| `solana`   | `@rango-dev/sdk-adapter-hub3/solana`   | `hub3SolanaAdapter`   | `solana`                 | `@hub3js/solana`   |
| `starknet` | `@rango-dev/sdk-adapter-hub3/starknet` | `hub3StarknetAdapter` | `starknet`               | `@hub3js/starknet` |
| `ton`      | `@rango-dev/sdk-adapter-hub3/ton`      | `hub3TonAdapter`      | `ton`                    | `@hub3js/tvm`      |
| `sui`      | `@rango-dev/sdk-adapter-hub3/sui`      | `hub3SuiAdapter`      | `sui`                    | `@hub3js/sui`      |
| `bip122`   | `@rango-dev/sdk-adapter-hub3/bip122`   | `hub3Bip122Adapter`   | `utxo`                   | `@hub3js/bip122`   |

## Usage

Each adapter takes the provider `hub.get(providerId)` answers, which is `undefined` for an unknown ID, and each namespace's wallet may come from a different provider, such as the one for the queried `walletId`:

```ts
import type { GetWallet } from '@rango-dev/sdk'
import type { Hub } from '@hub3js/core'

import { hub3EvmAdapter } from '@rango-dev/sdk-adapter-hub3/evm'

function getWalletOf(hub: Hub): GetWallet {
  return ({ namespace, walletId }) => {
    const provider = hub.get(walletId)
    if (provider === undefined) return undefined
    // One EVM wallet for every EVM blockchain, Hyperliquid included.
    if (namespace === 'evm') return hub3EvmAdapter(provider)
    return undefined
  }
}
```

The other adapters answer their own **Namespace** the same way:

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

`bip122` also takes the UTXO blockchain it serves, so answer one for the blockchain `getWallet` is asked for:

```ts
import { hub3Bip122Adapter } from '@rango-dev/sdk-adapter-hub3/bip122'
// In `getWallet`, for `namespace` `bip122` and a `blockchain` such as `BTC` or `LTC`:
const bip122 = hub3Bip122Adapter(provider, blockchain)
```

- An adapter never connects: connect the wallet through hub3, or the **Execution** is `BLOCKED` `NOT_CONNECTED`.
- An adapter stays bound to its provider. `getWallet` is called on every use, so to change wallets, answer new adapters from it.
- A user rejection in the wallet fails with `REJECTED_BY_USER`.
- `bip122` answers the provider's account on the blockchain it was built for, which is `BTC`, `LTC`, `DOGE`, `BCH` or `ZCASH`. Answer each adapter for its own blockchain only: for another, its address doesn't match the **Route**'s, so the **Execution** is `BLOCKED` `ACCOUNT_MISMATCH` and nothing is signed.
- `evm` adds a chain the wallet doesn't know, so the user may be asked to add the network.
- Hyperliquid has no adapter of its own: answer `hub3EvmAdapter` for `evm` when `getWallet` is asked with the blockchain `HYPERLIQUID`. It signs Hyperliquid actions with the provider's EVM signer, which needs `signTypedData`, or the action fails with `UNEXPECTED_BEHAVIOUR`.
