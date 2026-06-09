import {
  Asset,
  Amount,
  SwapperType,
  ExpenseType,
  AmountRestrictionType,
  AssetWithTicker,
} from '../shared/index.js'

export {
  Asset,
  Amount,
  SwapperType,
  ExpenseType,
  AmountRestrictionType,
  AssetWithTicker,
}

/** Minimum required slippage of a step */
export type RecommendedSlippage = {
  /** If true, means that Rango failed to compute slippage for this step. */
  error: boolean
  /** The slippage amount in percent, example: 5 */
  slippage: string
}

/** EVM Fee Info for the Swap Fee */
export type EVMFeeMeta = {
  /** type of the fee meta  */
  type: 'EvmNetworkFeeMeta'
  /** gas limit */
  gasLimit: string
  /** gas price */
  gasPrice: string
}

/** A fee unit, including the type of asset and the amount of fee */
export type SwapFee = {
  /** A display name for this fee, example: Network Fee */
  name: string
  /** Type of the fee, example: FROM_SOURCE_WALLET */
  expenseType: ExpenseType
  /** Underlying asset for paying fee, example: BNB for BSC blockchain */
  asset: Asset
  /** The human readable amount of fee, example: 0.004 */
  amount: string
  /** Price of the fee asset */
  price: number | null
  meta: EVMFeeMeta | null
}

/** Source or destination asset of a route step */
export type SwapResultAsset = {
  /** Blockchain of the source/destination asset of this step */
  blockchain: string
  /** Contract address of the source/dest asset of this step, null for native token */
  address: string | null
  /** Symbol of the source/destination asset of this step, example: OSMO */
  symbol: string
  /** Absolute path of the logo of the source/destination asset of this step */
  logo: string
  /** Absolute path of the logo of the asset blockchain */
  blockchainLogo: string
  /** Decimals of the source/destination asset of this step, example: 18 */
  decimals: number
  /** Usd price unit for the asset if available */
  usdPrice: number | null
}

/** A node of the swap path */
export type SwapNode = {
  /** Id of the market */
  marketId: string | null
  /** Name of the market, example: Uniswap */
  marketName: string
  /** Percent of the allocation to this path, example: 45 */
  percent: number
}

/** A swap path from asset x (from) to asset y (to) */
export type SwapSuperNode = {
  /** Symbol of the source asset */
  from: string
  /** Contract address of source asset, null for native tokens */
  fromAddress: string | null
  /** Blockchain of the source asset */
  fromBlockchain: string
  /** Absolute path of logo of the source asset */
  fromLogo: string
  /** Symbol of the destination asset */
  to: string
  /** Contract address of destination asset, null for native tokens */
  toAddress: string | null
  /** Blockchain of the destination asset */
  toBlockchain: string
  /** Absolute path of logo of the destination asset */
  toLogo: string
  /** List of intermediate nodes in a swap path */
  nodes: SwapNode[]
}

/** Internal mechanism of a step */
export type SwapRoute = {
  /** List of parallel paths that splitting happens */
  nodes: SwapSuperNode[] | null
}

/** Time estimation details for a step of swap route */
export type TimeStat = {
  /** The minimum duration (in seconds) that usually takes for related step */
  min: number
  /** The average duration (in seconds) that usually takes for related step */
  avg: number
  /** The maximum duration (in seconds) that usually takes for related step */
  max: number
}

/** A step of a multi-step swap route */
export type SwapResult = {
  /** Unique Id of swapper. example: PARASWAP */
  swapperId: string
  /** Logo of the swapper */
  swapperLogo: string
  /** Type of swapper. example: BRIDGE, DEX, AGGREGATOR */
  swapperType: SwapperType
  /** Type of swapping. It could be inter chain or intra chain */
  swapChainType: 'INTER_CHAIN' | 'INTRA_CHAIN'
  /** The source asset */
  from: SwapResultAsset
  /** The destination asset */
  to: SwapResultAsset
  /**
   * Estimated output amount of this step. Can be used for previewing to user and should
   * not be used for real computation, since it may change when the real transaction happens due to volatility of the market
   */
  toAmount: string
  /**
   * Estimated input amount of this step. Can be used for previewing to user and should
   * not be used for real computation, since it may change when the real transaction happens due to volatility of the market
   */
  fromAmount: string
  /** Exactly the same as fromAmountMinValue, but for the maximum limit */
  fromAmountMaxValue: string | null
  /**
   * The minimum amount unit, the precision that will be applied to
   * transaction amount in create transaction endpoint automatically by Rango. This field is informational and there is
   * no need to apply it in client-side.
   */
  fromAmountMinValue: string | null
  /**
   * The minimum amount unit, the precision that will be applied to
   * transaction amount in create transaction endpoint automatically by Rango. This field is informational and there
   * is no need to apply it in client-side
   */
  fromAmountPrecision: string | null
  /** Type of from amount restriction */
  fromAmountRestrictionType: AmountRestrictionType
  /**
   * The internal routing of this step showing how the initial swap request will
   * be split and executed. This can be used for previewing purpose to give the user a sense of what's going to happen.
   * Null indicates that there is no internal mechanism and swapping is simple and straight-forward.
   */
  routes: SwapRoute[] | null
  /** The internal swaps for this step. Used for aggregators' internal steps. */
  internalSwaps: SwapResult[] | null
  /** List of fees that are taken from user in this step */
  fee: SwapFee[]
  /**
   * The estimated time (in seconds) that this step might take, beware that
   * this number is just an estimation and should be used only for user preview, example: 15
   */
  estimatedTimeInSeconds: number
  /** The minimum, avg and max estimation time for this step */
  timeStat: TimeStat | null
  /** Is it required to sign a transaction on the destination chain or not */
  includesDestinationTx: boolean
  /** Max number of transaction signing required by the user */
  maxRequiredSign: number
  recommendedSlippage: RecommendedSlippage | null
  /** List of warnings for this swap step, it's usually an empty list */
  warnings: string[]
}
