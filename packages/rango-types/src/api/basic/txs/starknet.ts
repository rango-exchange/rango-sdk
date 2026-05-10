import { BaseTransaction, StarknetCallData } from '../../shared/index.js'
import { TransactionType } from '../transactions.js'


export { StarknetCallData }

/**
 * The transaction object for all Starknet transactions
 *
 * @property {TransactionType} type - This fields equals to STARKNET for all StarknetTransaction
 * @property {string} blockChain - The blockchain name that this transaction is going to run in
 * @property {StarknetCallData[]} approveCalls - An array of StarknetCallData objects.
 * @property {StarknetCallData[]} calls - An array of StarknetCallData objects.
 * @property {number | null} maxFee
 *
 */
export interface StarknetTransaction extends BaseTransaction {
  type: TransactionType.STARKNET
  approveCalls: StarknetCallData[]
  calls: StarknetCallData[]
  maxFee: number | null
}

export const isStarknetTransaction = (transaction: {
  type: TransactionType
}): transaction is StarknetTransaction => transaction.type === TransactionType.STARKNET
