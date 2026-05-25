import { TransactionType } from '../transactions.js'
import { BaseTransaction } from './base.js'

export type TrxContractParameter = {
  value: unknown
  type_url: string
}

export type TrxContractData = {
  parameter: TrxContractParameter
  type: string
}

export type TrxRawData = {
  contract: TrxContractData[]
  ref_block_bytes: string
  ref_block_hash: string
  expiration: number
  timestamp: number
}

/** TronTransaction */
export interface TronTransaction extends BaseTransaction {
  /** TransactionType.TRON */
  type: TransactionType.TRON
  /** Whether or not the transaction is an approval transaction. */
  isApprovalTx: boolean
  /** This is the raw data of the transaction. */
  raw_data: TrxRawData | null
  /** The raw hex data of the transaction. */
  raw_data_hex: string | null
  /** The transaction ID. */
  txID: string
  /** boolean */
  visible: boolean
  __payload__: object
}

export const isTronTransaction = (transaction: {
  type: TransactionType
}): transaction is TronTransaction => transaction.type === TransactionType.TRON
