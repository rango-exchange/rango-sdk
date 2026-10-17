import type {
  CheckedResponse,
  ConfirmQuote,
  ConfirmRequest,
  ConfirmResult,
  WarnedResponse,
} from './types.js'
import type { ConfirmRouteRequest, ConfirmRouteResponse } from 'rango-sdk'

import { NO_RESULT_MESSAGE, SdkError } from '../../errors/mod.js'
import {
  checkErrors as checkRouteErrors,
  checkWarnings as checkRouteWarnings,
  generateResult as generateRouteResult,
} from '../quote/mod.js'

import { getOutputChangeWarnings } from './warnings.js'

// The `destination` key is left out when the caller left it out.
export function buildConfirmRouteRequest({
  quote,
  selectedWallets,
  destination,
}: ConfirmRequest): ConfirmRouteRequest {
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

export function checkWarnings(quote: ConfirmQuote) {
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
  selectedWallets: ConfirmRequest['selectedWallets'],
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
