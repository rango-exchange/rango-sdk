import type { ConfirmErrorOptions } from './errors.js'
import type { Route } from './quote.js'
import type { Quote } from './quotes.js'
import type { ValidationThresholds } from './thresholds.js'
import type { RequestOptions } from './transport.js'
import type { ConfirmWarning } from './warnings.js'
import type {
  ConfirmRouteRequest,
  ConfirmRouteResponse,
  RangoClient as LegacyRangoClient,
} from 'rango-sdk'

import {
  ConfirmError,
  confirmErrorFromQuoteError,
  VALIDATION_ERROR_MESSAGES,
} from './errors.js'
import { routeRequestError, routeResult } from './route.js'
import { outputChangeWarnings } from './warnings.js'

export type ConfirmRequest = Pick<
  ConfirmRouteRequest,
  'selectedWallets' | 'destination'
>

export type ConfirmResult = {
  route: Route
  warnings: ConfirmWarning[]
}

export async function confirmQuote(
  legacy: LegacyRangoClient,
  thresholds: ValidationThresholds,
  quote: Quote,
  request: ConfirmRequest,
  opts: RequestOptions = {},
): Promise<ConfirmResult> {
  if (quote.error) {
    throw confirmErrorFromQuoteError(quote.error)
  }

  const body: ConfirmRouteRequest = {
    requestId: quote.requestId,
    selectedWallets: request.selectedWallets,
  }
  if (request.destination !== undefined) {
    body.destination = request.destination
  }

  let response: ConfirmRouteResponse
  try {
    response = await legacy.confirmRoute(body, { signal: opts.signal })
  } catch (cause) {
    throw routeRequestError(cause, opts.signal, 'confirm', newConfirmError)
  }

  if (!response.ok || response.error) {
    throw new ConfirmError(response.error || 'The confirm request failed.', {
      type: 'REQUEST_FAILED',
      metadata: {
        errorCode: numericErrorCode(response.errorCode),
        traceId: response.traceId,
      },
      cause: response,
    })
  }

  const { result } = response
  if (!result) {
    throw new ConfirmError(VALIDATION_ERROR_MESSAGES.NO_ROUTE, {
      type: 'NO_ROUTE',
      metadata: {},
      cause: response,
    })
  }

  const { route, warnings } = routeResult(
    result,
    {
      from: quote.from,
      to: quote.to,
      amount: quote.requestAmount,
      selectedWallets: request.selectedWallets,
      destination: request.destination,
      slippage: quote.slippage,
    },
    thresholds,
    (message, options) =>
      new ConfirmError(message, { ...options, cause: response }),
  )
  return {
    route,
    warnings: [...warnings, ...outputChangeWarnings(quote, route, thresholds)],
  }
}

function newConfirmError(message: string, options: ConfirmErrorOptions) {
  return new ConfirmError(message, options)
}

// The confirm endpoint types its error code as a string; the metadata keeps numbers only.
function numericErrorCode(errorCode: string | number | null): number | null {
  const code = Number(errorCode)
  return errorCode !== null && errorCode !== '' && Number.isFinite(code)
    ? code
    : null
}
