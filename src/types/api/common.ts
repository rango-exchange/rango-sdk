import {SwapperMetaDto, Token} from "./meta"

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

export function assetToString(asset: Asset): string {
  if (!!asset.address)
    return `${asset.blockchain}.${asset.symbol}-${asset.address}`
  else
    return `${asset.blockchain}.${asset.symbol}`
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
 * A fee unit, including the type of asset and the amount of fee
 *
 * @property {string} name - A display name for this fee, example: Network Fee
 * @property {Asset} asset - Underlying asset for paying fee, example: BNB for BSC blockchain
 * @property {string} amount - The human readable amount of fee, example: 0.004
 * @property {string} expenseType - Type of the fee, example: FROM_SOURCE_WALLET
 *
 */
export type SwapFee = {
  name: string
  expenseType: 'FROM_SOURCE_WALLET' | 'DECREASE_FROM_OUTPUT'
  asset: Asset
  amount: string
}

/**
 * A quote path from asset x (from) to asset y (to)
 *
 * @property {Token} from - The source asset
 * @property {Token} to - The destination asset
 * @property {SwapperMetaDto} swapper - Swapper for this path
 * @property {"BRIDGE" | "DEX" | "COMPOSER"} swapperType - Type of swapper
 * @property {string} expectedOutput - Expected output
 *
 */
export type QuotePath = {
  from: Token
  to: Token
  swapper: SwapperMetaDto
  swapperType: "BRIDGE" | "DEX" | "COMPOSER"
  expectedOutput: string
}

/**
 * Limitations on input amount for requested route
 *
 * @property {string | null} min - Limitation on minimum input amount for this route
 * @property {string | null} max - Limitation on maximum input amount for this route
 * @property {'INCLUSIVE' | 'EXCLUSIVE'} type - type of limitation
 *
 */
export type AmountRestriction = {
  min: string | null
  max: string | null
  type: 'INCLUSIVE' | 'EXCLUSIVE'
}

/**
 * A step of a multi-step swap route
 *
 * @property {string} outputAmount - The estimation of Rango from output amount of Y
 *
 * @property {SwapperMetaDto} swapper - Swapper suggested for this path
 *
 * @property {QuotePath[] | null} path - The internal routing of this step showing how the initial swap request will
 * be split and executed. This can be used for previewing purpose to give the user a sense of what's going to happen.
 * Null indicates that there is no internal mechanism and swapping is simple and straight-forward.
 *
 * @property {SwapFee[]} fee - List of fees that are taken from user in this step
 *
 * @property {AmountRestriction | null} amountRestriction - restrictions on input amount. This field is informational
 * and there is no need to apply it in client-side
 *
 * @property {number} estimatedTimeInSeconds - The estimated time (in seconds) that this step might take, beware that
 * this number is just an estimation and should be used only for user preview, example: 15
 *
 */
export type QuoteSimulationResult = {
  outputAmount: string
  swapper: SwapperMetaDto
  path: QuotePath[] | null
  fee: SwapFee[]
  amountRestriction: AmountRestriction | null
  estimatedTimeInSeconds: number
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
