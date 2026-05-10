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
 * Type of the swapper
 *
 */
export type SwapperType = 'BRIDGE' | 'DEX' | 'AGGREGATOR' | 'OFF_CHAIN'

/**
 * Type of the fee
 *
 */
export type ExpenseType =
  | 'FROM_SOURCE_WALLET'
  | 'DECREASE_FROM_OUTPUT'
  | 'FROM_DESTINATION_WALLET'

/**
 * Type of amount restriction: Specifies range for fromAmount (Min / Max) Value. for example if value
 * is EXCLUSIVE and fromAmountMinValue is 20, user can execute transaction if inputValue > 20, but for INCLUSIVE
 * inputValue >= 20 is valid
 *
 */
export type AmountRestrictionType = 'INCLUSIVE' | 'EXCLUSIVE'

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
 * An asset which is unique by (blockchain, symbol, address)
 *
 * @property {string} blockchain - The blockchain which this token belongs to
 * @property {string | null} address - Smart contract address of token, null for native tokens
 * @property {string} [symbol]  symbol - The display token symbol, e.g. USDT, BTC, ...
 * This property is required only for COSMOS blockchains.
 *
 */
export type RequestedAsset = {
  blockchain: string
  address: string | null
  symbol?: string
}
