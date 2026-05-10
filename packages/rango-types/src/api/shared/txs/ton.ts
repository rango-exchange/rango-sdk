import { TransactionType } from '../transactions.js'
import { BaseTransaction } from './base.js'

export enum TonChainID {
  MAINNET = '-239',
  TESTNET = '-3',
}

/**
 * @property {string} address - Receiver's address
 * @property {string} amount - Amount to send in nanoTon
 * @property {string} [stateInit] - Contract specific data to add to the transaction
 * @property {string} [payload] - Contract specific data to add to the transaction
 */
export interface TonMessage {
  address: string
  amount: string
  stateInit?: string
  payload?: string
}

/**
 * This type of transaction is used for all Ton transactions
 *
 * @property {TransactionType} type - This field equals to TON for all Ton transactions
 * @property {number} validUntil - Sending transaction deadline in unix epoch seconds
 * @property {TonChainID} [network] - The network (mainnet or testnet) where DApp intends to send the transaction. If not set, the transaction is sent to the network currently set in the wallet, but this is not safe and DApp should always strive to set the network. If the network parameter is set, but the wallet has a different network set, the wallet should show an alert and DO NOT ALLOW TO SEND this transaction
 * @property {string} [from] - The sender address in '<wc>:<hex>' format from which DApp intends to send the transaction. Current account.address by default
 * @property {TonMessage[]} messages - Messages to send: min is 1, max is 4
 */
export interface TonTransaction extends BaseTransaction {
  type: TransactionType.TON
  validUntil: number
  network?: TonChainID
  from?: string
  messages: TonMessage[]
}

export const isTonTransaction = (transaction: {
  type: TransactionType
}): transaction is TonTransaction => transaction.type === TransactionType.TON
