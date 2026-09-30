import type {
  AmountOutOfRangeMetadata,
  NoRouteMetadata,
  SlippageTooLowMetadata,
} from './errors.js'
import type { SimulationResult, SwapResult } from 'rango-sdk'

export type SwapsValidationError =
  | { type: 'AMOUNT_OUT_OF_RANGE'; metadata: AmountOutOfRangeMetadata }
  | { type: 'SLIPPAGE_TOO_LOW'; metadata: SlippageTooLowMetadata }

export type RouteValidationError =
  | { type: 'NO_ROUTE'; metadata: NoRouteMetadata }
  | SwapsValidationError

export function validateRoute(
  result: SimulationResult | null,
  diagnosisMessages: string[] | null | undefined,
): RouteValidationError | null {
  if (!result || result.swaps.length === 0) {
    const diagnosisMessage = diagnosisMessages?.[0]
    return {
      type: 'NO_ROUTE',
      metadata: diagnosisMessage === undefined ? {} : { diagnosisMessage },
    }
  }
  return validateSwaps(result.swaps)
}

export function validateSwaps(
  swaps: SwapResult[],
): SwapsValidationError | null {
  const amountOutOfRange = findAmountOutOfRange(swaps)
  if (amountOutOfRange) {
    return { type: 'AMOUNT_OUT_OF_RANGE', metadata: amountOutOfRange }
  }
  const slippageTooLow = findSlippageTooLow(swaps)
  if (slippageTooLow) {
    return { type: 'SLIPPAGE_TOO_LOW', metadata: slippageTooLow }
  }
  return null
}

export function findAmountOutOfRange(
  swaps: SwapResult[],
): AmountOutOfRangeMetadata | null {
  const swapIndex = swaps.findIndex((swap) => !isAmountInRange(swap))
  if (swapIndex === -1) {
    return null
  }
  const swap = swaps[swapIndex]
  return {
    swapIndex,
    swap,
    min: swap.fromAmountMinValue,
    max: swap.fromAmountMaxValue,
    restrictionType: swap.fromAmountRestrictionType,
  }
}

export function findSlippageTooLow(
  swaps: SwapResult[],
): SlippageTooLowMetadata | null {
  const recommendedSlippages = swaps.flatMap((swap, swapIndex) =>
    swap.recommendedSlippage?.error
      ? [{ swapIndex, slippage: swap.recommendedSlippage.slippage }]
      : [],
  )
  if (recommendedSlippages.length === 0) {
    return null
  }
  // Like the widget, the minimum required is the highest recommendation of any swap, flagged or not.
  const minRequiredSlippage = swaps.reduce(
    (max, swap) =>
      swap.recommendedSlippage &&
      compareDecimals(swap.recommendedSlippage.slippage, max) > 0
        ? swap.recommendedSlippage.slippage
        : max,
    recommendedSlippages[0].slippage,
  )
  return { recommendedSlippages, minRequiredSlippage }
}

// EXCLUSIVE limits reject an amount equal to the limit; INCLUSIVE limits accept it.
function isAmountInRange(swap: SwapResult): boolean {
  const { fromAmount, fromAmountMinValue: min, fromAmountMaxValue: max } = swap
  const exclusive = swap.fromAmountRestrictionType === 'EXCLUSIVE'
  if (min !== null) {
    const order = compareDecimals(fromAmount, min)
    if (order < 0 || (exclusive && order === 0)) {
      return false
    }
  }
  if (max !== null) {
    const order = compareDecimals(fromAmount, max)
    if (order > 0 || (exclusive && order === 0)) {
      return false
    }
  }
  return true
}

const PLAIN_DECIMAL = /^(\d*)(?:\.(\d*))?$/

// Compares non-negative decimal strings exactly, falling back to Number for other formats.
function compareDecimals(a: string, b: string): number {
  const matchA = PLAIN_DECIMAL.exec(a.trim())
  const matchB = PLAIN_DECIMAL.exec(b.trim())
  if (!matchA || !matchB) {
    return Math.sign(Number(a) - Number(b))
  }
  const intA = (matchA[1] ?? '').replace(/^0+/, '')
  const intB = (matchB[1] ?? '').replace(/^0+/, '')
  if (intA.length !== intB.length) {
    return intA.length > intB.length ? 1 : -1
  }
  const fracLength = Math.max(matchA[2]?.length ?? 0, matchB[2]?.length ?? 0)
  const digitsA = intA + (matchA[2] ?? '').padEnd(fracLength, '0')
  const digitsB = intB + (matchB[2] ?? '').padEnd(fracLength, '0')
  return digitsA === digitsB ? 0 : digitsA > digitsB ? 1 : -1
}
