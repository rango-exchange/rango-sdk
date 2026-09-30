import type { Affiliate } from './client.js'
import type { ValidationThresholds } from './thresholds.js'
import type { RequestOptions } from './transport.js'
import type { RouteWarning } from './warnings.js'
import type {
  BestRouteRequest,
  BestRouteResponse,
  RangoClient as LegacyRangoClient,
  SimulationResult,
} from 'rango-sdk'

import {
  QuoteError,
  quoteErrorFromValidation,
  VALIDATION_ERROR_MESSAGES,
} from './errors.js'
import {
  httpStatus,
  requestFailedMetadata,
  responseErrorMessage,
  withAffiliate,
} from './transport.js'
import { validateRoute } from './validation.js'
import { balanceWarnings, quoteWarnings } from './warnings.js'

const HTTP_BAD_REQUEST = 400

export type QuoteRequest = Omit<
  BestRouteRequest,
  | 'affiliateRef'
  | 'affiliatePercent'
  | 'affiliateWallets'
  | 'checkPrerequisites'
>

export type Route = Pick<
  BestRouteResponse,
  'requestId' | 'from' | 'to' | 'requestAmount' | 'validationStatus'
> &
  Pick<SimulationResult, 'outputAmount' | 'resultType' | 'swaps'> & {
    selectedWallets: { [chain: string]: string }
    destination: string | undefined
    slippage: string | undefined
  }

export type QuoteResult = {
  route: Route
  warnings: RouteWarning[]
}

export async function fetchQuote(
  legacy: LegacyRangoClient,
  affiliate: Affiliate | undefined,
  thresholds: ValidationThresholds,
  request: QuoteRequest,
  opts: RequestOptions = {},
): Promise<QuoteResult> {
  const body = withAffiliate<BestRouteRequest>(
    { ...request, checkPrerequisites: true },
    affiliate,
  )

  let response: BestRouteResponse
  try {
    response = await legacy.getBestRoute(body, { signal: opts.signal })
  } catch (cause) {
    if (opts.signal?.aborted) {
      throw new QuoteError('The quote request was canceled.', {
        type: 'CANCELED',
        cause,
      })
    }
    if (httpStatus(cause) === HTTP_BAD_REQUEST) {
      const diagnosisMessage = responseErrorMessage(cause)
      throw new QuoteError(VALIDATION_ERROR_MESSAGES.NO_ROUTE, {
        type: 'NO_ROUTE',
        metadata: diagnosisMessage === undefined ? {} : { diagnosisMessage },
        cause,
      })
    }
    throw new QuoteError('The quote request failed.', {
      type: 'REQUEST_FAILED',
      metadata: requestFailedMetadata(cause),
      cause,
    })
  }

  if (response.error) {
    throw new QuoteError(response.error, {
      type: 'REQUEST_FAILED',
      metadata: {
        errorCode: response.errorCode,
        traceId: response.traceId,
      },
      cause: response,
    })
  }

  const validationError = validateRoute(
    response.result,
    response.diagnosisMessages,
  )
  if (validationError || !response.result) {
    throw quoteErrorFromValidation(
      validationError ?? { type: 'NO_ROUTE', metadata: {} },
      { cause: response },
    )
  }

  const { result } = response
  const requestAmount = response.requestAmount ?? request.amount
  return {
    route: {
      requestId: response.requestId,
      from: response.from ?? request.from,
      to: response.to ?? request.to,
      requestAmount,
      outputAmount: result.outputAmount,
      resultType: result.resultType,
      swaps: result.swaps,
      validationStatus: response.validationStatus,
      selectedWallets: request.selectedWallets,
      destination: request.destination,
      slippage: request.slippage,
    },
    warnings: [
      ...quoteWarnings(
        {
          requestAmount,
          outputAmount: result.outputAmount,
          swaps: result.swaps,
        },
        request.slippage,
        thresholds,
      ),
      ...balanceWarnings(response.validationStatus),
    ],
  }
}
