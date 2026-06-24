import { SwapperMeta, Token } from './meta.js'
import {
  Asset,
  Amount,
  SwapperType,
  ExpenseType,
  AmountRestrictionType,
  AssetWithTicker,
  RequestedAsset,
} from '../shared/index.js'

export {
  Asset,
  Amount,
  SwapperType,
  ExpenseType,
  AmountRestrictionType,
  AssetWithTicker,
  RequestedAsset,
}

/** EVM Fee Info for the Swap Fee */
export type EVMFeeMeta = {
  /** type of the fee meta */
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
  /** Underlying token for paying fee, example: BNB for BSC blockchain */
  token: Token
  /** Type of the fee, example: FROM_SOURCE_WALLET */
  expenseType: ExpenseType
  /** The human readable amount of fee, example: 0.004 */
  amount: string
  /** Fee meta info for this type of blockchain. ATM, used for the EVM quotes. */
  meta: EVMFeeMeta | null
}

/** A quote path from asset x (from) to asset y (to) */
export type QuotePath = {
  /** The source asset */
  from: Token
  /** The destination asset */
  to: Token
  /** Swapper for this path */
  swapper: SwapperMeta
  /** Type of swapper */
  swapperType: SwapperType
  /** Input amount */
  inputAmount: string
  /** Expected output */
  expectedOutput: string
  /** Expected duration */
  estimatedTimeInSeconds: number
}

/** Limitations on input amount for requested route */
export type AmountRestriction = {
  /** Limitation on minimum input amount for this route */
  min: string | null
  /** Limitation on maximum input amount for this route */
  max: string | null
  /** type of limitation */
  type: AmountRestrictionType
}

/** A step of a multi-step swap route */
export type QuoteSimulationResult = {
  /** Source token */
  from: Token
  /** Destination token */
  to: Token
  /** The estimation of Rango from output amount for Y */
  outputAmount: string
  /** The estimation of Rango from output amount for Y */
  outputAmountMin: string
  /** The estimation of Rango from output usd value for Y */
  outputAmountUsd: number | null
  /** Swapper suggested for this path */
  swapper: SwapperMeta
  /**
   * The internal routing of this step showing how the initial swap request will
   * be split and executed. This can be used for previewing purpose to give the user a sense of what's going to happen.
   * Null indicates that there is no internal mechanism and swapping is simple and straight-forward.
   */
  path: QuotePath[] | null
  /** List of fees that are taken from user in this step */
  fee: SwapFee[]
  /** Amount of fee in usd */
  feeUsd: number | null
  /**
   * restrictions on input amount. This field is informational
   * and there is no need to apply it in client-side
   */
  amountRestriction: AmountRestriction | null
  /**
   * The estimated time (in seconds) that this step might take, beware that
   * this number is just an estimation and should be used only for user preview, example: 15
   */
  estimatedTimeInSeconds: number
}
