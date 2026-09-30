import type { Affiliate } from './client.js'
import type { QuoteError } from './errors.js'
import type { ValidationThresholds } from './thresholds.js'
import type { RequestOptions } from './transport.js'
import type { QuoteWarning } from './warnings.js'
import type {
  Asset,
  RangoClient as LegacyRangoClient,
  MultiRouteRequest,
  MultiRouteResponse,
  MultiRouteSimulationResult,
} from 'rango-sdk'

import {
  invalidInputMessage,
  quoteErrorFromValidation,
  QuotesError,
  VALIDATION_ERROR_MESSAGES,
} from './errors.js'
import { routeRequestError } from './route.js'
import { withAffiliate } from './transport.js'
import { validateRequest, validateRoute } from './validation.js'
import { quoteWarnings } from './warnings.js'

export type QuotesRequest = Omit<
  MultiRouteRequest,
  'affiliateRef' | 'affiliatePercent' | 'affiliateWallets'
>

export type QuoteRoutingOptions = Omit<
  QuotesRequest,
  'from' | 'to' | 'amount' | 'slippage'
>

export type Quote = Pick<
  MultiRouteSimulationResult,
  | 'requestId'
  | 'outputAmount'
  | 'resultType'
  | 'swaps'
  | 'scores'
  | 'tags'
  | 'missingBlockchains'
> & {
  from: Asset
  to: Asset
  requestAmount: string
  slippage: string | undefined
  routingOptions: QuoteRoutingOptions
  warnings: QuoteWarning[]
  error: QuoteError | null
}

export async function fetchQuotes(
  legacy: LegacyRangoClient,
  affiliate: Affiliate | undefined,
  thresholds: ValidationThresholds,
  request: QuotesRequest,
  opts: RequestOptions = {},
): Promise<Quote[]> {
  const invalidInput = validateRequest(request, thresholds.slippage.max)
  if (invalidInput) {
    throw new QuotesError(
      invalidInputMessage(invalidInput.metadata),
      invalidInput,
    )
  }

  const body = withAffiliate<MultiRouteRequest>({ ...request }, affiliate)

  let response: MultiRouteResponse
  try {
    response = await legacy.getAllRoutes(body, { signal: opts.signal })
  } catch (cause) {
    throw routeRequestError(
      cause,
      opts.signal,
      'quotes',
      (message, options) => new QuotesError(message, options),
    )
  }

  if (response.error) {
    throw new QuotesError(response.error, {
      type: 'REQUEST_FAILED',
      metadata: {
        errorCode: response.errorCode,
        traceId: response.traceId,
      },
      cause: response,
    })
  }

  if (!response.results?.length) {
    const diagnosisMessage = response.diagnosisMessages?.[0]
    throw new QuotesError(VALIDATION_ERROR_MESSAGES.NO_ROUTE, {
      type: 'NO_ROUTE',
      metadata: diagnosisMessage === undefined ? {} : { diagnosisMessage },
      cause: response,
    })
  }

  const { from, to, amount, slippage, ...routingOptions } = request
  const requestAmount = response.requestAmount ?? amount
  return response.results.map((result) => {
    // The response's diagnosis messages are about the whole request, so a Quote with no swaps gets none.
    const validationError = validateRoute(result, undefined)
    return {
      requestId: result.requestId,
      outputAmount: result.outputAmount,
      resultType: result.resultType,
      swaps: result.swaps,
      scores: result.scores,
      tags: result.tags,
      missingBlockchains: result.missingBlockchains,
      from: response.from ?? from,
      to: response.to ?? to,
      requestAmount,
      slippage,
      routingOptions,
      warnings: quoteWarnings(
        {
          requestAmount,
          outputAmount: result.outputAmount,
          swaps: result.swaps,
        },
        slippage,
        thresholds,
      ),
      error: validationError && quoteErrorFromValidation(validationError),
    }
  })
}
