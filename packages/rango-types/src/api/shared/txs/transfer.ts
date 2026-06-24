import { AssetWithTicker } from '../common.js'
import { TransactionType } from '../transactions.js'
import { BaseTransaction } from './base.js'

export type InputToSign = { address: string; signingIndexes: number[] }

export type PSBT = {
  /** Base 64 representation of the Unsigned PSBT */
  unsignedPsbtBase64: string
  /** Inputs to be signed */
  inputsToSign: InputToSign[]
}

/** TransferTransaction. This type of transaction is used for UTXO blockchains including BTC, LTC, BCH */
export interface Transfer extends BaseTransaction {
  /** This fields equals to TRANSFER for all TransferTransactions */
  type: TransactionType.TRANSFER
  /** The method that should be passed to wallet. examples: deposit, transfer */
  method: string
  asset: AssetWithTicker
  /** The machine-readable amount of transaction, example: 1000000000000000000 */
  amount: string
  /** The decimals of the asset */
  decimals: number
  /** The source wallet address that can sign this transaction */
  fromWalletAddress: string
  /** The destination wallet address that the fund should be sent to */
  recipientAddress: string
  /** The memo of transaction, can be null */
  memo: string | null
  /** PSBT object containing base 64 representation of the Unsigned PSBT along with the inputs to be signed */
  psbt: PSBT | null
}

export const isTransferTransaction = (transaction: {
  type: TransactionType
}): transaction is Transfer => transaction.type === TransactionType.TRANSFER
