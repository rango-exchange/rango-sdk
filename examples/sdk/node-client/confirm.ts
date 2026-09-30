import type { Quote } from '@rango-dev/sdk'

import { ConfirmError, getClient } from '@rango-dev/sdk'

import { describeInvalidInput } from './invalid-input.js'
import { selectedWallets } from './quote.js'
import { printWarnings } from './warnings.js'

const TIMEOUT_MS = 30_000

export async function confirmFirstQuote(quotes: Quote[]) {
  // A Quote with an error can't be confirmed; confirm() would throw it right away.
  const quote = quotes.find((candidate) => !candidate.error)
  if (!quote) {
    console.log('No Quote can be confirmed.')
    return
  }

  try {
    const { route, warnings } = await getClient().confirm(
      quote,
      { selectedWallets },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    )

    console.log(
      `Confirmed route: ${route.requestAmount} ${route.from.symbol} -> ${route.outputAmount} ${route.to.symbol} (quoted ${quote.outputAmount})`,
    )
    printWarnings(warnings)
  } catch (error) {
    if (!(error instanceof ConfirmError)) {
      throw error
    }
    switch (error.type) {
      case 'INVALID_INPUT':
        console.log(
          `Invalid ${error.metadata.field}: ${describeInvalidInput(error.metadata)}`,
        )
        break
      case 'CANCELED':
        console.log('The confirm request timed out.')
        break
      case 'NO_ROUTE':
        console.log(
          `The route is no longer available${error.metadata.diagnosisMessage ? `: ${error.metadata.diagnosisMessage}` : '.'} Fetch the quotes again.`,
        )
        break
      case 'AMOUNT_OUT_OF_RANGE': {
        const { swap, min, max } = error.metadata
        console.log(
          `The amount is outside the ${swap.swapperId} limits (min: ${min}, max: ${max}).`,
        )
        break
      }
      case 'SLIPPAGE_TOO_LOW':
        console.log(
          `Slippage is too low. Use at least ${error.metadata.minRequiredSlippage}%.`,
        )
        break
      case 'REQUEST_FAILED':
        console.error(
          `The confirm request failed: ${error.message} (error code: ${error.metadata.errorCode}, trace ID: ${error.metadata.traceId})`,
        )
        break
    }
  }
}
