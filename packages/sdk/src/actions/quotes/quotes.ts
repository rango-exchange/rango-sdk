import type { QuotesRequest, QuotesResult } from './types.js'
import type { RequestOptions } from '../../types.js'
import type { RangoClient as LegacyRangoClient } from 'rango-sdk'

import { throwRequestError } from '../../errors/mod.js'
import { validateSwapRequest } from '../quote/mod.js'

import { checkErrors, checkWarnings, generateResult } from './helpers.js'

export async function fetchQuotes(
  httpClient: LegacyRangoClient,
  request: QuotesRequest,
  opts: RequestOptions = {},
): Promise<QuotesResult> {
  validateSwapRequest(request)
  return httpClient
    .getAllRoutes(request, { signal: opts.signal })
    .then(checkErrors)
    .then(checkWarnings(request.slippage))
    .then(generateResult(request.slippage))
    .catch((cause: unknown) => throwRequestError(cause, opts.signal))
}
