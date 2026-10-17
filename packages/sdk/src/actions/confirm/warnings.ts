import type { SdkWarning } from '../../warnings/mod.js'
import type { PricedRoute } from '../quote/mod.js'

import {
  createWarning,
  EXCESSIVE_OUTPUT_CHANGE_CRITERIA,
} from '../../warnings/mod.js'
import {
  getPercentageChange,
  getUsdInputFrom,
  getUsdOutputFrom,
} from '../quote/mod.js'

// Compares the confirmed Route's USD output with the Quote's. The input value is the Quote's.
export function getOutputChangeWarnings(
  quote: PricedRoute,
  route: PricedRoute,
): SdkWarning[] {
  const quotedUsdOutput = getUsdOutputFrom(quote)
  const confirmedUsdOutput = getUsdOutputFrom(route)
  if (
    !quotedUsdOutput ||
    !confirmedUsdOutput ||
    !isOutputAmountChangedExcessively(quote, route)
  ) {
    return []
  }
  return [
    createWarning('EXCESSIVE_OUTPUT_AMOUNT_CHANGE', {
      usdValueChange: confirmedUsdOutput.minus(quotedUsdOutput).toNumber(),
      percentageChange: getPercentageChange(
        quotedUsdOutput.toString(),
        confirmedUsdOutput.toString(),
      ),
    }),
  ]
}

export function isOutputAmountChangedExcessively(
  previousQuote: PricedRoute,
  currentQuote: PricedRoute,
): boolean {
  const usdInput = getUsdInputFrom(previousQuote)
  const previousUsdOutput = getUsdOutputFrom(previousQuote)
  const currentUsdOutput = getUsdOutputFrom(currentQuote)
  if (!usdInput || !previousUsdOutput || !currentUsdOutput) {
    return false
  }

  const percentageChange = getPercentageChange(
    previousUsdOutput.toString(),
    currentUsdOutput.toString(),
  )

  return EXCESSIVE_OUTPUT_CHANGE_CRITERIA.some(
    ({ threshold, minInput }) =>
      percentageChange <= threshold &&
      usdInput.isGreaterThanOrEqualTo(minInput),
  )
}
