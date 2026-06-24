import { AssetWithTicker } from '../common.js'
import { TransactionType } from '../transactions.js'
import { BaseTransaction } from './base.js'

/** CosmosCoin */
export type CosmosCoin = {
  amount: string
  denom: string
}

/** CosmosProtoMsg */
export type CosmosProtoMsg = {
  type_url: string
  value: number[]
}

/** CosmosFee representing fee for cosmos transaction */
export type CosmosFee = {
  gas: string
  amount: CosmosCoin[]
}

/** Main transaction object for COSMOS type transactions */
export type CosmosMessage = {
  signType: 'AMINO' | 'DIRECT'
  sequence: string | null
  source: number | null
  account_number: number | null
  rpcUrl: string
  chainId: string | null
  msgs: any[] // TODO
  protoMsgs: CosmosProtoMsg[]
  memo: string | null
  fee: CosmosFee | null
}

/** An alternative to CosmosMessage object for the cosmos wallets that do not support generic Cosmos messages (e.g. XDefi) */
export type CosmosRawTransferData = {
  /** The machine-readable amount to transfer, example: 1000000000000000000 */
  amount: string
  /** The asset to be transferred */
  asset: AssetWithTicker
  /** The decimals for this asset, example: 18 */
  decimals: number
  /** Memo of transaction, could be null */
  memo: string | null
  /** The transaction method, example: transfer, deposit */
  method: string
  /** The recipient address of transaction */
  recipient: string
}

/** A Cosmos transaction, child of GenericTransaction */
export interface CosmosTransaction extends BaseTransaction {
  /** This fields equals to COSMOS for all CosmosTransactions */
  type: TransactionType.COSMOS
  /** Address of wallet that this transaction should be executed in, same as the create transaction request's input */
  fromWalletAddress: string
  /** Transaction data */
  data: CosmosMessage
  /** An alternative to CosmosMessage object for the cosmos wallets that do not support generic Cosmos messages */
  rawTransfer: CosmosRawTransferData | null
}

export const isCosmosTransaction = (transaction: {
  type: TransactionType
}): transaction is CosmosTransaction =>
  transaction.type === TransactionType.COSMOS
