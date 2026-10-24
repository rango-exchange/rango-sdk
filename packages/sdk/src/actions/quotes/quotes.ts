import type { QuotesOptions, QuotesResult } from './types.js'
import type { Cache } from '../../cache/mod.js'
import type { CacheSchema } from '../../types.js'
import type {
  Asset,
  RangoClient as LegacyRangoClient,
  MultiRouteRequest,
} from 'rango-sdk'

import { throwRequestError } from '../../errors/mod.js'
import { validateSwapRequest } from '../quote/mod.js'

import {
  cacheAndReturnResult,
  checkErrors,
  checkWarnings,
  generateResult,
} from './helpers.js'

export async function fetchQuotes(
  httpClient: LegacyRangoClient,
  cache: Cache<CacheSchema>,
  from: Asset,
  to: Asset,
  amount: string,
  options: QuotesOptions = {},
): Promise<QuotesResult> {
  const request: MultiRouteRequest = { ...options.req, from, to, amount }
  validateSwapRequest(request)
  return httpClient
    .getAllRoutes(request, { signal: options.signal })
    .then(checkErrors)
    .then(checkWarnings(request.slippage))
    .then(generateResult(request.slippage))
    .then(cacheAndReturnResult(cache))
    .catch((cause: unknown) => throwRequestError(cause, options.signal))
}
