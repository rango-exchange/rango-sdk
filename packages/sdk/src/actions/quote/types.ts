import type { SdkWarning } from '../../warnings/mod.js'
import type {
  BestRouteRequest,
  BestRouteResponse,
  SimulationResult,
} from 'rango-sdk'

export type QuoteRequest = Omit<BestRouteRequest, 'checkPrerequisites'> & {
  /**
   * It should be false when client just likes to preview the route to user,
   * and true when user accepted to swap. If true, server will be slower to respond, but will check some pre-requisites including balance
   * of token X and required fees in user's wallets.
   *
   * @defaultValue true
   */
  checkPrerequisites?: boolean
}

export type ErrorFields = 'error' | 'errorCode' | 'traceId'

export type RouteResponse = Omit<
  BestRouteResponse,
  ErrorFields | 'diagnosisMessages' | 'result'
> & {
  result: SimulationResult
}

// What `quote()` and `confirm()` resolve to, and what `execute()` takes.
export type Route = RouteResponse & {
  selectedWallets: BestRouteRequest['selectedWallets']
  slippage?: string
}

export type QuoteResult = {
  data: Route
  warnings: SdkWarning[]
  _response: BestRouteResponse
}

export type CheckedResponse = BestRouteResponse & { result: SimulationResult }

export type WarnedResponse = {
  response: CheckedResponse
  warnings: SdkWarning[]
}
