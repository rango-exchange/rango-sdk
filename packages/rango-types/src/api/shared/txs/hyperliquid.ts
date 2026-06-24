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

/** This type of transaction is used for all Hyperliquid transactions */
export interface HyperliquidTransaction extends BaseTransaction {
  /** This fields equals to HYPERLIQUID for all HyperliquidTransactions */
  type: TransactionType.HYPERLIQUID
  /** Hyperliquid transaction action */
  action: HyperliquidAction
  /** message to be signed by wallet */
  message: string
  /** nonce of transaction */
  nonce: number
  /** This field is an empty array for Hyperliquid transactions */
  prerequisites: []
  /** expected output of transaction */
  expectedOutput: string
}

export const isHyperliquidTransaction = (transaction: {
  type: TransactionType
}): transaction is HyperliquidTransaction =>
  transaction.type === TransactionType.HYPERLIQUID
