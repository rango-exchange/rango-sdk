import type { Quote, QuotesRequest } from '@rango-dev/sdk'

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

export async function printQuotes(): Promise<Quote[]> {
  try {
    const quotes = await getClient().quotes(request, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    for (const quote of quotes) {
      const swappers = quote.swaps.map((swap) => swap.swapperId).join(' -> ')
      const tags = quote.tags.map((tag) => tag.label).join(', ')
      console.log(
        `${quote.requestAmount} ${quote.from.symbol} -> ${quote.outputAmount} ${quote.to.symbol} via ${swappers}${tags ? ` [${tags}]` : ''}`,
      )
      printWarnings(quote.warnings)
      if (quote.error) {
        console.log(`  Can't be confirmed: ${quote.error.type}`)
      }
    }
    return quotes
  } catch (error) {
    if (!(error instanceof QuotesError)) {
      throw error
    }
    switch (error.type) {
      case 'CANCELED':
        console.log('The quotes request timed out.')
        break
      case 'NO_ROUTE':
        console.log(
          `No route exists for this swap${error.metadata.diagnosisMessage ? `: ${error.metadata.diagnosisMessage}` : '.'}`,
        )
        break
      case 'REQUEST_FAILED':
        console.error(
          `The quotes request failed: ${error.message} (error code: ${error.metadata.errorCode}, trace ID: ${error.metadata.traceId})`,
        )
        break
    }
    return []
  }
}
