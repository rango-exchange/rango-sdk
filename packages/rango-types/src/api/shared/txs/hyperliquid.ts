import { TransactionType } from '../transactions.js'
import { BaseTransaction } from './base.js'

interface HyperliquidAction {
  type: 'withdraw3' | 'usdSend'
  signatureChainId: string
  hyperliquidChain: string
  destination: string
  amount: string
  time: number
}

/**
 * This type of transaction is used for all Hyperliquid transactions
 *
 * @property {TransactionType} type - This fields equals to HYPERLIQUID for all HyperliquidTransactions
 * @property {HyperliquidAction} action - Hyperliquid transaction action
 * @property {string} message, message to be signed by wallet
 * @property {string} nonce, nonce of transaction
 * @property {string} prerequisites, This field is an empty array for Hyperliquid transactions
 * @property {string | null} expectedOutput, expected output of transaction
 *
 */
export interface HyperliquidTransaction extends BaseTransaction {
  type: TransactionType.HYPERLIQUID
  action: HyperliquidAction
  message: string
  nonce: number
  prerequisites: []
  expectedOutput: string
}

export const isHyperliquidTransaction = (transaction: {
  type: TransactionType
}): transaction is HyperliquidTransaction =>
  transaction.type === TransactionType.HYPERLIQUID
