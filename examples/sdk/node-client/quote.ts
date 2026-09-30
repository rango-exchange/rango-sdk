import type { QuoteRequest } from '@rango-dev/sdk'

import { getClient, QuoteError } from '@rango-dev/sdk'

const TIMEOUT_MS = 30_000

// Set these to wallets you own; the server checks their balances.
const request: QuoteRequest = {
  from: { blockchain: 'BSC', symbol: 'BNB', address: null },
  to: {
    blockchain: 'AVAX_CCHAIN',
    symbol: 'USDT.E',
    address: '0xc7198437980c041c805a1edcba50c1ce5db95118',
  },
  amount: '0.1',
  selectedWallets: {
    BSC: '0x0000000000000000000000000000000000000001',
    AVAX_CCHAIN: '0x0000000000000000000000000000000000000001',
  },
  slippage: '1.0',
}

export async function printRoute() {
  try {
    const { route } = await getClient().quote(request, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const swappers = route.swaps.map((swap) => swap.swapperId).join(' -> ')
    console.log(
      `Best route: ${route.requestAmount} ${route.from.symbol} -> ${route.outputAmount} ${route.to.symbol} via ${swappers}`,
    )
  } catch (error) {
    if (!(error instanceof QuoteError)) {
      throw error
    }
    switch (error.type) {
      case 'CANCELED':
        console.log('The quote request timed out.')
        break
      case 'NO_ROUTE':
        console.log(
          `No route exists for this swap${error.metadata.diagnosisMessage ? `: ${error.metadata.diagnosisMessage}` : '.'}`,
        )
        break
      case 'AMOUNT_OUT_OF_RANGE': {
        const { swap, min, max, restrictionType } = error.metadata
        console.log(
          `The amount is outside the ${swap.swapperId} limits (min: ${min}, max: ${max}, ${restrictionType}).`,
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
          `The quote request failed: ${error.message} (error code: ${error.metadata.errorCode}, trace ID: ${error.metadata.traceId})`,
        )
        break
    }
  }
}
