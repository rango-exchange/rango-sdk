import type { SdkWarning } from '../../warnings/mod.js'
import type {
  CheckedResponse as CheckedRouteResponse,
  Route,
} from '../quote/mod.js'
import type { ConfirmRouteRequest, ConfirmRouteResponse } from 'rango-sdk'

export type SelectedWallets = ConfirmRouteRequest['selectedWallets']

// `requestId` and `selectedWallets` are `confirm()` arguments, so they can't be given twice.
export type ConfirmReq = Omit<
  ConfirmRouteRequest,
  'requestId' | 'selectedWallets'
>

export type ConfirmOptions = {
  req?: ConfirmReq
  signal?: AbortSignal
}

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
