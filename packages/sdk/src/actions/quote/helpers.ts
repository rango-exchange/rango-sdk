import type {
  CheckedResponse,
  QuoteResult,
  Route,
  WarnedResponse,
} from './types.js'
import type { BestRouteResponse } from 'rango-sdk'

import { SdkError } from '../../errors/mod.js'

import { toRoute, validateRoute } from './utils.js'
import { getRouteWarnings } from './warnings.js'

export function checkErrors(response: BestRouteResponse): CheckedResponse {
  if (response.error) {
    throw new SdkError('REQUEST_FAILED', response.error, { cause: response })
  }
  validateRoute(response)
  return response
}

export function checkWarnings(slippage: string | undefined) {
  return (response: CheckedResponse): WarnedResponse => ({
    response,
    warnings: getRouteWarnings(response, slippage),
  })
}

export function generateResult(
  selectedWallets: Route['selectedWallets'],
  slippage: string | undefined,
) {
  return ({ response, warnings }: WarnedResponse): QuoteResult => ({
    data: toRoute(response, selectedWallets, slippage),
    warnings,
    _response: response,
  })
}
