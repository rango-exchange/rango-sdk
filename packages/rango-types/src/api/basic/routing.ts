import { RoutingResultType } from '../shared/index.js'
import type { Asset, QuoteSimulationResult, RequestedAsset } from './common.js'

export { RoutingResultType }

/** Body of quote request */
export type QuoteRequest = {
  /** The source asset */
  from: RequestedAsset
  /** The destination asset */
  to: RequestedAsset
  /** The human-readable amount of asset X that is going to be swapped, example: 0.28 */
  amount: string
  /** User slippage, used to filter routes which are incompatible with this slippage */
  slippage?: number
  /** List of all accepted swappers, an empty list means no filter is required */
  swappers?: string[]
  /** Indicates include/exclude mode for the swappers param */
  swappersExclude?: boolean
  /** List of all accepted swapper groups, an empty list means no filter is required */
  swapperGroups?: string[]
  /** Indicates include/exclude mode for the swappers group param */
  swappersGroupsExclude?: boolean
  /** List of all messaging protocols, an empty list means no filter is required */
  messagingProtocols?: string[]
  /** Address of your contract on source chain (will be called in case of refund in the source chain) */
  sourceContract?: string
  /** Address of your contract on destination chain (will be called in case of success/refund in the destination chain) */
  destinationContract?: string
  /** The message that you want to pass to your contract on the destination chain */
  imMessage?: string
  /**
   * Mark it true if you are going to call this quote via your own contract, so we
   * will filter routes that are not possible to be called from a contract
   */
  contractCall?: boolean
  /**
   * You could set this parameter to true if you want to enable routing from the centralized protocols like Xo Swap.
   * By default, this parameter is false.
   */
  enableCentralizedSwappers?: boolean
  /** When it is true, Swappers that have native tokens as fee must be excluded. example: when you call it from AA account. */
  avoidNativeFee?: boolean
  /** Referrer code (or affiliate key) You could gnerate it using rango app affiliate menu */
  referrerCode?: string
  /** Referrer fee in percent. e.g. 0.125 for 0.125% of input transaction fee per transaction */
  referrerFee?: number
}

/** The response of quote API, if the route field is null, it means that no route is found */
export type QuoteResponse = {
  /**
   * The unique requestId which is generated for this request by the server. It should be
   * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
   */
  requestId: string
  /** Type of result for route (OK or error type) */
  resultType: RoutingResultType
  /** Suggested route */
  route: QuoteSimulationResult | null
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}

/** The request body for connected assets API */
export type ConnectedAssetsRequest = {
  /** the source asset which we are looking for the possible destination routes */
  from: RequestedAsset
}

/** The type ConnectedAsset represents a blockchain with a list of assets */
export type ConnectedAsset = {
  /**
   * The `blockchain` property in the `ConnectedAsset` type represents
   * the name of the blockchain to which the assets belong.
   */
  blockchain: string
  /**
   * The `assets` property in the `ConnectedAsset` type is an array of
   * `Asset` objects. Each `Asset` object represents a specific asset within the blockchain
   */
  assets: Asset[]
}

/** The response of connected assets API */
export type ConnectedAssetsResponse = {
  /** List of connected assets which they have probably routes from the source asset */
  data: ConnectedAsset[]
}
