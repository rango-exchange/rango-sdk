import type { Asset, Amount } from './common'

/**
 * Pair of the asset and its amount in wallet balance
 *
 * @property {Amount} amount
 * @property {Asset} asset
 *
 */
export type AssetAndAmount = {
  amount: Amount
  asset: Asset
}

/**
 * Balance of a specific address inside a specific blockchain
 *
 * @property {boolean} failed - If true, Rango was not able to fetch balance of this wallet, maybe try again later
 * @property {string} blockChain - Wallet blockchain
 * @property {string} address - Wallet address
 * @property {AssetAndAmount[] | null} balances - Examples: BSC, TERRA, OSMOSIS, ...
 * @property {string} explorerUrl - The explorer url of the wallet, example: https://bscscan.com/address/0x7a3....fdsza
 *
 */
export type WalletDetail = {
  failed: boolean
  blockChain: string
  address: string
  balances: AssetAndAmount[] | null
  explorerUrl: string
}

/**
 * Response of checking wallet balance
 *
 * @property {WalletDetail[]} wallets - list of wallet assets
 *
 */
export type WalletDetailsResponse = {
  wallets: WalletDetail[]
}
