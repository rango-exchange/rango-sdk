import type { ConfirmOptions, ConfirmResult, SelectedWallets } from './types.js'
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
  getCachedQuote,
} from './helpers.js'

export async function confirmQuote(
  httpClient: LegacyRangoClient,
  cache: Cache<CacheSchema>,
  requestId: string,
  selectedWallets: SelectedWallets,
  options: ConfirmOptions = {},
): Promise<ConfirmResult> {
  const quote = getCachedQuote(cache, requestId)
  const destination = options.req?.destination
  await getBlockchainsAndValidateDestination(
    httpClient,
    cache,
    destination,
    quote.to.blockchain,
    options.signal,
  )

  return httpClient
    .confirmRoute(
      buildConfirmRouteRequest(quote, selectedWallets, destination),
      { signal: options.signal },
    )
    .then(checkErrors)
    .then(checkWarnings(quote))
    .then(generateResult(selectedWallets, quote.slippage))
    .catch((cause: unknown) => throwRequestError(cause, options.signal))
}
