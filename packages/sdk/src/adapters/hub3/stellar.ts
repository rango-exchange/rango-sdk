import type { StellarWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { StellarActions } from '@hub3js/stellar'

import { Asset, Operation } from '@stellar/stellar-sdk'
import { TransactionType } from 'rango-types'

import { buildSingleChainWallet, getNamespace } from './utils.js'

type StellarProvider = Provider<{ stellar: StellarActions }>

const NAMESPACE_KEY = 'stellar'
// In stroops.
const TRUSTLINE_BASE_FEE = '100'
// The user has this long to approve the trustline before the network refuses it.
const TRUSTLINE_TIMEOUT_S = 30
const MS_PER_S = 1000

export function hub3StellarAdapter(provider: StellarProvider): StellarWallet {
  return {
    ...buildSingleChainWallet(provider, {
      key: NAMESPACE_KEY,
      type: TransactionType.STELLAR,
    }),
    // An account the network doesn't know rejects, in its own form.
    async getTrustline({ prerequisite }) {
      const { wallet, code, issuer } = prerequisite
      const lines = await getNamespace(provider, NAMESPACE_KEY).balanceLines(
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
