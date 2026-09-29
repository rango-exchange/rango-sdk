import type { Affiliate } from './client.js'
import type { RequestFailedMetadata } from './errors.js'
import type {
  Asset,
  RangoClient as LegacyRangoClient,
  MultiRouteRequest,
  MultiRouteResponse,
  MultiRouteSimulationResult,
} from 'rango-sdk'

import { QuotesError } from './errors.js'

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
  error: null
}

export type RequestOptions = {
  signal?: AbortSignal
}

export async function fetchQuotes(
  legacy: LegacyRangoClient,
  affiliate: Affiliate | undefined,
  request: QuotesRequest,
  opts: RequestOptions = {},
): Promise<Quote[]> {
  const body: MultiRouteRequest = { ...request }
  if (affiliate) {
    body.affiliateRef = affiliate.ref
    if (affiliate.percent !== undefined) {
      body.affiliatePercent = affiliate.percent
    }
    if (affiliate.wallets) {
      body.affiliateWallets = affiliate.wallets
    }
  }

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
  return (response.results ?? []).map((result) => ({
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
    error: null,
  }))
}

// Reads the error code and trace ID from an HTTP error's response body, when the API sent one.
function requestFailedMetadata(error: unknown): RequestFailedMetadata {
  const body = responseBody(error)
  if (typeof body !== 'object' || body === null) {
    return { errorCode: null, traceId: null }
  }
  return {
    errorCode:
      'errorCode' in body && typeof body.errorCode === 'number'
        ? body.errorCode
        : null,
    traceId:
      'traceId' in body && typeof body.traceId === 'number'
        ? body.traceId
        : null,
  }
}

function responseBody(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined
  }
  const { response } = error
  if (
    typeof response !== 'object' ||
    response === null ||
    !('data' in response)
  ) {
    return undefined
  }
  return response.data
}
