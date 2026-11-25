import type { SdkWarning } from '../../warnings/mod.js'
import type {
  BestRouteRequest,
  BestRouteResponse,
  SimulationResult,
} from 'rango-sdk'

/** A blockchain's selected wallet: its address, and the ID of the wallet that holds it, such as `metamask`. */
export type SelectedWallet = { address: string; walletId: string }

/** The selected wallet of each blockchain, keyed by blockchain. */
export type SelectedWallets = { [blockchain: string]: SelectedWallet }

export type QuoteRequest = Omit<
  BestRouteRequest,
  'checkPrerequisites' | 'selectedWallets'
> & {
  /**
   * It should be false when client just likes to preview the route to user,
   * and true when user accepted to swap. If true, server will be slower to respond, but will check some pre-requisites including balance
   * of token X and required fees in user's wallets.
   *
   * @defaultValue true
   */
  checkPrerequisites?: boolean
  selectedWallets: SelectedWallets
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
  selectedWallets: SelectedWallets
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
