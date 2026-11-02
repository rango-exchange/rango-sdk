import type { QuoteRequest, QuoteResult } from './types.js'
import type { ClientState, RequestOptions } from '../../types.js'

import { throwRequestError } from '../../errors/mod.js'

import { checkErrors, checkWarnings, generateResult } from './helpers.js'
import {
  getBlockchainsAndValidateDestination,
  validateSwapRequest,
} from './utils.js'

export async function fetchQuote(
  state: ClientState,
  request: QuoteRequest,
  opts: RequestOptions = {},
): Promise<QuoteResult> {
  const { httpClient, cache } = state
  validateSwapRequest(request)
  await getBlockchainsAndValidateDestination(
    httpClient,
    cache,
    request.destination,
    request.to.blockchain,
    opts.signal,
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
