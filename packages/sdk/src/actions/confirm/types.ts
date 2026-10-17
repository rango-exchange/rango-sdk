import type { SdkWarning } from '../../warnings/mod.js'
import type {
  CheckedResponse as CheckedRouteResponse,
  QuoteOptions,
  Route,
} from '../quote/mod.js'
import type {
  Asset,
  ConfirmRouteRequest,
  ConfirmRouteResponse,
  MultiRouteSimulationResult,
} from 'rango-sdk'

// A Quote from `quotes()` fits this as it is. Without a slippage, there are no slippage warnings.
export type ConfirmQuote = Pick<
  MultiRouteSimulationResult,
  'requestId' | 'outputAmount' | 'swaps'
> & {
  requestAmount: string
  to: Asset
  slippage?: string
}

export type ConfirmRequest = Omit<ConfirmRouteRequest, 'requestId'> & {
  quote: ConfirmQuote
}

export type ConfirmOptions = QuoteOptions

export type ConfirmResult = {
  data: Route
  warnings: SdkWarning[]
  _response: ConfirmRouteResponse
}

// `route` is the confirm response's `result`, checked by quote's `checkErrors`.
export type CheckedResponse = {
  response: ConfirmRouteResponse
  route: CheckedRouteResponse
}

export type WarnedResponse = CheckedResponse & { warnings: SdkWarning[] }
