import type { Bip122NetworkName, UtxoActions } from '@hub3js/bip122'
import type { Provider } from '@hub3js/core'
import type { Bip122Wallet } from '@rango-dev/sdk'
import type { AccountId } from 'caip'

import { NETWORKS } from '@hub3js/bip122'
import { TransactionType } from 'rango-types'

import { tryRunAndRejectWithSignerError } from './errors.js'
import { findSigner, getNamespace, getParsedAccounts } from './utils.js'

export type Bip122Provider = Provider<{ utxo: UtxoActions }>

const NAMESPACE_KEY = 'utxo'

/*
 * The BIP-122 wallet a hub3 **Host**'s `getWallet` answers for one UTXO blockchain, signing with the provider's first
 * account on it: a multi-network provider holds an account per blockchain, so the Host answers one adapter per blockchain.
 */
export function hub3Bip122Adapter(
  provider: Bip122Provider,
  blockchain: Bip122NetworkName,
): Bip122Wallet {
  const reference = NETWORKS[blockchain]
  const isAccountOnBlockchain = (account: AccountId) =>
    reference !== undefined && account.chainId.reference === reference
  return {
    async getAccount() {
      return (
        getParsedAccounts(provider.get(NAMESPACE_KEY)).find(
          isAccountOnBlockchain,
        )?.address ?? null
      )
    },
    async signAndSend({ tx }) {
      return tryRunAndRejectWithSignerError(async () => {
        const address =
          getParsedAccounts(getNamespace(provider, NAMESPACE_KEY)).find(
            isAccountOnBlockchain,
          )?.address ?? null
        if (address === null) {
          throw new Error(
            `The hub3 provider "${provider.id}" has no connected "${NAMESPACE_KEY}" account on "${blockchain}" to sign with.`,
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
