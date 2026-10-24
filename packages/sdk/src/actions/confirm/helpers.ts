import type {
  CheckedResponse,
  ConfirmResult,
  SelectedWallets,
  WarnedResponse,
} from './types.js'
import type { Cache } from '../../cache/mod.js'
import type { CacheSchema } from '../../types.js'
import type { Quote } from '../quotes/mod.js'
import type { ConfirmRouteRequest, ConfirmRouteResponse } from 'rango-sdk'

import { NO_RESULT_MESSAGE, SdkError } from '../../errors/mod.js'
import {
  checkErrors as checkRouteErrors,
  checkWarnings as checkRouteWarnings,
  generateResult as generateRouteResult,
} from '../quote/mod.js'

import { getOutputChangeWarnings } from './warnings.js'

export function getCachedQuote(
  cache: Cache<CacheSchema>,
  requestId: string,
): Quote {
  for (const quotes of cache.get('quotes')?.values() ?? []) {
    const quote = quotes.get(requestId)
    if (quote !== undefined) {
      return quote
    }
  }
  throw new SdkError(
    'INVALID_INPUT',
    "`requestId` isn't in the client's cache: pass the request ID of a Quote that one of this client's last 10 successful `quotes()` returned.",
    { metadata: { field: 'requestId', reason: 'NOT_FOUND' } },
  )
}

// The `destination` key is left out when the caller left it out.
export function buildConfirmRouteRequest(
  quote: Quote,
  selectedWallets: SelectedWallets,
  destination: string | undefined,
): ConfirmRouteRequest {
  return {
    requestId: quote.requestId,
    selectedWallets,
    ...(destination === undefined ? {} : { destination }),
  }
}

export function checkErrors(response: ConfirmRouteResponse): CheckedResponse {
  if (!response.ok || response.error) {
    throw new SdkError(
      'REQUEST_FAILED',
      response.error || 'The confirm request failed.',
      { cause: response },
    )
  }

  if (!response.result) {
    throw new SdkError('NO_RESULT', NO_RESULT_MESSAGE, { metadata: {} })
  }
  // The confirm `result` has no error fields of its own, so they are set to null for quote's checks.
  const route = checkRouteErrors({
    ...response.result,
    error: null,
    errorCode: null,
    traceId: null,
  })
  return { response, route }
}

export function checkWarnings(quote: Quote) {
  return ({ response, route }: CheckedResponse): WarnedResponse => ({
    response,
    route,
    warnings: [
      ...checkRouteWarnings(quote.slippage)(route).warnings,
      ...getOutputChangeWarnings(quote, {
        requestAmount: route.requestAmount,
        outputAmount: route.result.outputAmount,
        swaps: route.result.swaps,
      }),
    ],
  })
}

export function generateResult(
  selectedWallets: SelectedWallets,
  slippage: string | undefined,
) {
  return ({ response, route, warnings }: WarnedResponse): ConfirmResult => ({
    ...generateRouteResult(
      selectedWallets,
      slippage,
    )({ response: route, warnings }),
    _response: response,
  })
}
