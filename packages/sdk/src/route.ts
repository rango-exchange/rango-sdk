import type { QuoteErrorOptions } from './errors.js'
import type { QuoteResult } from './quote.js'
import type { ValidationThresholds } from './thresholds.js'
import type { RouteValidationError } from './validation.js'
import type { Asset, BestRouteResponse } from 'rango-sdk'

import { VALIDATION_ERROR_MESSAGES } from './errors.js'
import {
  httpStatus,
  requestFailedMetadata,
  responseErrorMessage,
} from './transport.js'
import { validateRoute } from './validation.js'
import { balanceWarnings, quoteWarnings } from './warnings.js'

const HTTP_BAD_REQUEST = 400

export type RouteErrorFactory<E extends Error> = (
  message: string,
  options: QuoteErrorOptions,
) => E

export type RouteRequestName = 'quote' | 'quotes' | 'confirm'

export type RequestErrorFactory<E extends Error> = (
  message: string,
  options: QuoteErrorOptions<'CANCELED' | 'NO_ROUTE' | 'REQUEST_FAILED'>,
) => E

// Maps a transport failure to CANCELED, NO_ROUTE (HTTP 400) or REQUEST_FAILED.
export function routeRequestError<E extends Error>(
  cause: unknown,
  signal: AbortSignal | undefined,
  requestName: RouteRequestName,
  createError: RequestErrorFactory<E>,
): E {
  if (signal?.aborted) {
    return createError(`The ${requestName} request was canceled.`, {
      type: 'CANCELED',
      cause,
    })
  }
  if (httpStatus(cause) === HTTP_BAD_REQUEST) {
    const diagnosisMessage = responseErrorMessage(cause)
    return createError(VALIDATION_ERROR_MESSAGES.NO_ROUTE, {
      type: 'NO_ROUTE',
      metadata: diagnosisMessage === undefined ? {} : { diagnosisMessage },
      cause,
    })
  }
  return createError(`The ${requestName} request failed.`, {
    type: 'REQUEST_FAILED',
    metadata: requestFailedMetadata(cause),
    cause,
  })
}

export type RouteResponse = Pick<
  BestRouteResponse,
  | 'requestId'
  | 'requestAmount'
  | 'from'
  | 'to'
  | 'result'
  | 'validationStatus'
  | 'diagnosisMessages'
>

export type RouteContext = {
  from: Asset
  to: Asset
  amount: string
  selectedWallets: { [chain: string]: string }
  destination?: string | undefined
  slippage?: string | undefined
}

// Validates a route response, then builds the Route and its warnings.
export function routeResult<E extends Error>(
  response: RouteResponse,
  context: RouteContext,
  thresholds: ValidationThresholds,
  createError: RouteErrorFactory<E>,
): QuoteResult {
  const validationError = validateRoute(
    response.result,
    response.diagnosisMessages,
  )
  if (validationError || !response.result) {
    const error: RouteValidationError = validationError ?? {
      type: 'NO_ROUTE',
      metadata: {},
    }
    throw createError(VALIDATION_ERROR_MESSAGES[error.type], {
      ...error,
      cause: response,
    })
  }

  const { result } = response
  const requestAmount = response.requestAmount ?? context.amount
  return {
    route: {
      requestId: response.requestId,
      from: response.from ?? context.from,
      to: response.to ?? context.to,
      requestAmount,
      outputAmount: result.outputAmount,
      resultType: result.resultType,
      swaps: result.swaps,
      validationStatus: response.validationStatus,
      selectedWallets: context.selectedWallets,
      destination: context.destination,
      slippage: context.slippage,
    },
    warnings: [
      ...quoteWarnings(
        {
          requestAmount,
          outputAmount: result.outputAmount,
          swaps: result.swaps,
        },
        context.slippage,
        thresholds,
      ),
      ...balanceWarnings(response.validationStatus),
    ],
  }
}
