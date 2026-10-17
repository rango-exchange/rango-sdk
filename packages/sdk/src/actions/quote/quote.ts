import type { QuoteOptions, QuoteRequest, QuoteResult } from './types.js'
import type { RangoClient as LegacyRangoClient } from 'rango-sdk'

import { throwRequestError } from '../../errors/mod.js'

import { checkErrors, checkWarnings, generateResult } from './helpers.js'
import { validateDestination, validateSwapRequest } from './utils.js'

export async function fetchQuote(
  httpClient: LegacyRangoClient,
  request: QuoteRequest,
  opts: QuoteOptions,
): Promise<QuoteResult> {
  validateSwapRequest(request)
  validateDestination(
    request.destination,
    request.to.blockchain,
    opts.meta.blockchains,
  )

  return httpClient
    .getBestRoute(
      { ...request, checkPrerequisites: request.checkPrerequisites ?? true },
      { signal: opts.signal },
    )
    .then(checkErrors)
    .then(checkWarnings(request.slippage))
    .then(generateResult(request.selectedWallets, request.slippage))
    .catch((cause: unknown) => throwRequestError(cause, opts.signal))
}
