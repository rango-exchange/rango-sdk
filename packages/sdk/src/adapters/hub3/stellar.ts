import type { StellarWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { StellarActions } from '@hub3js/stellar'

import { Asset, Operation } from '@stellar/stellar-sdk'
import { TransactionType } from 'rango-types'

import { getFirstAccount } from './accounts.js'
import { tryGetNamespace } from './namespaces.js'
import { signWithFirstAccount } from './single-chain.js'

type StellarProvider = Provider<{ stellar: StellarActions }>

const NAMESPACE_KEY = 'stellar'
// In stroops.
const TRUSTLINE_BASE_FEE = '100'
const TRUSTLINE_TIMEOUT_S = 30
const MS_PER_S = 1000

/**
 * The Stellar **WalletPort** entry of a hub3 **Host**: `hub3StellarAdapter(hub.get(providerId))`. It answers the
 * first account in the provider's `stellar` hub3 namespace's state and signs with it, through the signer the
 * provider's wallet registered for STELLAR. It reads trustlines through that hub3 namespace, and builds the trustline
 * transaction itself with `@stellar/stellar-sdk`, as hub3 has no action for it. `sign` rejects only with a
 * `SignerError`. It never connects.
 */
export function hub3StellarAdapter(provider: StellarProvider): StellarWallet {
  const findNamespace = () => provider.get(NAMESPACE_KEY)
  return {
    async getAccount() {
      return getFirstAccount(findNamespace())
    },
    async sign({ tx }) {
      return signWithFirstAccount(
        provider,
        { key: NAMESPACE_KEY, type: TransactionType.STELLAR, findNamespace },
        tx,
      )
    },
    // An account the network doesn't know rejects, in its own form.
    async getTrustline({ prerequisite }) {
      const { wallet, code, issuer } = prerequisite
      const lines = await tryGetNamespace(provider, NAMESPACE_KEY).balanceLines(
        wallet,
      )
      for (const line of lines) {
        if (
          line.asset_type !== 'native' &&
          line.asset_type !== 'liquidity_pool_shares' &&
          line.asset_code === code &&
          line.asset_issuer === issuer
        ) {
          return line.limit
        }
      }
      return null
    },
    async buildTransaction({ prerequisite, limit }) {
      const operation = Operation.changeTrust({
        asset: new Asset(prerequisite.code, prerequisite.issuer),
        limit,
      })
      const nowS = Math.floor(Date.now() / MS_PER_S)
      return {
        type: TransactionType.STELLAR,
        blockChain: prerequisite.blockChain,
        prerequisites: [],
        data: {
          baseFee: TRUSTLINE_BASE_FEE,
          memoXdrBase64: null,
          preconditions: {
            timeBounds: { minTime: 0, maxTime: nowS + TRUSTLINE_TIMEOUT_S },
            ledgerBounds: { minLedger: 0, maxLedger: 0 },
            minSeqNumber: null,
            minSeqAge: null,
            minSeqLedgerGap: null,
            extraSigners: null,
          },
          operationsXdrBase64: [operation.toXDR('base64')],
        },
      }
    },
  }
}
