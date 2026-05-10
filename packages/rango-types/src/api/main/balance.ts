import {
  AssetAndAmount,
  WalletDetail,
  WalletDetailsResponse,
  TokenBalanceRequest,
  TokenBalanceResponse,
  Asset,
} from '../shared/index.js'

/**
 * The request for multiple token balances
 *
 * @property {Asset[]} assets - Tokens requesting their balances
 * @property {string} walletAddress - Wallet address
 *
 */
export type MultipleTokenBalanceRequest = {
  assets: Asset[]
  walletAddress: string
}

/**
 * the response for multiple token balances
 *
 * @property {AssetAndAmount[] | null} balances - The balances of tokens
 * @property {string | null} error - Error message
 * @property {number | null} errorCode - Error code
 * @property {number | null} traceId - Trace Id, for debug purpose
 */
export type MultipleTokenBalanceResponse = {
  balances: AssetAndAmount[] | null
  error: string | null
  errorCode: number | null
  traceId: number | null
}

export {
  AssetAndAmount,
  WalletDetail,
  WalletDetailsResponse,
  TokenBalanceRequest,
  TokenBalanceResponse,
}
