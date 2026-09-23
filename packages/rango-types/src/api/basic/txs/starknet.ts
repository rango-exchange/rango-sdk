import { BaseTransaction, StarknetCallData } from '../../shared/index.js'
import { TransactionType } from '../transactions.js'

export { StarknetCallData }

/** The transaction object for all Starknet transactions */
export interface StarknetTransaction extends BaseTransaction {
  /** This fields equals to STARKNET for all StarknetTransaction */
  type: TransactionType.STARKNET
  /** An array of StarknetCallData objects. */
  approveCalls: StarknetCallData[]
  /** An array of StarknetCallData objects. */
  calls: StarknetCallData[]
  maxFee: number | null
}

export const isStarknetTransaction = (transaction: {
  type: TransactionType
}): transaction is StarknetTransaction =>
  transaction.type === TransactionType.STARKNET
