import type {
  CheckedResponse,
  ErrorFields,
  Route,
  RouteResponse,
} from './types.js'
import type { BridgeLimitMetadata } from '../../errors/mod.js'
import type {
  Asset,
  BlockchainMeta,
  SimulationResult,
  SwapResult,
} from 'rango-sdk'

import BigNumber from 'bignumber.js'

import { NO_RESULT_MESSAGE, SdkError } from '../../errors/mod.js'

// Compares by blockchain, symbol and address; a missing and a null address are equal.
export function isSameAsset(a: Asset, b: Asset): boolean {
  return (
    a.blockchain === b.blockchain &&
    a.symbol === b.symbol &&
    (a.address ?? null) === (b.address ?? null)
  )
}

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

// A decimal string as a number, or null when it isn't one.
export function parseDecimal(value: string): number | null {
  if (!DECIMAL.test(value.trim())) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// Checks, in order: assets differ, then amount.
export function validateSwapRequest(request: {
  from: Asset
  to: Asset
  amount: string
}): void {
  if (isSameAsset(request.from, request.to)) {
    throw new SdkError('INVALID_INPUT', '`to` is the same asset as `from`.', {
      metadata: { field: 'to', reason: 'SAME_ASSET' },
    })
  }

  const amount = parseDecimal(request.amount)
  if (amount === null) {
    throw new SdkError('INVALID_INPUT', '`amount` is not a number.', {
      metadata: { field: 'amount', reason: 'NOT_A_NUMBER' },
    })
  }
  if (amount <= 0) {
    throw new SdkError('INVALID_INPUT', '`amount` is not greater than 0.', {
      metadata: { field: 'amount', reason: 'NOT_POSITIVE' },
    })
  }
}

// Checks a set destination against the address patterns of the blockchain named `blockchain`.
export function validateDestination(
  destination: string | undefined,
  blockchain: string,
  blockchains: readonly BlockchainMeta[] | undefined,
): void {
  if (destination === undefined || destination === '') {
    return
  }
  const patterns = blockchains?.find(
    (meta) => meta.name === blockchain,
  )?.addressPatterns
  if (!patterns?.length) {
    throw new SdkError(
      'INVALID_INPUT',
      "`destination` can't be checked: the destination blockchain has no address patterns in the client's `meta.blockchains`.",
      { metadata: { field: 'destination', reason: 'NO_ADDRESS_PATTERNS' } },
    )
  }
  if (!patterns.some((pattern) => matches(pattern, destination))) {
    throw new SdkError(
      'INVALID_INPUT',
      "`destination` doesn't match the address patterns of the destination blockchain.",
      { metadata: { field: 'destination', reason: 'PATTERN_MISMATCH' } },
    )
  }
}

// A pattern that isn't a valid regular expression matches nothing.
function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return false
  }
}

// The highest positive recommendation of any swap, flagged or not.
export function getMinRequiredSlippage(swaps: SwapResult[]): string | null {
  const slippages = swaps.map((swap) => swap.recommendedSlippage)
  return (
    slippages
      ?.map((s) => s?.slippage || '0')
      ?.filter((s) => parseFloat(s) > 0)
      ?.sort((a, b) => parseFloat(b) - parseFloat(a))
      ?.find(() => true) || null
  )
}

type RouteFields = {
  result: SimulationResult | null
  diagnosisMessages?: string[] | null
}

// Checks a route response: NO_RESULT for no result or no swaps, then the swap checks.
export function validateRoute<T extends RouteFields>(
  route: T,
): asserts route is T & { result: SimulationResult } {
  const { result, diagnosisMessages } = route
  if (!result || result.swaps.length === 0) {
    const diagnosisMessage = diagnosisMessages?.[0]
    throw new SdkError('NO_RESULT', NO_RESULT_MESSAGE, {
      metadata: diagnosisMessage === undefined ? {} : { diagnosisMessage },
    })
  }
  validateSwaps(result.swaps)
}

export function validateSwaps(swaps: SwapResult[]): void {
  for (const swap of swaps) {
    const brokenLimit = getBrokenLimit(swap)
    if (brokenLimit) {
      throw new SdkError(
        'BRIDGE_LIMIT',
        "The amount is outside a swap's limits.",
        { metadata: { swap, ...brokenLimit } },
      )
    }
  }
  if (checkSlippageErrors(swaps)) {
    throw new SdkError(
      'UNKNOWN_SLIPPAGE',
      "Rango failed to compute a swap's slippage.",
    )
  }
}

// Whether the server flags a swap as having no computed slippage.
function checkSlippageErrors(swaps: SwapResult[]): boolean {
  return swaps.some((swap) => swap.recommendedSlippage?.error)
}

type BrokenLimit = Omit<BridgeLimitMetadata, 'swap'>

/*
 * A falsy limit is no limit; EXCLUSIVE limits reject an amount equal to the limit.
 * The maximum is checked last, so MAX wins when both are broken.
 */
function getBrokenLimit(swap: SwapResult): BrokenLimit | null {
  const { fromAmount, fromAmountMinValue, fromAmountMaxValue } = swap
  const exclusive = swap.fromAmountRestrictionType === 'EXCLUSIVE'
  if (fromAmountMaxValue) {
    const maximum = new BigNumber(fromAmountMaxValue)
    if (exclusive ? maximum.lte(fromAmount) : maximum.lt(fromAmount)) {
      return { limit: 'MAX', limitValue: fromAmountMaxValue, exclusive }
    }
  }
  if (fromAmountMinValue) {
    const minimum = new BigNumber(fromAmountMinValue)
    if (exclusive ? minimum.gte(fromAmount) : minimum.gt(fromAmount)) {
      return { limit: 'MIN', limitValue: fromAmountMinValue, exclusive }
    }
  }
  return null
}

export function omitErrorFields<
  T extends Partial<Record<ErrorFields, unknown>>,
>(response: T): Omit<T, ErrorFields> {
  const {
    error: _error,
    errorCode: _errorCode,
    traceId: _traceId,
    ...rest
  } = response
  return rest
}

// The Route: a checked route response without its error fields and diagnosis messages.
export function omitRouteErrorFields(route: CheckedResponse): RouteResponse {
  const { diagnosisMessages: _diagnosisMessages, ...rest } =
    omitErrorFields(route)
  return rest
}

export function toRoute(
  route: CheckedResponse,
  selectedWallets: Route['selectedWallets'],
  slippage: string | undefined,
): Route {
  return {
    ...omitRouteErrorFields(route),
    selectedWallets: { ...selectedWallets },
    ...(slippage === undefined ? {} : { slippage }),
  }
}
