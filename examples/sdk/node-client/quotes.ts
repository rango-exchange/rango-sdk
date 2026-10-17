import type { QuotesData, QuotesRequest } from '@rango-dev/sdk'

import { SdkError } from '@rango-dev/sdk'

import { describeInvalidInput } from './invalid-input.js'
import { client } from './rango.js'
import { printWarnings } from './warnings.js'

const TIMEOUT_MS = 30_000

// Set these to your own referral code and fee wallets, or leave them out.
export const affiliate = {
  affiliateRef: 'YOUR_REFERRAL_CODE',
  affiliatePercent: 0.1,
  affiliateWallets: { BSC: '0x0000000000000000000000000000000000000002' },
}

const request: QuotesRequest = {
  from: { blockchain: 'BSC', symbol: 'BNB', address: null },
  to: {
    blockchain: 'AVAX_CCHAIN',
    symbol: 'USDT.E',
    address: '0xc7198437980c041c805a1edcba50c1ce5db95118',
  },
  amount: '0.1',
  slippage: '1.0',
  ...affiliate,
}

export async function printQuotes(): Promise<QuotesData | undefined> {
  try {
    const { data } = await client.quotes(request, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    for (const entry of data.quotes) {
      const quote = entry.data
      const swappers = quote.swaps.map((swap) => swap.swapperId).join(' -> ')
      const tags = quote.tags.map((tag) => tag.label).join(', ')
      console.log(
        `${data.requestAmount} ${data.from.symbol} -> ${quote.outputAmount} ${data.to.symbol} via ${swappers}${tags ? ` [${tags}]` : ''}`,
      )
      printWarnings(entry.warnings)
      if (entry.error) {
        console.log(`  Can't be confirmed: ${entry.error.type}`)
      }
    }
    return data
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
        console.log('The quotes request timed out.')
        break
      case 'NO_RESULT':
        console.log(
          `No route exists for this swap${error.metadata.diagnosisMessage ? `: ${error.metadata.diagnosisMessage}` : '.'}`,
        )
        break
      case 'BAD_REQUEST':
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
      case 'NOT_FOUND':
      case 'TOO_MANY_REQUESTS':
      case 'SERVER_ERROR':
      case 'REQUEST_FAILED':
        console.error(
          `The quotes request failed: ${error.message}`,
          // The API response, or the transport error, with the error code and trace ID.
          error.cause,
        )
        break
      case 'BRIDGE_LIMIT':
      case 'UNKNOWN_SLIPPAGE':
        // quotes() attaches these to a Quote's entry instead of throwing them.
        throw error
    }
    return undefined
  }
}
