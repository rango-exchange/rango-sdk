/*
 * To add a warning:
 * 1. Add its type to `SdkWarningMetadata` with its metadata type, or `undefined` when it has none.
 * 2. Add its message to `WARNING_MESSAGES` in `implementation.ts`.
 * 3. Export its metadata type from this folder's `mod.ts` and from the package entry.
 * 4. Document it in the README's Warnings table, and how its figures are computed as JSDoc on its metadata type here.
 */

import type { Amount, Asset, WalletRequiredAssets } from 'rango-sdk'

/**
 * The `warningLevel` of `HIGH_VALUE_LOSS`, from the unrounded price impact: `high` at or below `-10`, otherwise `low`
 * at or below `-3`, otherwise `undefined`. `HIGH_VALUE_LOSS` needs a price impact of about `-5` or below, so it's never
 * `undefined` in practice.
 */
export type HighValueLossLevel = 'low' | 'high' | undefined

/** What the short amount is needed for: `FEE`, `INPUT_ASSET` or `FEE_AND_INPUT_ASSET`. */
export type InsufficientBalanceReason = WalletRequiredAssets['reason']

/**
 * The route loses a large share of the input's USD value.
 *
 * Raised when the price impact, rounded to two decimals and then cut to a whole number (`parseInt`, so `-9.996` counts
 * as `-10` and `-9.99` as `-9`), is at or below `-10` with an `inputUsdValue` of at least 400, or at or below `-5`
 * with at least 1000.
 */
export type HighValueLossWarningMetadata = {
  /** The request amount times the first swap's input USD price. */
  inputUsdValue: number
  /** The output amount times the last swap's output USD price. */
  outputUsdValue: number
  /**
   * The change from `inputUsdValue` to `outputUsdValue` as a percentage, such as `-12.5`, unrounded.
   * It's only defined when it's negative and both USD values are above 0, so it's always negative here.
   */
  priceImpact: number
  /**
   * The same total as `HIGH_FEE`'s: the USD total of the fees not taken from the output (`DECREASE_FROM_OUTPUT`),
   * which are already reflected in `outputUsdValue`. Each fee is valued at its own `price`, and an unknown price
   * counts as 0, so the total can be too low.
   */
  totalFee: number
  /** From the unrounded `priceImpact`; see `HighValueLossLevel`. */
  warningLevel: HighValueLossLevel
}

export type RecommendedSlippage = {
  swapIndex: number
  slippage: string
}

/**
 * The requested slippage is below the highest slippage any swap recommends.
 *
 * Skipped when there is no slippage (on `confirm()`, the slippage is the Quote's). Slippages are read with
 * `parseFloat`. A swap the server flags as having no computed slippage gets the
 * `UNKNOWN_SLIPPAGE` error, and this warning can still be raised for that route, so a `quotes()` entry can carry both.
 */
export type InsufficientSlippageWarningMetadata = {
  /** Each swap whose recommended slippage is above the requested one, with that recommendation. */
  recommendedSlippages: RecommendedSlippage[]
  /** The highest slippage recommended by any swap, as the server sent it. */
  minRequiredSlippage: string
}

/**
 * The requested slippage is above 5 (%) and higher than the minimum any swap requires.
 *
 * Skipped when there is no slippage (on `confirm()`, the slippage is the Quote's), and when
 * `INSUFFICIENT_SLIPPAGE` is raised.
 */
export type HighSlippageWarningMetadata = {
  /** The requested slippage, read with `parseFloat` and turned back into a string, so `'5.0'` becomes `'5'`. */
  slippage: string
}

/** The route's total fee is at or above 30 USD. */
export type HighFeeWarningMetadata = {
  /**
   * The sum, over every swap, of each fee's `amount` times its own `price`, in USD. Fees taken from the output
   * (`DECREASE_FROM_OUTPUT`) are left out, as they are already reflected in the output amount. A fee with an unknown
   * price counts as 0, so the total can be too low.
   */
  totalFee: number
}

/** The route's estimated time is at or above 900 seconds. */
export type LongDurationWarningMetadata = {
  /** The sum of every swap's estimated time, where a missing time counts as 0. */
  estimatedTimeInSeconds: number
}

/**
 * A wallet doesn't hold enough of an asset: one warning per asset that is short.
 *
 * It comes from the server's balance check (every `ok: false` entry of `validationStatus`, in the server's order),
 * so only `confirm()` and a `quote()` without `checkPrerequisites: false` return it.
 */
export type InsufficientBalanceWarningMetadata = {
  blockchain: string
  address: string
  asset: Asset
  /** A machine-readable amount, `{ amount, decimals }`. */
  required: Amount
  /** A machine-readable amount, `{ amount, decimals }`. */
  current: Amount
  reason: InsufficientBalanceReason
}

/**
 * The confirmed output is worth much less than the cached Quote's output.
 * Only `confirm()` returns it.
 *
 * Raised when `percentageChange` is at or below `-1` with a Quote input of at least 1000 USD, or at or below `-2` with
 * at least 500. The input value is the Quote's. Skipped when a USD value can't be computed, and when the Quote's output is worth 0 USD.
 */
export type ExcessiveOutputAmountChangeWarningMetadata = {
  /** The confirmed output's USD value minus the Quote's, unrounded. */
  usdValueChange: number
  /** `usdValueChange` as a percentage of the Quote's output USD value, such as `-2.5`, unrounded. */
  percentageChange: number
}

export type SdkWarningMetadata = {
  HIGH_VALUE_LOSS: HighValueLossWarningMetadata
  /**
   * The input or the output has no USD price, or no amount, so no USD value. A USD price of 0 counts as no price.
   * An amount of 0, or one that isn't a number, skips both price warnings (this one and `HIGH_VALUE_LOSS`); the
   * other warnings are still raised.
   */
  UNKNOWN_PRICE: undefined
  INSUFFICIENT_SLIPPAGE: InsufficientSlippageWarningMetadata
  HIGH_SLIPPAGE: HighSlippageWarningMetadata
  HIGH_FEE: HighFeeWarningMetadata
  LONG_DURATION: LongDurationWarningMetadata
  INSUFFICIENT_BALANCE: InsufficientBalanceWarningMetadata
  EXCESSIVE_OUTPUT_AMOUNT_CHANGE: ExcessiveOutputAmountChangeWarningMetadata
}
