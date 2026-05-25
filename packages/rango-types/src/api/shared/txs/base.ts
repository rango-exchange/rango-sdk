import { TransactionType } from '../transactions.js'
import { TransactionPrerequisite } from '../prerequisites/index.js'

/** Base transaction for all Rango supported transactions */
export interface BaseTransaction {
  /** Type of the transaction, e.g. EVM, SOLANA, COSMOS, ... */
  type: TransactionType
  /** The blockchain that this transaction will be executed in */
  blockChain: string
  prerequisites: TransactionPrerequisite[]
}
