import type { Bip122Wallet } from '../../mod.js'
import type { Bip122NetworkName, UtxoActions } from '@hub3js/bip122'
import type { Provider } from '@hub3js/core'
import type { AccountId } from 'caip'

import { NETWORKS } from '@hub3js/bip122'
import { TransactionType } from 'rango-types'

import { tryRunAndRejectWithSignerError } from './errors.js'
import {
  findSigner,
  getNamespace,
  getParsedAccounts,
  getProvider,
} from './utils.js'

export type Bip122Provider = Provider<{ utxo: UtxoActions }>
// Keyed by hub3's UTXO blockchain name, such as `BTC` or `LTC`; leave out the blockchains the Host doesn't use.
export type Bip122Providers = Partial<Record<Bip122NetworkName, Bip122Provider>>

const NAMESPACE_KEY = 'utxo'

// The BIP-122 **WalletPort** entry of a hub3 **Host**: one provider per blockchain, signing with its account on that blockchain.
export function hub3Bip122Adapter(providers: Bip122Providers): Bip122Wallet {
  return {
    async getAccount({ blockchain }) {
      return (
        getParsedAccounts(
          getProvider(providers, blockchain).get(NAMESPACE_KEY),
        ).find(buildIsAccountOnBlockchain(blockchain))?.address ?? null
      )
    },
    async sign({ blockchain, tx }) {
      return tryRunAndRejectWithSignerError(async () => {
        const provider = getProvider(providers, blockchain)
        const address =
          getParsedAccounts(getNamespace(provider, NAMESPACE_KEY)).find(
            buildIsAccountOnBlockchain(blockchain),
          )?.address ?? null
        if (address === null) {
          throw new Error(
            `The hub3 provider "${provider.id}" has no connected "${NAMESPACE_KEY}" account to sign with.`,
          )
        }
        const signer = await findSigner<{ utxo: UtxoActions }, typeof tx>(
          provider,
          TransactionType.TRANSFER,
        )
        const { hash, response } = await signer.signAndSendTx(tx, address, null)
        return { hash, response }
      })
    },
  }
}

// `NETWORKS` is a plain object, so only its own keys count: an inherited one such as `toString` is no blockchain.
function buildIsAccountOnBlockchain(
  blockchain: string,
): (account: AccountId) => boolean {
  const references: Readonly<Record<string, string>> = NETWORKS
  const reference = Object.hasOwn(references, blockchain)
    ? references[blockchain]
    : undefined
  return (account) =>
    reference !== undefined && account.chainId.reference === reference
}
