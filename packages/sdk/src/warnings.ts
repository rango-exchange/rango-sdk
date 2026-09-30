import type { RecommendedSlippage } from './errors.js'
import type { ValidationThresholds } from './thresholds.js'
import type {
  Amount,
  Asset,
  BlockchainValidationStatus,
  SimulationResult,
  SwapResult,
  WalletRequiredAssets,
} from 'rango-sdk'

export type HighValueLossLevel = 'low' | 'high' | null

export type HighValueLossWarning = {
  kind: 'HIGH_VALUE_LOSS'
  usdIn: number
  usdOut: number
  priceImpact: number
  /** USD total of the fees not taken from the output; those are already reflected in `usdOut`. Fees with an unknown price count as 0. */
  totalFee: number
  level: HighValueLossLevel
}

export type UnknownPriceWarning = {
  kind: 'UNKNOWN_PRICE'
}

export type InsufficientSlippageWarning = {
  kind: 'INSUFFICIENT_SLIPPAGE'
  recommendedSlippages: RecommendedSlippage[]
  minRequired: string
}

export type HighSlippageWarning = {
  kind: 'HIGH_SLIPPAGE'
  slippage: string
}

export type HighFeeWarning = {
  kind: 'HIGH_FEE'
  /** USD total of every fee, including those taken from the output. */
  totalFeeUsd: number
}

export type LongDurationWarning = {
  kind: 'LONG_DURATION'
  estimatedTimeInSeconds: number
}

export type InsufficientBalanceReason = WalletRequiredAssets['reason']

export type InsufficientBalanceWarning = {
  kind: 'INSUFFICIENT_BALANCE'
  blockchain: string
  address: string
  asset: Asset
  required: Amount
  current: Amount
  reason: InsufficientBalanceReason
}

export type ExcessiveOutputChangeWarning = {
  kind: 'EXCESSIVE_OUTPUT_CHANGE'
  usdValueChange: number
  percentageChange: number
}

export type QuoteWarning =
  | HighValueLossWarning
  | UnknownPriceWarning
  | InsufficientSlippageWarning
  | HighSlippageWarning
  | HighFeeWarning
  | LongDurationWarning

export type RouteWarning = QuoteWarning | InsufficientBalanceWarning

export type ConfirmWarning = RouteWarning | ExcessiveOutputChangeWarning

export type PricedRoute = Pick<SimulationResult, 'outputAmount' | 'swaps'> & {
  requestAmount: string
}

export function quoteWarnings(
  route: PricedRoute,
  slippage: string | undefined,
  thresholds: ValidationThresholds,
): QuoteWarning[] {
  return [
    ...priceWarnings(route, thresholds),
    ...slippageWarnings(route.swaps, slippage, thresholds),
    ...feeWarnings(route.swaps, thresholds),
    ...durationWarnings(route.swaps, thresholds),
  ]
}

export function balanceWarnings(
  validationStatus: BlockchainValidationStatus[] | null,
): InsufficientBalanceWarning[] {
  return (validationStatus ?? []).flatMap(({ blockchain, wallets }) =>
    wallets.flatMap(({ address, requiredAssets }) =>
      requiredAssets
        .filter((required) => !required.ok)
        .map((required) => ({
          kind: 'INSUFFICIENT_BALANCE' as const,
          blockchain,
          address,
          asset: required.asset,
          required: required.requiredAmount,
          current: required.currentAmount,
          reason: required.reason,
        })),
    ),
  )
}

const PERCENT = 100

// Compares the confirmed Route's USD output with the Quote's. The input value is the Route's.
export function outputChangeWarnings(
  quote: PricedRoute,
  route: PricedRoute,
  thresholds: ValidationThresholds,
): ExcessiveOutputChangeWarning[] {
  const usdIn = usdValue(route.requestAmount, route.swaps[0]?.from.usdPrice)
  const quotedUsdOut = usdValue(
    quote.outputAmount,
    quote.swaps.at(-1)?.to.usdPrice,
  )
  const confirmedUsdOut = usdValue(
    route.outputAmount,
    route.swaps.at(-1)?.to.usdPrice,
  )
  if (
    usdIn === null ||
    quotedUsdOut === null ||
    confirmedUsdOut === null ||
    quotedUsdOut <= 0
  ) {
    return []
  }
  const usdValueChange = confirmedUsdOut - quotedUsdOut
  const percentageChange = (usdValueChange * PERCENT) / quotedUsdOut
  const excessive = thresholds.excessiveOutputChange.some(
    ({ threshold, minInput }) =>
      percentageChange <= threshold && usdIn >= minInput,
  )
  return excessive
    ? [{ kind: 'EXCESSIVE_OUTPUT_CHANGE', usdValueChange, percentageChange }]
    : []
}

function priceWarnings(
  route: PricedRoute,
  thresholds: ValidationThresholds,
): QuoteWarning[] {
  const { swaps } = route
  const usdIn = usdValue(route.requestAmount, swaps[0]?.from.usdPrice)
  const usdOut = usdValue(route.outputAmount, swaps.at(-1)?.to.usdPrice)
  // A zero input value leaves the price impact undefined. A zero output is a -100% price impact.
  if (usdIn === null || usdOut === null || usdIn <= 0) {
    return [{ kind: 'UNKNOWN_PRICE' }]
  }
  const priceImpact = ((usdOut - usdIn) * PERCENT) / usdIn
  const highValueLoss = thresholds.highValueLoss.some(
    ({ threshold, minInput }) => priceImpact <= threshold && usdIn >= minInput,
  )
  if (priceImpact >= 0 || !highValueLoss) {
    return []
  }
  return [
    {
      kind: 'HIGH_VALUE_LOSS',
      usdIn,
      usdOut,
      priceImpact,
      totalFee: feesNotFromOutputUsd(swaps),
      level: priceImpactLevel(priceImpact, thresholds),
    },
  ]
}

function priceImpactLevel(
  priceImpact: number,
  thresholds: ValidationThresholds,
): HighValueLossLevel {
  if (priceImpact <= thresholds.priceImpact.high) {
    return 'high'
  }
  return priceImpact <= thresholds.priceImpact.low ? 'low' : null
}

function usdValue(
  amount: string,
  usdPrice: number | null | undefined,
): number | null {
  const value = Number(amount)
  if (!usdPrice || !amount || !Number.isFinite(value)) {
    return null
  }
  return value * usdPrice
}

// Like the widget, fees taken from the output are already reflected in the output amount.
function feesNotFromOutputUsd(swaps: SwapResult[]): number {
  return swaps
    .flatMap((swap) => swap.fee)
    .filter((fee) => fee.expenseType !== 'DECREASE_FROM_OUTPUT')
    .reduce((total, fee) => total + Number(fee.amount) * (fee.price ?? 0), 0)
}

// Unlike feesNotFromOutputUsd, this counts every fee, and is skipped when a price is unknown so the total is never too low.
function feeWarnings(
  swaps: SwapResult[],
  thresholds: ValidationThresholds,
): HighFeeWarning[] {
  let totalFeeUsd = 0
  for (const fee of swaps.flatMap((swap) => swap.fee)) {
    if (fee.price === null || fee.price === undefined) {
      return []
    }
    totalFeeUsd += Number(fee.amount) * fee.price
  }
  return totalFeeUsd >= thresholds.highFee
    ? [{ kind: 'HIGH_FEE', totalFeeUsd }]
    : []
}

function durationWarnings(
  swaps: SwapResult[],
  thresholds: ValidationThresholds,
): LongDurationWarning[] {
  const estimatedTimeInSeconds = swaps.reduce(
    (total, swap) => total + (swap.estimatedTimeInSeconds ?? 0),
    0,
  )
  return estimatedTimeInSeconds >= thresholds.longDuration
    ? [{ kind: 'LONG_DURATION', estimatedTimeInSeconds }]
    : []
}

function slippageWarnings(
  swaps: SwapResult[],
  slippage: string | undefined,
  thresholds: ValidationThresholds,
): QuoteWarning[] {
  const requested = Number(slippage)
  if (!slippage || !Number.isFinite(requested)) {
    return []
  }
  const minRequired = highestRecommendedSlippage(swaps)
  const hasSlippageError = swaps.some((swap) => swap.recommendedSlippage?.error)
  if (
    minRequired !== null &&
    requested < Number(minRequired) &&
    !hasSlippageError
  ) {
    return [
      {
        kind: 'INSUFFICIENT_SLIPPAGE',
        recommendedSlippages: swaps.flatMap((swap, swapIndex) =>
          swap.recommendedSlippage &&
          Number(swap.recommendedSlippage.slippage) > requested
            ? [{ swapIndex, slippage: swap.recommendedSlippage.slippage }]
            : [],
        ),
        minRequired,
      },
    ]
  }
  if (
    requested > thresholds.highSlippage &&
    (minRequired === null || Number(minRequired) < requested)
  ) {
    return [{ kind: 'HIGH_SLIPPAGE', slippage }]
  }
  return []
}

function highestRecommendedSlippage(swaps: SwapResult[]): string | null {
  return swaps.reduce<string | null>((max, swap) => {
    const slippage = swap.recommendedSlippage?.slippage
    return slippage !== undefined &&
      Number(slippage) > 0 &&
      (max === null || Number(slippage) > Number(max))
      ? slippage
      : max
  }, null)
}
