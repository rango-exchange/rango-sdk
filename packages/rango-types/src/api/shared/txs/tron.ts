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

/**
 * TronTransaction
 *
 * @property {TransactionType} type - TransactionType.TRON
 * @property {boolean} isApprovalTx - Whether or not the transaction is an approval transaction.
 * @property {TrxRawData | null} raw_data - This is the raw data of the transaction.
 * @property {string | null} raw_data_hex - The raw hex data of the transaction.
 * @property {string} txID - The transaction ID.
 * @property {boolean} visible - boolean
 * @property {object} __payload__
 */
export interface TronTransaction extends BaseTransaction {
  type: TransactionType.TRON
  isApprovalTx: boolean
  raw_data: TrxRawData | null
  raw_data_hex: string | null
  txID: string
  visible: boolean
  __payload__: object
}

export const isTronTransaction = (transaction: {
  type: TransactionType
}): transaction is TronTransaction => transaction.type === TransactionType.TRON
