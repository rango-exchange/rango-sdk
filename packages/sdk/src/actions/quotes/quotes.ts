import type { QuotesOptions, QuotesResult } from './types.js'
import type { ClientState } from '../../types.js'
import type { Asset, MultiRouteRequest } from 'rango-sdk'

import { throwRequestError } from '../../errors/mod.js'
import { validateSwapRequest } from '../quote/mod.js'

import {
  cacheAndReturnResult,
  checkErrors,
  checkWarnings,
  generateResult,
} from './helpers.js'

export async function fetchQuotes(
  state: ClientState,
  from: Asset,
  to: Asset,
  amount: string,
  options: QuotesOptions = {},
): Promise<QuotesResult> {
  const { httpClient, cache } = state
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
