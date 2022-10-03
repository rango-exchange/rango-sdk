import { Asset, SwapperType, ExpenseType, AmountRestrictionType } from 'common'

/**
 * Minimum required slippage of a step
 *
 * @property {boolean} error - If true, means that Rango failed to compute slippage for this step.
 * @property {number} slippage - The slippage amount in percent, example: 5
 *
 */
export type RecommendedSlippage = {
  error: boolean
  slippage: number
}

/**
 * A fee unit, including the type of asset and the amount of fee
 *
 * @property {string} name - A display name for this fee, example: Network Fee
 * @property {Asset} asset - Underlying asset for paying fee, example: BNB for BSC blockchain
 * @property {string} amount - The human readable amount of fee, example: 0.004
 * @property {ExpenseType} expenseType - Type of the fee, example: FROM_SOURCE_WALLET
 *
 */
export type SwapFee = {
  name: string
  expenseType: ExpenseType
  asset: Asset
  amount: string
}

/**
 * Source or destination asset of a route step
 *
 * @property {string} blockchain - Blockchain of the source/destination asset of this step
 * @property {string} symbol - Symbol of the source/destination asset of this step, example: OSMO
 * @property {string | number} address - Contract address of the source/dest asset of this step, null for native token
 * @property {number} decimals - Decimals of the source/destination asset of this step, example: 18
 * @property {string} logo - Absolute path of the logo of the source/destination asset of this step
 * @property {string | null} usdPrice - Usd price unit for the asset if available
 *
 */
export type SwapResultAsset = {
  blockchain: string
  address: string | null
  symbol: string
  logo: string
  decimals: number
  usdPrice: string | null
}

/**
 * A node of the swap path
 *
 * @property {string | null} marketId - Id of the market
 * @property {string | null} marketName - Name of the market, example: Uniswap
 * @property {number} percent - Percent of the allocation to this path, example: 45
 *
 */
export type SwapNode = {
  marketId: string | null
  marketName: string
  percent: number
}

/**
 * A swap path from asset x (from) to asset y (to)
 *
 * @property {string} from - Symbol of the source asset
 * @property {string | null} fromAddress - Contract address of source asset, null for native tokens
 * @property {string} fromBlockchain - Blockchain of the source asset
 * @property {string} fromLogo - Absolute path of logo of the source asset
 *
 * @property {string} to - Symbol of the destination asset
 * @property {string | null} toAddress - Contract address of destination asset, null for native tokens
 * @property {string} toBlockchain - Blockchain of the destination asset
 * @property {string} toLogo - Absolute path of logo of the destination asset
 *
 * @property {SwapNode[]} nodes - List of intermediate nodes in a swap path
 *
 */
export type SwapSuperNode = {
  from: string
  fromAddress: string | null
  fromBlockchain: string
  fromLogo: string
  to: string
  toAddress: string | null
  toBlockchain: string
  toLogo: string
  nodes: SwapNode[]
}

/**
 * Internal mechanism of a step
 *
 * @property {SwapSuperNode[] | null} nodes - List of parallel paths that splitting happens
 *
 */
export type SwapRoute = {
  nodes: SwapSuperNode[] | null
}

/**
 * Time estimation details for a step of swap route
 *
 * @property {number} min - The minimum duration (in seconds) that usually takes for related step
 * @property {number} avg - The average duration (in seconds) that usually takes for related step
 * @property {number} max - The maximum duration (in seconds) that usually takes for related step
 *
 */
export type TimeStat = {
  min: number
  avg: number
  max: number
}

/**
 * A step of a multi-step swap route
 *
 * @property {string} swapperId - Unique Id of swapper. example: 1INCH_BSC, TERRASWAP
 *
 * @property {'BRIDGE' | 'DEX' | 'AGGREGATOR'} swapperType - Type of swapper. example: BRIDGE, DEX, AGGREGATOR
 *
 * @property {'INTER_CHAIN' | 'INTRA_CHAIN'} swapChainType - Type of swapping. It could be inter chain or intra chain
 *
 * @property {SwapResultAsset} from - The source asset
 *
 * @property {SwapResultAsset} to - The destination asset
 *
 * @property {string} fromAmount - Estimated input amount of this step. Can be used for previewing to user and should
 * not be used for real computation, since it may change when the real transaction happens due to volatility of the market
 *
 * @property {string} toAmount - Estimated output amount of this step. Can be used for previewing to user and should
 * not be used for real computation, since it may change when the real transaction happens due to volatility of the market
 *
 * @property {SwapRoute[] | null} routes - The internal routing of this step showing how the initial swap request will
 * be split and executed. This can be used for previewing purpose to give the user a sense of what's going to happen.
 * Null indicates that there is no internal mechanism and swapping is simple and straight-forward.
 *
 * @property {SwapFee[]} fee - List of fees that are taken from user in this step
 *
 * @property {number | null} fromAmountMinValue - The minimum amount unit, the precision that will be applied to
 * transaction amount in create transaction endpoint automatically by Rango. This field is informational and there is
 * no need to apply it in client-side.
 *
 * @property {number | null} fromAmountMaxValue - Exactly the same as fromAmountMinValue, but for the maximum limit
 *
 * @property {number | null} fromAmountPrecision - The minimum amount unit, the precision that will be applied to
 * transaction amount in create transaction endpoint automatically by Rango. This field is informational and there
 * is no need to apply it in client-side
 *
 * @property {AmountRestrictionType} fromAmountRestrictionType - Specifies range for fromAmount (Min / Max) Value. for example if value
 * is EXCLUSIVE and fromAmountMinValue is 20, user can execute transaction if inputValue > 20, but for INCLUSIVE
 * inputValue >= 20 is valid. possible values: INCLUSIVE / EXCLUSIVE
 *
 * @property {number} estimatedTimeInSeconds - The estimated time (in seconds) that this step might take, beware that
 * this number is just an estimation and should be used only for user preview, example: 15
 *
 * @property {TimeStat | null} timeStat - The minimum, avg and max estimation time for this step
 *
 * @property {boolean} includesDestinationTx - Is it required to sign a transaction on the destination chain or not
 *
 * @property {number} maxRequiredSign - Max number of transaction signing required by the user
 *
 * @property {RecommendedSlippage | null} recommendedSlippage
 *
 * @property {string[] | null} warnings - List of warnings for this swap step, usually null or empty
 *
 */
export type SwapResult = {
  swapperId: string
  swapperType: SwapperType
  swapChainType: 'INTER_CHAIN' | 'INTRA_CHAIN'
  from: SwapResultAsset
  to: SwapResultAsset
  fromAmount: string
  toAmount: string
  routes: SwapRoute[] | null
  fee: SwapFee[]
  fromAmountMaxValue: number | null
  fromAmountMinValue: number | null
  fromAmountPrecision: number | null
  fromAmountRestrictionType: AmountRestrictionType
  estimatedTimeInSeconds: number
  timeStat: TimeStat | null
  includesDestinationTx: boolean
  maxRequiredSign: number
  recommendedSlippage: RecommendedSlippage | null
  warnings: string[] | null
}
