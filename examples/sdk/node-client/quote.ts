import type { QuoteRequest } from '@rango-dev/sdk'

import { SdkError } from '@rango-dev/sdk'

import { describeInvalidInput } from './invalid-input.js'
import { affiliate } from './quotes.js'
import { client } from './rango.js'
import { printWarnings } from './warnings.js'

const TIMEOUT_MS = 30_000

// Set these to wallets you own; the server checks their balances.
export const selectedWallets = {
  BSC: '0x0000000000000000000000000000000000000001',
  AVAX_CCHAIN: '0x0000000000000000000000000000000000000001',
}

const request: QuoteRequest = {
  from: { blockchain: 'BSC', symbol: 'BNB', address: null },
  to: {
    blockchain: 'AVAX_CCHAIN',
    symbol: 'USDT.E',
    address: '0xc7198437980c041c805a1edcba50c1ce5db95118',
  },
  amount: '0.1',
  selectedWallets,
  slippage: '1.0',
  ...affiliate,
}

export async function printRoute() {
  try {
    const { data: route, warnings } = await client.quote(request, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const swappers = route.result.swaps
      .map((swap) => swap.swapperId)
      .join(' -> ')
    console.log(
      `Best route: ${route.requestAmount} ${route.from.symbol} -> ${route.result.outputAmount} ${route.to.symbol} via ${swappers}`,
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
        console.log('The quote request timed out.')
        break
      case 'NO_RESULT':
        console.log(
          `No route exists for this swap${error.metadata.diagnosisMessage ? `: ${error.metadata.diagnosisMessage}` : '.'}`,
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
          `The quote request failed: ${error.message}`,
          // The API response, or the transport error, with the error code and trace ID.
          error.cause,
        )
        break
    }
  }
}
