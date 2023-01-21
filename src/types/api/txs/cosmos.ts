import type { AssetWithTicker } from '../common'
import { CosmosBlockchainMeta } from '../meta'
import { TransactionType } from '../transactions'

/**
 * CosmosCoin representing fee coins
 */
export type CosmosCoin = {
  amount: string
  denom: string
}

/**
 * CosmosStdFee representing fee for cosmos transaction
 */
export type CosmosStdFee = {
  amount: CosmosCoin[]
  gas: string
}

/**
 * Main transaction object for COSMOS type transactions (including Terra, Osmosis, ...)
 */
export type CosmosMessage = {
  signType: 'AMINO' | 'DIRECT'
  sequence: string | null
  source: number | null
  account_number: number | null
  rpcUrl: string | null
  chainId: string | null
  msgs: any[]
  protoMsgs: any[]
  memo: string | null
  fee: CosmosStdFee | null
}

/**
 * An alternative to CosmosMessage object for the cosmos wallets that do not support generic Cosmos messages (e.g. XDefi)
 *
 * @property {AssetWithTicker} asset - The asset to be transferred
 * @property {string} amount - The machine-readable amount to transfer, example: 1000000000000000000
 * @property {number} decimals - The decimals for this asset, example: 18
 * @property {string | null} memo - Memo of transaction, could be null
 * @property {string} method - The transaction method, example: transfer, deposit
 * @property {string} recipient - The recipient address of transaction
 *
 */
export type CosmosRawTransferData = {
  amount: string
  asset: AssetWithTicker
  decimals: number
  memo: string | null
  method: string
  recipient: string
}

/**
 * A Cosmos transaction, child of GenericTransaction
 *
 * @property {TransactionType} type - This fields equals to TransactionType.COSMOS for all CosmosTransactions
 * @property {CosmosBlockchainMeta} blockChain - The blockchain that this transaction will be executed in, same as the input blockchain of creating transaction
 * @property {string} fromWalletAddress - Address of wallet that this transaction should be executed in, same as the create transaction request's input
 * @property {CosmosMessage} data - Transaction data
 * @property {CosmosRawTransferData} rawTransfer - An alternative to CosmosMessage object for the cosmos wallets that do not support generic Cosmos messages
 *
 */
export interface CosmosTransaction {
  type: TransactionType
  blockChain: CosmosBlockchainMeta
  fromWalletAddress: string
  data: CosmosMessage
  rawTransfer: CosmosRawTransferData
}
