import type { SdkError } from '../../errors/mod.js'
import type { SdkWarning } from '../../warnings/mod.js'
import type { ErrorFields } from '../quote/mod.js'
import type {
  Asset,
  MultiRouteRequest,
  MultiRouteResponse,
  MultiRouteSimulationResult,
} from 'rango-sdk'

// `from`, `to` and `amount` are `quotes()` arguments, so they can't be given twice.
export type QuotesReq = Omit<MultiRouteRequest, 'from' | 'to' | 'amount'>

export type QuotesOptions = {
  req?: QuotesReq
  signal?: AbortSignal
}

export type Quote = MultiRouteSimulationResult & {
  requestAmount: string
  to: Asset
  slippage?: string
}

export type QuoteEntry = {
  data: Quote
  warnings: SdkWarning[]
  error?: SdkError
}

export type QuotesData = Omit<MultiRouteResponse, ErrorFields | 'results'> & {
  quotes: QuoteEntry[]
}

export type QuotesResult = {
  data: QuotesData
  _response: MultiRouteResponse
}

// One slot per server result, in the server's order.
export type CheckedResponse = {
  response: MultiRouteResponse
  errors: (SdkError | undefined)[]
}

export type WarnedResponse = CheckedResponse & { warnings: SdkWarning[][] }
