import type { Affiliate } from './client.js'
import type { QuoteError } from './errors.js'
import type { RequestOptions } from './transport.js'
import type {
  Asset,
  RangoClient as LegacyRangoClient,
  MultiRouteRequest,
  MultiRouteResponse,
  MultiRouteSimulationResult,
} from 'rango-sdk'

import { quoteErrorFromValidation, QuotesError } from './errors.js'
import { requestFailedMetadata, withAffiliate } from './transport.js'
import { validateSwaps } from './validation.js'

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
  warnings: never[]
  error: QuoteError | null
}

export async function fetchQuotes(
  legacy: LegacyRangoClient,
  affiliate: Affiliate | undefined,
  request: QuotesRequest,
  opts: RequestOptions = {},
): Promise<Quote[]> {
  const body = withAffiliate<MultiRouteRequest>({ ...request }, affiliate)

  let response: MultiRouteResponse
  try {
    response = await legacy.getAllRoutes(body, { signal: opts.signal })
  } catch (cause) {
    if (opts.signal?.aborted) {
      throw new QuotesError('The quotes request was canceled.', {
        type: 'CANCELED',
        cause,
      })
    }
    throw new QuotesError('The quotes request failed.', {
      type: 'REQUEST_FAILED',
      metadata: requestFailedMetadata(cause),
      cause,
    })
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

  const { from, to, amount, slippage, ...routingOptions } = request
  return (response.results ?? []).map((result) => {
    const validationError = validateSwaps(result.swaps)
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
      requestAmount: response.requestAmount ?? amount,
      slippage,
      routingOptions,
      warnings: [],
      error: validationError && quoteErrorFromValidation(validationError),
    }
  })
}
