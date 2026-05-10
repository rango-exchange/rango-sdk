import { Amount, Asset } from './common.js'

/**
 * The asset, its amount in the wallet balance, and its price
 *
 * @property {Amount} amount
 * @property {Asset} asset
 * @property {number | null} price
 *
 */
export type AssetAndAmount = {
  amount: Amount
  asset: Asset
  price: number | null
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

/**
 * The token balance request
 *
 * @property {string} walletAddress - The user wallet address
 * @property {string} blockchain - The blockchain which this token belongs to
 * @property {string} symbol - The token symbol, e.g: ADA
 * This property is required only for COSMOS blockchains.
 * @property {string | null} address - Smart contract address of token, null for native tokens
 *
 */
export type TokenBalanceRequest = {
  walletAddress: string
  blockchain: string
  symbol?: string
  address: string | null
}

/**
 * The token balance response
 *
 * @property {number | null} balance - The balance for token
 * @property {number | null} price - The token's price.
 * @property {string | null} error - Error message
 * @property {number | null} errorCode - Error code
 * @property {number | null} traceId - Trace Id, for debug purpose
 */
export type TokenBalanceResponse = {
  balance: number | null
  price: number | null
  error: string | null
  errorCode: number | null
  traceId: number | null
}
