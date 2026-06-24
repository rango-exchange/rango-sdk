import { Amount, Asset } from './common.js'

/** The asset, its amount in the wallet balance, and its price */
export type AssetAndAmount = {
  amount: Amount
  asset: Asset
  price: number | null
}

/** Balance of a specific address inside a specific blockchain */
export type WalletDetail = {
  /** If true, Rango was not able to fetch balance of this wallet, maybe try again later */
  failed: boolean
  /** Wallet blockchain */
  blockChain: string
  /** Wallet address */
  address: string
  /** Examples: BSC, TERRA, OSMOSIS, ... */
  balances: AssetAndAmount[] | null
  /** The explorer url of the wallet, example: https://bscscan.com/address/0x7a3....fdsza */
  explorerUrl: string
}

/** Response of checking wallet balance */
export type WalletDetailsResponse = {
  /** list of wallet assets */
  wallets: WalletDetail[]
}

/** The token balance request */
export type TokenBalanceRequest = {
  /** The user wallet address */
  walletAddress: string
  /** The blockchain which this token belongs to */
  blockchain: string
  /**
   * The token symbol, e.g: ADA
   * This property is required only for COSMOS blockchains.
   */
  symbol?: string
  /** Smart contract address of token, null for native tokens */
  address: string | null
}

/** The token balance response */
export type TokenBalanceResponse = {
  /** The balance for token */
  balance: number | null
  /** The token's price. */
  price: number | null
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}
