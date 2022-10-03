/**
 * An asset which is unique by (blockchain, symbol, address)
 *
 * @property {string} blockchain - The blockchain which this token belongs to
 * @property {string | null} address - Smart contract address of token, null for native tokens
 * @property {string} symbol - The display token symbol, e.g. USDT, BTC, ...
 *
 */
export type Asset = {
  blockchain: string
  address: string | null
  symbol: string
}

/**
 * The amount of an asset, including value & decimals.
 * The value is machine-readable, to make it human-readable it should be shifted by decimals.
 *
 * @property {string} amount - The machine-readable amount shifted by decimals, example: 1000000000000000000
 * @property {number} decimals - The decimals of the token in blockchain, example: 18
 *
 */
export type Amount = {
  amount: string
  decimals: number
}

/**
 * An asset with its ticker
 *
 * @property {string} blockchain - Blockchain of asset
 * @property {string | null} address - Contract address of the asset, null for native tokens
 * @property {string} symbol - Symbol of an asset, example: BUSD
 * @property {string} ticker - The ticker of the asset which normally is a combination of symbol and address,
 * required by some javascript wallets
 *
 */
export type AssetWithTicker = {
  blockchain: string
  address: string | null
  symbol: string
  ticker: string
}

/**
 * Type of the swapper
 *
 */
export type SwapperType = 'BRIDGE' | 'DEX' | 'AGGREGATOR'

/**
 * Type of the result
 */
export type ResultType = 'OK' | 'HIGH_IMPACT' | 'NO_ROUTE' | 'INPUT_LIMIT_ISSUE'

/**
 * Type of the fee required for the swap
 */
export type ExpenseType =
  | 'FROM_SOURCE_WALLET'
  | 'DECREASE_FROM_OUTPUT'
  | 'FROM_DESTINATION_WALLET'

/**
 * Type of the input amount restriction
 */
export type AmountRestrictionType = 'INCLUSIVE' | 'EXCLUSIVE'
