import type { ConfirmOptions, ConfirmResult } from './types.js'
import type { ClientState } from '../../types.js'
import type { SelectedWallets } from '../quote/mod.js'

import { throwRequestError } from '../../errors/mod.js'
import { getBlockchainsAndValidateDestination } from '../quote/mod.js'

import {
  buildConfirmRouteRequest,
  checkErrors,
  checkWarnings,
  generateResult,
  getCachedQuote,
  keepAndReturnResult,
} from './helpers.js'

export async function confirmQuote(
  state: ClientState,
  requestId: string,
  selectedWallets: SelectedWallets,
  options: ConfirmOptions = {},
): Promise<ConfirmResult> {
  const { httpClient, cache } = state
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
    .then(keepAndReturnResult(cache))
    .catch((cause: unknown) => throwRequestError(cause, options.signal))
}
