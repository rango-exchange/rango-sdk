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

export type HighValueLossLevel = 'low' | 'high'

export type HighValueLossWarning = {
  kind: 'HIGH_VALUE_LOSS'
  usdIn: number
  usdOut: number
  priceImpact: number
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

export type QuoteWarning =
  | HighValueLossWarning
  | UnknownPriceWarning
  | InsufficientSlippageWarning
  | HighSlippageWarning

export type RouteWarning = QuoteWarning | InsufficientBalanceWarning

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
      totalFee: totalFeeUsd(swaps),
      level: priceImpact <= thresholds.priceImpact.high ? 'high' : 'low',
    },
  ]
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
function totalFeeUsd(swaps: SwapResult[]): number {
  return swaps
    .flatMap((swap) => swap.fee)
    .filter((fee) => fee.expenseType !== 'DECREASE_FROM_OUTPUT')
    .reduce((total, fee) => total + Number(fee.amount) * (fee.price ?? 0), 0)
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
