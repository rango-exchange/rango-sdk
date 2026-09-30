import type { QuotesRequest } from '@rango-dev/sdk'

import { getClient, QuotesError } from '@rango-dev/sdk'

import { printWarnings } from './warnings.js'

const TIMEOUT_MS = 30_000

const request: QuotesRequest = {
  from: { blockchain: 'BSC', symbol: 'BNB', address: null },
  to: {
    blockchain: 'AVAX_CCHAIN',
    symbol: 'USDT.E',
    address: '0xc7198437980c041c805a1edcba50c1ce5db95118',
  },
  amount: '0.1',
  slippage: '1.0',
}

export async function printQuotes() {
  try {
    const quotes = await getClient().quotes(request, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (quotes.length === 0) {
      console.log('No route exists for this swap.')
      return
    }

    for (const quote of quotes) {
      const swappers = quote.swaps.map((swap) => swap.swapperId).join(' -> ')
      const tags = quote.tags.map((tag) => tag.label).join(', ')
      console.log(
        `${quote.requestAmount} ${quote.from.symbol} -> ${quote.outputAmount} ${quote.to.symbol} via ${swappers}${tags ? ` [${tags}]` : ''}`,
      )
      printWarnings(quote.warnings)
    }
  } catch (error) {
    if (!(error instanceof QuotesError)) {
      throw error
    }
    if (error.type === 'CANCELED') {
      console.log('The quotes request timed out.')
    } else {
      console.error(
        `The quotes request failed: ${error.message} (error code: ${error.metadata.errorCode}, trace ID: ${error.metadata.traceId})`,
      )
    }
  }
}
