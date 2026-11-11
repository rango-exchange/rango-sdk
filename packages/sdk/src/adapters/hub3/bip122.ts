import type { Bip122Wallet } from '../../mod.js'
import type { Bip122NetworkName, UtxoActions } from '@hub3js/bip122'
import type { Provider } from '@hub3js/core'
import type { AccountId } from 'caip'

import { NETWORKS } from '@hub3js/bip122'
import { TransactionType } from 'rango-types'

import { tryRunAndRejectWithSignerError } from './errors.js'
import { findSigner, getNamespace, getParsedAccounts } from './utils.js'

export type Bip122Provider = Provider<{ utxo: UtxoActions }>

const NAMESPACE_KEY = 'utxo'

/*
 * The BIP-122 **WalletPort** entry of a hub3 **Host** for one UTXO blockchain, signing with the provider's first account
 * on it: a multi-network provider holds an account per blockchain, so the Host builds one adapter per blockchain key.
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
    async sign({ tx }) {
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
