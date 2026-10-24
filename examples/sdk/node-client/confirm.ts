import type { QuotesData } from '@rango-dev/sdk'

import { SdkError } from '@rango-dev/sdk'

import { describeInvalidInput } from './invalid-input.js'
import { selectedWallets } from './quote.js'
import { client } from './rango.js'
import { printWarnings } from './warnings.js'

const TIMEOUT_MS = 30_000

export async function confirmFirstQuote(quotes: QuotesData) {
  // confirm() doesn't check a Quote's error, so don't offer a Quote whose entry has one.
  const entry = quotes.quotes.find((candidate) => !candidate.error)
  if (!entry) {
    console.log('No Quote can be confirmed.')
    return
  }
  const quote = entry.data

  try {
    // confirm() reads the Quote by its request ID from the Quotes the client's last 10 successful quotes() cached.
    const { data: route, warnings } = await client.confirm(
      quote.requestId,
      selectedWallets,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    )

    console.log(
      `Confirmed route: ${route.requestAmount} ${route.from.symbol} -> ${route.result.outputAmount} ${route.to.symbol} (quoted ${quote.outputAmount}, slippage: ${route.slippage ?? 'none'})`,
    )
    console.log(
      `Confirmed for wallets: ${JSON.stringify(route.selectedWallets)}`,
    )
    printWarnings(warnings)
  } catch (error) {
    if (!(error instanceof SdkError)) {
      throw error
    }
    switch (error.type) {
      case 'INVALID_INPUT':
        console.log(
          `Invalid ${error.metadata.field}: ${describeInvalidInput(error.metadata)}`,
        )
        break
      case 'REQUEST_CANCELED':
        console.log('The confirm request timed out.')
        break
      case 'NO_RESULT':
        console.log(
          `The route is no longer available${error.metadata.diagnosisMessage ? `: ${error.metadata.diagnosisMessage}` : '.'} Fetch the quotes again.`,
        )
        break
      case 'BRIDGE_LIMIT': {
        const { swap, limit, limitValue, exclusive } = error.metadata
        const operator = (limit === 'MIN' ? '>' : '<') + (exclusive ? '' : '=')
        console.log(
          `The amount is outside the ${swap.swapperId} limits. Required: ${operator} ${limitValue} ${swap.from.symbol}.`,
        )
        break
      }
      case 'UNKNOWN_SLIPPAGE':
        console.log("Rango failed to compute a swap's slippage.")
        break
      case 'BAD_REQUEST':
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
      case 'NOT_FOUND':
      case 'TOO_MANY_REQUESTS':
      case 'SERVER_ERROR':
      case 'REQUEST_FAILED':
        console.error(
          `The confirm request failed: ${error.message}`,
          // The API response, or the transport error, with the error code and trace ID.
          error.cause,
        )
        break
    }
  }
}
