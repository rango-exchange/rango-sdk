import {
  BaseTransaction,
  StarknetCallData,
  TransactionType,
} from '../../shared/index.js'

export { StarknetCallData }

/** StarknetTransaction */
export interface StarknetTransaction extends BaseTransaction {
  /** TransactionType.STARKNET */
  type: TransactionType.STARKNET
  /** If the transaction is an approval transaction, this will be true. */
  isApprovalTx: boolean
  /** An array of StarknetCallData objects. */
  calls: StarknetCallData[]
}

export const isStarknetTransaction = (transaction: {
  type: TransactionType
}): transaction is StarknetTransaction =>
  transaction.type === TransactionType.STARKNET
