import { RoutingResultType } from '../shared/index.js'
import type { Asset, QuoteSimulationResult, RequestedAsset } from './common.js'

export { RoutingResultType }

/**
 * Body of quote request
 *
 * @property {RequestedAsset} from - The source asset
 * @property {RequestedAsset} to - The destination asset
 * @property {string} amount - The human-readable amount of asset X that is going to be swapped, example: 0.28
 * @property {number} [slippage] - User slippage, used to filter routes which are incompatible with this slippage
 * @property {string} [referrerCode] - Referrer code (or affiliate key) You could gnerate it using rango app affiliate menu
 * @property {number} [referrerFee] - Referrer fee in percent. e.g. 0.125 for 0.125% of input transaction fee per transaction
 * @property {string[]} [swappers] - List of all accepted swappers, an empty list means no filter is required
 * @property {boolean} [swappersExclude] - Indicates include/exclude mode for the swappers param
 * @property {string[]} [swapperGroups] - List of all accepted swapper groups, an empty list means no filter is required
 * @property {boolean} [swappersGroupsExclude] - Indicates include/exclude mode for the swappers group param
 * @property {string[]} [messagingProtocols] - List of all messaging protocols, an empty list means no filter is required
 * @property {string} [sourceContract] - Address of your contract on source chain (will be called in case of refund in the source chain)
 * @property {string} [destinationContract] - Address of your contract on destination chain (will be called in case of success/refund in the destination chain)
 * @property {string} [imMessage] - The message that you want to pass to your contract on the destination chain
 * @property {boolean} [contractCall] - Mark it true if you are going to call this quote via your own contract, so we
 * will filter routes that are not possible to be called from a contract
 * @property {boolean} [enableCentralizedSwappers] - You could set this parameter to true if you want to enable routing from the centralized protocols like Xo Swap.
 * By default, this parameter is false.
 * @property {boolean} [avoidNativeFee] - When it is true, Swappers that have native tokens as fee must be excluded. example: when you call it from AA account.
 *
 */
export type QuoteRequest = {
  from: RequestedAsset
  to: RequestedAsset
  amount: string
  slippage?: number
  swappers?: string[]
  swappersExclude?: boolean
  swapperGroups?: string[]
  swappersGroupsExclude?: boolean
  messagingProtocols?: string[]
  sourceContract?: string
  destinationContract?: string
  imMessage?: string
  contractCall?: boolean
  enableCentralizedSwappers?: boolean
  avoidNativeFee?: boolean
  referrerCode?: string
  referrerFee?: number
}

/**
 * The response of quote API, if the route field is null, it means that no route is found
 *
 * @property {string} requestId - The unique requestId which is generated for this request by the server. It should be
 * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
 * @property {RoutingResultType} resultType - Type of result for route (OK or error type)
 * @property {QuoteSimulationResult | null} route - Suggested route
 * @property {string | null} error - Error message
 * @property {number | null} errorCode - Error code
 * @property {number | null} traceId - Trace Id, for debug purpose
 *
 */
export type QuoteResponse = {
  requestId: string
  resultType: RoutingResultType
  route: QuoteSimulationResult | null
  error: string | null
  errorCode: number | null
  traceId: number | null
}

/**
 * The request body for connected assets API
 *
 * @property {RequestedAsset} from - the source asset which we are looking for the possible destination routes
 *
 */
export type ConnectedAssetsRequest = {
  from: RequestedAsset
}

/**
 * The type ConnectedAsset represents a blockchain with a list of assets
 *
 * @property {string} blockchain - The `blockchain` property in the `ConnectedAsset` type represents
 * the name of the blockchain to which the assets belong.
 * @property {Asset[]} assets - The `assets` property in the `ConnectedAsset` type is an array of
 * `Asset` objects. Each `Asset` object represents a specific asset within the blockchain
 *
 */
export type ConnectedAsset = {
  blockchain: string
  assets: Asset[]
}

/**
 * The response of connected assets API
 *
 * @property {ConnectedAsset[]} data - List of connected assets which they have probably routes from the source asset
 *
 */
export type ConnectedAssetsResponse = {
  data: ConnectedAsset[]
}
