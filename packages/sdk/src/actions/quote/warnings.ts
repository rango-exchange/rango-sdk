import type {
  HighValueLossLevel,
  RecommendedSlippage,
  SdkWarning,
} from '../../warnings/mod.js'
import type {
  BestRouteResponse,
  BlockchainValidationStatus,
  SimulationResult,
  SwapResult,
} from 'rango-sdk'

import BigNumber from 'bignumber.js'

import {
  createWarning,
  HIGH_FEE_THRESHOLD,
  HIGH_SLIPPAGE_THRESHOLD,
  HIGH_VALUE_LOSS_CRITERIA,
  LONG_DURATION_THRESHOLD,
  PRICE_IMPACT_LEVELS,
} from '../../warnings/mod.js'

import { getMinRequiredSlippage } from './utils.js'

export type PricedRoute = Pick<SimulationResult, 'outputAmount' | 'swaps'> & {
  requestAmount: string
}

export function getQuoteWarnings(
  route: PricedRoute,
  slippage: string | undefined,
): SdkWarning[] {
  return [
    ...getPriceWarnings(route),
    ...getSlippageWarnings(route.swaps, slippage),
    ...getFeeWarnings(route.swaps),
    ...getDurationWarnings(route.swaps),
  ]
}

// The warnings of a Route: the Quote warnings, then INSUFFICIENT_BALANCE.
export function getRouteWarnings(
  route: Pick<BestRouteResponse, 'requestAmount' | 'validationStatus'> & {
    result: SimulationResult
  },
  slippage: string | undefined,
): SdkWarning[] {
  return [
    ...getQuoteWarnings(
      {
        requestAmount: route.requestAmount,
        outputAmount: route.result.outputAmount,
        swaps: route.result.swaps,
      },
      slippage,
    ),
    ...getBalanceWarnings(route.validationStatus),
  ]
}

export function getBalanceWarnings(
  validationStatus: BlockchainValidationStatus[] | null,
): SdkWarning[] {
  return (validationStatus ?? []).flatMap(({ blockchain, wallets }) =>
    wallets.flatMap(({ address, requiredAssets }) =>
      requiredAssets
        .filter((required) => !required.ok)
        .map((required) =>
          createWarning('INSUFFICIENT_BALANCE', {
            blockchain,
            address,
            asset: required.asset,
            required: required.requiredAmount,
            current: required.currentAmount,
            reason: required.reason,
          }),
        ),
    ),
  )
}

function getPriceWarnings(route: PricedRoute): SdkWarning[] {
  const usdInput = getUsdInputFrom(route)
  const usdOutput = getUsdOutputFrom(route)
  if (!usdInput || !usdOutput) {
    return [createWarning('UNKNOWN_PRICE')]
  }
  const priceImpact = getPriceImpact(usdInput.toString(), usdOutput.toString())
  if (!priceImpact || !hasHighValueLoss(usdInput, priceImpact)) {
    return []
  }
  return [
    createWarning('HIGH_VALUE_LOSS', {
      inputUsdValue: usdInput.toNumber(),
      outputUsdValue: usdOutput.toNumber(),
      priceImpact,
      totalFee: getTotalFeeInUsd(route.swaps).toNumber(),
      warningLevel: getPriceImpactLevel(priceImpact),
    }),
  ]
}

function getFeeWarnings(swaps: SwapResult[]): SdkWarning[] {
  const totalFee = getTotalFeeInUsd(swaps)
  return totalFee.gte(HIGH_FEE_THRESHOLD)
    ? [createWarning('HIGH_FEE', { totalFee: totalFee.toNumber() })]
    : []
}

function getDurationWarnings(swaps: SwapResult[]): SdkWarning[] {
  const estimatedTimeInSeconds = swaps.reduce(
    (total, swap) => total + (swap.estimatedTimeInSeconds ?? 0),
    0,
  )
  return estimatedTimeInSeconds >= LONG_DURATION_THRESHOLD
    ? [createWarning('LONG_DURATION', { estimatedTimeInSeconds })]
    : []
}

// Skipped when the request has no slippage.
function getSlippageWarnings(
  swaps: SwapResult[],
  slippage: string | undefined,
): SdkWarning[] {
  const userSlippage = parseFloat(slippage ?? '')
  if (Number.isNaN(userSlippage)) {
    return []
  }
  const minRequiredSlippage = getMinRequiredSlippage(swaps)
  if (
    minRequiredSlippage &&
    !hasProperSlippage(userSlippage, minRequiredSlippage)
  ) {
    return [
      createWarning('INSUFFICIENT_SLIPPAGE', {
        recommendedSlippages: checkSlippageWarnings(swaps, userSlippage),
        minRequiredSlippage,
      }),
    ]
  }
  if (
    userSlippage > HIGH_SLIPPAGE_THRESHOLD &&
    parseFloat(minRequiredSlippage ?? '0') < userSlippage
  ) {
    return [
      createWarning('HIGH_SLIPPAGE', { slippage: userSlippage.toString() }),
    ]
  }
  return []
}

const PERCENT_MULTIPLIER = 100

export function getUsdInputFrom(route: PricedRoute): BigNumber | undefined {
  const inputAmount = route.requestAmount
  const inputTokenUsdPrice = route.swaps[0]?.from.usdPrice
  if (!inputAmount || !inputTokenUsdPrice) {
    return
  }
  return new BigNumber(inputAmount).multipliedBy(inputTokenUsdPrice)
}

export function getUsdOutputFrom(route: PricedRoute): BigNumber | undefined {
  const outputAmount = route.outputAmount || null
  const outputTokenUsdPrice = route.swaps[route.swaps.length - 1]?.to.usdPrice
  if (!outputAmount || !outputTokenUsdPrice) {
    return
  }
  return new BigNumber(outputAmount).multipliedBy(outputTokenUsdPrice)
}

export function getPercentageChange(input: string, output: string): number {
  return new BigNumber(output)
    .div(new BigNumber(input))
    .minus(1)
    .multipliedBy(PERCENT_MULTIPLIER)
    .toNumber()
}

// Only a loss is a price impact: no change, a gain, NaN, a zero input or a non-positive output give null.
export function getPriceImpact(
  inputUsdValue: BigNumber | string | null,
  outputUsdValue: BigNumber | string | null,
): number | null {
  const outputUsdValueIsInvalid =
    typeof outputUsdValue === 'string'
      ? parseFloat(outputUsdValue) <= 0
      : !outputUsdValue?.gt(0)
  const percentageChange =
    !inputUsdValue || !outputUsdValue || outputUsdValueIsInvalid
      ? null
      : getPercentageChange(inputUsdValue.toString(), outputUsdValue.toString())

  return percentageChange && percentageChange < 0 ? percentageChange : null
}

export function getPriceImpactLevel(priceImpact: number): HighValueLossLevel {
  let warningLevel: HighValueLossLevel = undefined
  if (
    priceImpact <= PRICE_IMPACT_LEVELS.low &&
    priceImpact > PRICE_IMPACT_LEVELS.high
  ) {
    warningLevel = 'low'
  } else if (priceImpact <= PRICE_IMPACT_LEVELS.high) {
    warningLevel = 'high'
  }
  return warningLevel
}

// The price impact is rounded to two decimals, then truncated toward zero, so -9.996 counts as -10 and -9.99 as -9.
export function hasHighValueLoss(
  inputUsdValue: BigNumber | null,
  priceImpact: number,
): boolean {
  if (!inputUsdValue) {
    return false
  }
  const formattedPriceImpact = parseInt(priceImpact.toFixed(2) || '0')
  return HIGH_VALUE_LOSS_CRITERIA.some(
    ({ threshold, minInput }) =>
      formattedPriceImpact <= threshold &&
      inputUsdValue.gte(new BigNumber(minInput)),
  )
}

// Uses each fee's own `price`.
export function getUsdFeeOfStep(step: SwapResult): BigNumber {
  let totalFeeInUsd = new BigNumber(0)
  for (const fee of step.fee) {
    if (!fee || fee.expenseType === 'DECREASE_FROM_OUTPUT') {
      continue
    }
    totalFeeInUsd = totalFeeInUsd.plus(
      new BigNumber(fee.amount).multipliedBy(fee.price || 0),
    )
  }
  return totalFeeInUsd
}

export function getTotalFeeInUsd(swaps: SwapResult[]): BigNumber {
  return swaps.reduce(
    (totalFee, step) => totalFee.plus(getUsdFeeOfStep(step)),
    new BigNumber(0),
  )
}

export function hasProperSlippage(
  userSlippage: number,
  minRequiredSlippage: string | null,
): boolean {
  if (!minRequiredSlippage) {
    return true
  }
  return userSlippage >= parseFloat(minRequiredSlippage)
}

export function checkSlippageWarnings(
  swaps: SwapResult[],
  userSlippage: number,
): RecommendedSlippage[] {
  return swaps.flatMap((swap, swapIndex) =>
    swap.recommendedSlippage?.slippage &&
    parseFloat(swap.recommendedSlippage.slippage) > userSlippage
      ? [{ swapIndex, slippage: swap.recommendedSlippage.slippage }]
      : [],
  )
}
