/** An asset which is unique by (blockchain, symbol, address) */
export type Asset = {
  /** The blockchain which this token belongs to */
  blockchain: string
  /** Smart contract address of token, null for native tokens */
  address: string | null
  /** The display token symbol, e.g. USDT, BTC, ... */
  symbol: string
}

/**
 * The amount of an asset, including value & decimals.
 * The value is machine-readable, to make it human-readable it should be shifted by decimals.
 */
export type Amount = {
  /** The machine-readable amount shifted by decimals, example: 1000000000000000000 */
  amount: string
  /** The decimals of the token in blockchain, example: 18 */
  decimals: number
}

/** Type of the swapper */
export type SwapperType = 'BRIDGE' | 'DEX' | 'AGGREGATOR' | 'OFF_CHAIN'

/** Type of the fee */
export type ExpenseType =
  | 'FROM_SOURCE_WALLET'
  | 'DECREASE_FROM_OUTPUT'
  | 'FROM_DESTINATION_WALLET'

/**
 * Type of amount restriction: Specifies range for fromAmount (Min / Max) Value. for example if value
 * is EXCLUSIVE and fromAmountMinValue is 20, user can execute transaction if inputValue > 20, but for INCLUSIVE
 * inputValue >= 20 is valid
 */
export type AmountRestrictionType = 'INCLUSIVE' | 'EXCLUSIVE'

/** An asset with its ticker */
export type AssetWithTicker = {
  /** Blockchain of asset */
  blockchain: string
  /** Contract address of the asset, null for native tokens */
  address: string | null
  /** Symbol of an asset, example: BUSD */
  symbol: string
  /** The ticker of the asset which normally is a combination of symbol and address, required by some javascript wallets */
  ticker: string
}

/** An asset which is unique by (blockchain, symbol, address) */
export type RequestedAsset = {
  /** The blockchain which this token belongs to */
  blockchain: string
  /** Smart contract address of token, null for native tokens */
  address: string | null
  /**
   * The display token symbol, e.g. USDT, BTC, ...
   * This property is required only for COSMOS blockchains.
   */
  symbol?: string
}
