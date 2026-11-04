import type { Bip122Wallet } from '../../mod.js'
import type { UtxoActions } from '@hub3js/bip122'
import type { Provider } from '@hub3js/core'

import { NETWORKS } from '@hub3js/bip122'
import { TransactionType } from 'rango-types'

import { getFirstAccount } from './accounts.js'
import { getCaip10Reference } from './caip-10.js'
import { signWithFirstAccount } from './single-chain.js'

const NAMESPACE_KEY = 'utxo'

/**
 * The BIP-122 **WalletPort** entry of a hub3 **Host**: `hub3Bip122Adapter(hub.get(providerId))`. It answers the first
 * account on the request's blockchain in the provider's `utxo` hub3 namespace's state, and signs with it, through the
 * signer the provider's wallet registered for TRANSFER. A blockchain it doesn't know has no accounts, so it is never
 * signed with a guessed one. `sign` rejects only with a `SignerError`. It never connects.
 */
export function hub3Bip122Adapter(
  provider: Provider<{ utxo: UtxoActions }>,
): Bip122Wallet {
  const findNamespace = () => provider.get(NAMESPACE_KEY)
  return {
    async getAccount({ blockchain }) {
      return getFirstAccount(findNamespace(), isAccountOn(blockchain))
    },
    async sign({ blockchain, tx }) {
      return signWithFirstAccount(
        provider,
        {
          key: NAMESPACE_KEY,
          type: TransactionType.TRANSFER,
          findNamespace,
          isWanted: isAccountOn(blockchain),
        },
        tx,
      )
    },
  }
}

// `NETWORKS` is a plain object, so only its own keys count: an inherited one such as `toString` is no blockchain.
function isAccountOn(blockchain: string): (accountId: string) => boolean {
  const references: Readonly<Record<string, string>> = NETWORKS
  const reference = Object.hasOwn(references, blockchain)
    ? references[blockchain]
    : undefined
  return (accountId) =>
    reference !== undefined && getCaip10Reference(accountId) === reference
}
