import type { Affiliate } from './client.js'
import type { QuoteErrorOptions } from './errors.js'
import type { ValidationThresholds } from './thresholds.js'
import type { RequestOptions } from './transport.js'
import type { RouteWarning } from './warnings.js'
import type {
  BestRouteRequest,
  BestRouteResponse,
  RangoClient as LegacyRangoClient,
  SimulationResult,
} from 'rango-sdk'

import { QuoteError } from './errors.js'
import { routeRequestError, routeResult } from './route.js'
import { withAffiliate } from './transport.js'

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
    throw routeRequestError(cause, opts.signal, 'quote', newQuoteError)
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

  return routeResult(response, request, thresholds, newQuoteError)
}

function newQuoteError(message: string, options: QuoteErrorOptions) {
  return new QuoteError(message, options)
}
