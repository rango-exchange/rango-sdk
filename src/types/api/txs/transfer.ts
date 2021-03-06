import type { AssetWithTicker } from '../common'
import type { GenericTransaction } from '../transactions'

/**
 * TransferTransaction. This type of transaction is used for non-EVM and non-Cosmos blockchains including BTC, LTC, BCH
 *
 * @property {string} method - The method that should be passed to wallet. examples: deposit, transfer
 * @property {AssetWithTicker} asset
 * @property {string} amount - The machine-readable amount of transaction, example: 1000000000000000000
 * @property {number} decimals - The decimals of the asset
 * @property {string} fromWalletAddress - The source wallet address that can sign this transaction
 * @property {string} recipientAddress - The destination wallet address that the fund should be sent to
 * @property {string | null} memo - The memo of transaction, can be null
 *
 */
export interface Transfer extends GenericTransaction {
  method: string
  asset: AssetWithTicker
  amount: string
  decimals: number
  fromWalletAddress: string
  recipientAddress: string
  memo: string | null
}
