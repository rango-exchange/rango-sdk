import type { XrplWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { XRPLActions } from '@hub3js/xrpl'

import { TransactionType } from 'rango-types'
import { Client, RippledError } from 'xrpl'

import { getFirstAccount } from './accounts.js'
import { tryGetNamespace } from './namespaces.js'
import { signWithFirstAccount } from './single-chain.js'

type XrplProvider = Provider<{ xrpl: XRPLActions }>

const NAMESPACE_KEY = 'xrpl'
// hub3 has no action to read a transaction, so the adapter reads it off this node.
const XRPL_NODE_URL = 'wss://xrplcluster.com/'
// The node's error code for a transaction it does not know, yet or at all.
const TX_NOT_FOUND_ERROR_CODE = 'txnNotFound'

/**
 * The XRPL **WalletPort** entry of a hub3 **Host**: `hub3XrplAdapter(hub.get(providerId))`. It answers the first
 * account in the provider's `xrpl` hub3 namespace's state and signs with it, through the signer the provider's wallet
 * registered for XRPL. It reads trustlines through that hub3 namespace and a transaction's info off an XRPL node, and
 * builds the `TrustSet` as plain data. `sign` rejects only with a `SignerError`. It never connects.
 */
export function hub3XrplAdapter(provider: XrplProvider): XrplWallet {
  const findNamespace = () => provider.get(NAMESPACE_KEY)
  return {
    async getAccount() {
      return getFirstAccount(findNamespace())
    },
    async sign({ tx }) {
      return signWithFirstAccount(
        provider,
        { key: NAMESPACE_KEY, type: TransactionType.XRPL, findNamespace },
        tx,
      )
    },
    // Only the issuer's lines are asked for, with no paging.
    async getTrustline({ prerequisite }) {
      const { wallet, currency, issuer } = prerequisite
      const lines = await tryGetNamespace(provider, NAMESPACE_KEY).accountLines(
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
    /*
     * Over a connection of its own; the SDK decides whether the transaction succeeded. One the node doesn't know is
     * not validated yet. A string (binary) `meta` is left out, so the SDK reads a validated transaction without it as
     * failed.
     */
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
      } catch (error) {
        if (isTxNotFound(error)) {
          return { validated: false }
        }
        throw error
      } finally {
        await client.disconnect()
      }
    },
  }
}

function isTxNotFound(error: unknown): boolean {
  return (
    error instanceof RippledError &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'error' in error.data &&
    error.data.error === TX_NOT_FOUND_ERROR_CODE
  )
}
