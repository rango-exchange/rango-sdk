import type { XrplWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { XRPLActions } from '@hub3js/xrpl'

import { TransactionType } from 'rango-types'
import { Client } from 'xrpl'

import { buildSingleChainWallet, getNamespace } from './utils.js'

type XrplProvider = Provider<{ xrpl: XRPLActions }>

const NAMESPACE_KEY = 'xrpl'
// hub3 has no action to read a transaction, so the adapter reads it off this node.
const XRPL_NODE_URL = 'wss://xrplcluster.com/'

export function hub3XrplAdapter(provider: XrplProvider): XrplWallet {
  return {
    ...buildSingleChainWallet(provider, {
      key: NAMESPACE_KEY,
      type: TransactionType.XRPL,
    }),
    // Only the issuer's lines are asked for, with no paging.
    async getTrustline({ prerequisite }) {
      const { wallet, currency, issuer } = prerequisite
      const lines = await getNamespace(provider, NAMESPACE_KEY).accountLines(
        wallet,
        {
          peer: issuer,
        },
      )
      const trustLine = lines.find(
        (line) => line.currency === currency && line.account === issuer,
      )
      return trustLine?.limit ?? null
    },
    async buildTransaction({ prerequisite, limit }) {
      return {
        type: TransactionType.XRPL,
        blockChain: 'XRPL',
        prerequisites: [],
        data: {
          TransactionType: 'TrustSet',
          Account: prerequisite.wallet,
          LimitAmount: {
            currency: prerequisite.currency,
            issuer: prerequisite.issuer,
            value: limit,
          },
        },
      }
    },
    // A string (binary) `meta` is left out, so the SDK reads a validated transaction without it as failed.
    async getTransactionInfo({ hash }) {
      const client = new Client(XRPL_NODE_URL)
      try {
        await client.connect()
        const { result } = await client.request({
          command: 'tx',
          transaction: hash,
        })
        const validated = result.validated === true
        if (result.meta === undefined || typeof result.meta === 'string') {
          return { validated }
        }
        return {
          validated,
          meta: { TransactionResult: result.meta.TransactionResult },
        }
      } finally {
        await client.disconnect()
      }
    },
  }
}
