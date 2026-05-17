import { TransactionType } from '../transactions.js'
import { TransactionPrerequisite } from '../prerequisites/index.js'

/**
 * Base transaction for all Rango supported transactions
 *
 * @property {TransactionType} type - Type of the transaction, e.g. EVM, SOLANA, COSMOS, ...
 * @property {string} blockChain - The blockchain that this transaction will be executed in
 *
 */
export interface BaseTransaction {
  type: TransactionType
  blockChain: string
  prerequisites: TransactionPrerequisite[]
}
