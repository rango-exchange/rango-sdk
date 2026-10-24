import type { ConfirmOptions, ConfirmRequest, ConfirmResult } from './types.js'
import type { Cache } from '../../cache/mod.js'
import type { CacheSchema } from '../../types.js'
import type { RangoClient as LegacyRangoClient } from 'rango-sdk'

import { throwRequestError } from '../../errors/mod.js'
import { getBlockchainsAndValidateDestination } from '../quote/mod.js'

import {
  buildConfirmRouteRequest,
  checkErrors,
  checkWarnings,
  generateResult,
} from './helpers.js'

export async function confirmQuote(
  httpClient: LegacyRangoClient,
  cache: Cache<CacheSchema>,
  request: ConfirmRequest,
  options: ConfirmOptions = {},
): Promise<ConfirmResult> {
  const { quote } = request
  await getBlockchainsAndValidateDestination(
    httpClient,
    cache,
    request.destination,
    quote.to.blockchain,
    options.signal,
  )

  return httpClient
    .confirmRoute(buildConfirmRouteRequest(request), { signal: options.signal })
    .then(checkErrors)
    .then(checkWarnings(quote))
    .then(generateResult(request.selectedWallets, quote.slippage))
    .catch((cause: unknown) => throwRequestError(cause, options.signal))
}
