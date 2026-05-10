import { RoutingResultType } from '../shared/index.js'
import type { Amount, Asset, SwapResult } from './common.js'
import type { TransactionType } from './transactions.js'

export { RoutingResultType }

/**
 * All user wallets for a specific blockchain
 *
 * @property {string} blockchain - The blockchain that wallets belong to
 * @property {string[]} addresses - List of user wallet addresses for the specified blockchain
 *
 */
export type UserWalletBlockchain = {
  blockchain: string
  addresses: string[]
}

/**
 * Full information of a path of multiple swaps that should be executed by user to swap X to Y
 *
 * @property {string} outputAmount - The estimation of Rango from output amount of Y
 * @property {RoutingResultType} resultType - Indicates that result is OK or have some problems such as Price Impact issue.
 * If there is a price impact issue Rango won't allow dApps to createTransaction and it will fail because of the risk of huge loss for user.
 * @property {SwapResult[]} swaps - List of required swaps to swap X to Y with the expected outputAmount
 *
 */
export type SimulationResult = {
  outputAmount: string
  resultType: RoutingResultType
  swaps: SwapResult[]
}

/**
 * Describing a required Asset for swapping X to Y and check if the wallet has enough balance or not
 *
 * @property {Asset} asset - asset required for fee or balance
 * @property {Asset} requiredAmount
 * @property {Amount} currentAmount
 * @property {boolean} ok - If true, means this requirement is fulfilled, false means swap may fail due to insufficient balance
 * @property {string} reason - 'FEE' | 'FEE_AND_INPUT_ASSET' | 'INPUT_ASSET'
 *
 */
export type WalletRequiredAssets = {
  asset: Asset
  requiredAmount: Amount
  currentAmount: Amount
  ok: boolean
  reason: 'FEE' | 'FEE_AND_INPUT_ASSET' | 'INPUT_ASSET'
}

/**
 * The validation status of a wallet
 *
 * @property {string} address - The address of wallet
 * @property {boolean} addressIsValid - If false, the wallet address is invalid for the given blockchain
 * @property {WalletRequiredAssets[]} requiredAssets - The list of required assets for swapping X to Y in this wallet
 * and the status to indicate whether these assets are missing or not
 * @property {boolean} validResult - If false, Rango was unable to fetch the balance of this address to check the
 * requiredAssets availability
 *
 */
export type WalletValidationStatus = {
  address: string
  addressIsValid: boolean
  requiredAssets: WalletRequiredAssets[]
  validResult: boolean
}

/**
 * The blockchain that this validation data belongs to
 *
 * @property {string} blockchain - The blockchain of validation
 * @property {WalletValidationStatus[]} wallets - The status of validation for all the wallets of the specific blockchain
 *
 */
export type BlockchainValidationStatus = {
  blockchain: string
  wallets: WalletValidationStatus[]
}

/**
 * The data required for relaying message from the source chain to the target chain in a cross-chain swap
 *
 * @property {string} sourceContract - Address of your contract on source chain (will be called in case of refund in the source chain)
 * @property {string} destinationContract - Address of your contract on destination chain (will be called in case of success/refund in the destination chain)
 * @property {string} imMessage - The message that you want to pass to your contract on the destination chain
 *
 */
export type InterChainMessage = {
  sourceContract: string
  destinationContract: string
  imMessage: string
}

/**
 * Body of routing request
 *
 * @property {Asset} from - The source asset
 * @property {Asset} to - The destination asset
 * @property {string} amount - The human-readable amount of asset X that is going to be swapped, example: 0.28
 * @property {{ [key: string]: string }} selectedWallets - Map of blockchain to selected address
 * @property {UserWalletBlockchain[] | null} [connectedWallets] - List of all user connected wallet addresses per each blockchain
 * @property {boolean} [checkPrerequisites] - It should be false when client just likes to preview the route to user,
 * and true when user accepted to swap. If true, server will be slower to respond, but will check some pre-requisites including balance
 * of token X and required fees in user's wallets. The default value is false.
 * @property {string} [slippage] - User slippage, used to filter routes which are incompatible with this slippage
 * @property {string} [destination] - Custom destination for the route
 * @property {boolean} [forceExecution] - Use this flag if you want to ignore checkPrerequisites before executing the route
 * @property {string | null} [affiliateRef] - To enable dApps to charge affiliate fees and generate income from users' transactions,
 * the affiliate referral code should be provided. You can create this code by visiting the following link: https://app.rango.exchange/affiliate.
 * @property {number | null} [affiliatePercent] - If you want to change the default affiliate fee percentage, you can provide a new value here.
 * @property {{ [key: string]: string }} [affiliateWallets] - If you want to change the default affiliate wallet addresses, you can provide new values here.
 * (Map of route blockchains to affiliate address)
 * @property {boolean} [disableMultiStepTx] - It should be false when client wants to support multi-transactions per route step. default is true.
 * @property {string[]} [blockchains] - List of all accepted blockchains, an empty list means no filter is required
 * @property {string[]} [swappers] - List of all accepted swappers, an empty list means no filter is required
 * @property {boolean} [swappersExclude] - Indicates include/exclude mode for the swappers param
 * @property {string[]} [swapperGroups] - List of all accepted swapper groups, an empty list means no filter is required
 * @property {boolean} [swappersGroupsExclude] - Indicates include/exclude mode for the swappers group param
 * @property {TransactionType[]} [transactionTypes] - List of all accepted transaction types including [EVM, TRANSFER, COSMOS, ...]
 * @property {string[]} [messagingProtocols] - List of all messaging protocols, an empty list means no filter is required
 * @property {number} [maxLength] - Maximum number of steps in a route
 * @property {boolean} [experimental] - For enabling experimental features in routing
 * @property {boolean} [contractCall] - Mark it true if you are going to call this route via your own contract, so we
 * will filter routes that are not possible to be called from a contract
 * @property {InterChainMessage} [interChainMessage] - The data required for relaying message in a cross-chain swap
 * @property {boolean} [enableCentralizedSwappers] - You could set this parameter to true if you want to enable routing from the centralized protocols like Exodus.
 * By default, this parameter is false.
 * @property {boolean} [avoidNativeFee] - When it is true, Swappers that have native tokens as fee must be excluded. example: when you call it from AA account.
 *
 */
export type BestRouteRequest = {
  from: Asset
  to: Asset
  amount: string
  selectedWallets: { [key: string]: string }
  connectedWallets?: UserWalletBlockchain[] | null
  checkPrerequisites?: boolean
  slippage?: string
  destination?: string
  forceExecution?: boolean
  affiliateRef?: string | null
  affiliatePercent?: number | null
  affiliateWallets?: { [key: string]: string }
  disableMultiStepTx?: boolean
  blockchains?: string[]
  swappers?: string[]
  swappersExclude?: boolean
  swapperGroups?: string[]
  swappersGroupsExclude?: boolean
  transactionTypes?: TransactionType[]
  messagingProtocols?: string[]
  maxLength?: number
  experimental?: boolean
  contractCall?: boolean
  interChainMessage?: InterChainMessage | null
  enableCentralizedSwappers?: boolean
  avoidNativeFee?: boolean
}

/**
 * The response of best route, if the result fields is null, it means that no route is found
 *
 * @property {string} requestId - The unique requestId which is generated for this request by the server. It should be
 * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
 * @property {string} requestAmount - The human readable input amount from the request
 * @property {Asset} from - The source asset
 * @property {Asset} to - The destination asset
 * @property {SimulationResult | null} result
 * @property {BlockchainValidationStatus[]} validationStatus - Pre-requisites check result. It will be null if
 * the request checkPrerequisites was false
 * @property {string[]} diagnosisMessages - list of string messages that might be cause of not finding the route.
 * It's just for display purposes
 * @property {string[]} missingBlockchains - List of all blockchains which are necessary to be present for the best
 * route and user has not provided any connected wallets for it. A null or empty list indicates that there is no problem.
 * @property {boolean} walletNotSupportingFromBlockchain - A warning indicates that none of your wallets have the same
 * blockchain as X asset
 * @property {boolean} boolean - A The state of confirm swap
 * @property {string | null} error - Error message
 * @property {number | null} errorCode - Error code
 * @property {number | null} traceId - Trace Id, for debug purpose
 *
 */
export type BestRouteResponse = {
  requestId: string
  requestAmount: string
  from: Asset
  to: Asset
  result: SimulationResult | null
  validationStatus: BlockchainValidationStatus[]
  diagnosisMessages: string[]
  missingBlockchains: string[]
  walletNotSupportingFromBlockchain: boolean
  error: string | null
  errorCode: number | null
  traceId: number | null
}

export type Tag =
  | 'RECOMMENDED'
  | 'FASTEST'
  | 'LOWEST_FEE'
  | 'HIGH_IMPACT'
  | 'CENTRALIZED'
  | 'CAMPAIGN'

/**
 * A tag that can be assigned to a route.
 */
export type TagValue = Tag | Omit<string, Tag>

/**
 * The multi-routing result tag.
 *
 * @property {string} label - The human-readable label.
 * @property {TagValue} value - The value of Tag.
 */
export type RouteTag = { label: string; value: TagValue }

/**
 * The type of preferences for sorting routes.
 */
export type PreferenceType = 'FEE' | 'SPEED' | 'PRICE' | 'NET_OUTPUT' | 'SMART'

/**
 * Score calculated for each preference for sorting in UI
 *
 * @property {PreferenceType} preferenceType - Type of evaluated aspect.
 * @property {number} score - Value of score (typically between 0 to 100).
 */
export type SimulationScore = {
  preferenceType: PreferenceType
  score: number
}

/**
 * Full information of a path of multiple swaps that should be executed by user to swap X to Y
 *
 * @property {string} requestId - The unique requestId which is generated for this request by the server. It should be
 * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
 * @property {string} outputAmount - The estimation of Rango from output amount of Y
 * @property {RoutingResultType} resultType - Indicates that result is OK or have some problems such as Price Impact issue.
 * If there is a price impact issue Rango won't allow dApps to createTransaction and it will fail because of the risk of huge loss for user.
 * @property {SwapResult[]} swaps - List of required swaps to swap X to Y with the expected outputAmount
 * @property {SimulationScore[]} scores - List of scores calculated for each preference aspect
 * @property {RouteTag[]} tags - List of tags attributed to each route considering every aspect
 * @property {string[]} missingBlockchains - List of all blockchains which are necessary to be present for the best
 * route and user has not provided any connected wallets for it. A null or empty list indicates that there is no problem.
 * @property {boolean} walletNotSupportingFromBlockchain - A warning indicates that none of your wallets have the same
 * blockchain as X asset
 */
export type MultiRouteSimulationResult = {
  requestId: string
  outputAmount: string
  resultType: RoutingResultType
  swaps: SwapResult[]
  scores: { preferenceType: PreferenceType; score: number }[]
  tags: RouteTag[]
  missingBlockchains: string[] 
  walletNotSupportingFromBlockchain: boolean
}

/**
 * The best route request body for multi-routing
 */
export type MultiRouteRequest = Omit<BestRouteRequest, 'selectedWallets' | 'destination' | 'checkPrerequisites' | 'forceExecution' | 'maxLength'>

/**
 * The best route response for multi-routing, if the results field is empty, it means that no route is found
 *
 * @property {Asset} from - The source asset
 * @property {Asset} to - The destination asset
 * @property {string} requestAmount - The human readable input amount from the request
 * @property {string} routeId - The unique roteId generated for this request by server
 * @property {MultiRouteSimulationResult} results - List of best routes data
 * @property {string[]} diagnosisMessages - list of string messages that might be cause of not finding the route.
 * It's just for display purposes
 * @property {string | null} error - Error message
 * @property {number | null} errorCode - Error code
 * @property {number | null} traceId - Trace Id, for debug purpose
 */
export type MultiRouteResponse = {
  from: Asset
  to: Asset
  requestAmount: string
  routeId: string
  results: MultiRouteSimulationResult[]
  diagnosisMessages: string[]
  error: string | null
  errorCode: number | null
  traceId: number | null
}

/**
 * The body of confirmation request for selected route.
 *
 * @property {string} requestId - The unique requestId which is generated for this request by the server. It should be
 * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
 * @property {{ [key: string]: string }} selectedWallets - Map of blockchain to selected address
 * @property {string} [destination] - Custom destination for the route
 */
export type ConfirmRouteRequest = {
  requestId: string
  selectedWallets: { [key: string]: string }
  destination?: string
}

/**
 * The response of confirmation request for selected route
 *
 * @property {boolean} ok - If true, the result has a value and error message is null.
 * @property {BestRouteResponse | null} result - Result of confirm swap
 * @property {string | null} error - Error message about the incident if ok == false.
 * @property {string | null} errorCode - Error code about the incident if ok == false.
 * @property {number | null} traceId - Trace Id, for debug purpose
 */
export type ConfirmRouteResponse = {
  ok: boolean
  result: Omit<BestRouteResponse, 'error' | 'errorCode' | 'traceId'> | null
  error: string | null
  errorCode: string | null
  traceId: number | null
}
