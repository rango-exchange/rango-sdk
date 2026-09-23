import {
  AssetAndAmount,
  WalletDetail,
  WalletDetailsResponse,
  TokenBalanceRequest,
  TokenBalanceResponse,
  Asset,
} from '../shared/index.js'

/** The request for multiple token balances */
export type MultipleTokenBalanceRequest = {
  /** Tokens requesting their balances */
  assets: Asset[]
  /** Wallet address */
  walletAddress: string
}

/** the response for multiple token balances */
export type MultipleTokenBalanceResponse = {
  /** The balances of tokens */
  balances: AssetAndAmount[] | null
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}

export {
  AssetAndAmount,
  WalletDetail,
  WalletDetailsResponse,
  TokenBalanceRequest,
  TokenBalanceResponse,
}
