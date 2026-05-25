import { RoutingResultType } from '../shared/index.js'
import type { Amount, Asset, SwapResult } from './common.js'
import type { TransactionType } from './transactions.js'

export { RoutingResultType }

/** All user wallets for a specific blockchain */
export type UserWalletBlockchain = {
  /** The blockchain that wallets belong to */
  blockchain: string
  /** List of user wallet addresses for the specified blockchain */
  addresses: string[]
}

/** Full information of a path of multiple swaps that should be executed by user to swap X to Y */
export type SimulationResult = {
  /** The estimation of Rango from output amount of Y */
  outputAmount: string
  /**
   * Indicates that result is OK or have some problems such as Price Impact issue.
   * If there is a price impact issue Rango won't allow dApps to createTransaction and it will fail because of the risk of huge loss for user.
   */
  resultType: RoutingResultType
  /** List of required swaps to swap X to Y with the expected outputAmount */
  swaps: SwapResult[]
}

/** Describing a required Asset for swapping X to Y and check if the wallet has enough balance or not */
export type WalletRequiredAssets = {
  /** asset required for fee or balance */
  asset: Asset
  requiredAmount: Amount
  currentAmount: Amount
  /** If true, means this requirement is fulfilled, false means swap may fail due to insufficient balance */
  ok: boolean
  /** 'FEE' | 'FEE_AND_INPUT_ASSET' | 'INPUT_ASSET' */
  reason: 'FEE' | 'FEE_AND_INPUT_ASSET' | 'INPUT_ASSET'
}

/** The validation status of a wallet */
export type WalletValidationStatus = {
  /** The address of wallet */
  address: string
  /** If false, the wallet address is invalid for the given blockchain */
  addressIsValid: boolean
  /**
   * The list of required assets for swapping X to Y in this wallet
   * and the status to indicate whether these assets are missing or not
   */
  requiredAssets: WalletRequiredAssets[]
  /** If false, Rango was unable to fetch the balance of this address to check the requiredAssets availability */
  validResult: boolean
}

/** The blockchain that this validation data belongs to */
export type BlockchainValidationStatus = {
  /** The blockchain of validation */
  blockchain: string
  /** The status of validation for all the wallets of the specific blockchain */
  wallets: WalletValidationStatus[]
}

/** The data required for relaying message from the source chain to the target chain in a cross-chain swap */
export type InterChainMessage = {
  /** Address of your contract on source chain (will be called in case of refund in the source chain) */
  sourceContract: string
  /** Address of your contract on destination chain (will be called in case of success/refund in the destination chain) */
  destinationContract: string
  /** The message that you want to pass to your contract on the destination chain */
  imMessage: string
}

/** Body of routing request */
export type BestRouteRequest = {
  /** The source asset */
  from: Asset
  /** The destination asset */
  to: Asset
  /** The human-readable amount of asset X that is going to be swapped, example: 0.28 */
  amount: string
  /** Map of blockchain to selected address */
  selectedWallets: { [key: string]: string }
  /** List of all user connected wallet addresses per each blockchain */
  connectedWallets?: UserWalletBlockchain[] | null
  /**
   * It should be false when client just likes to preview the route to user,
   * and true when user accepted to swap. If true, server will be slower to respond, but will check some pre-requisites including balance
   * of token X and required fees in user's wallets. The default value is false.
   */
  checkPrerequisites?: boolean
  /** User slippage, used to filter routes which are incompatible with this slippage */
  slippage?: string
  /** Custom destination for the route */
  destination?: string
  /** Use this flag if you want to ignore checkPrerequisites before executing the route */
  forceExecution?: boolean
  /**
   * To enable dApps to charge affiliate fees and generate income from users' transactions,
   * the affiliate referral code should be provided. You can create this code by visiting the following link: https://app.rango.exchange/affiliate.
   */
  affiliateRef?: string | null
  /** If you want to change the default affiliate fee percentage, you can provide a new value here. */
  affiliatePercent?: number | null
  /**
   * If you want to change the default affiliate wallet addresses, you can provide new values here.
   * (Map of route blockchains to affiliate address)
   */
  affiliateWallets?: { [key: string]: string }
  /** It should be false when client wants to support multi-transactions per route step. default is true. */
  disableMultiStepTx?: boolean
  /** List of all accepted blockchains, an empty list means no filter is required */
  blockchains?: string[]
  /** List of all accepted swappers, an empty list means no filter is required */
  swappers?: string[]
  /** Indicates include/exclude mode for the swappers param */
  swappersExclude?: boolean
  /** List of all accepted swapper groups, an empty list means no filter is required */
  swapperGroups?: string[]
  /** Indicates include/exclude mode for the swappers group param */
  swappersGroupsExclude?: boolean
  /** List of all accepted transaction types including [EVM, TRANSFER, COSMOS, ...] */
  transactionTypes?: TransactionType[]
  /** List of all messaging protocols, an empty list means no filter is required */
  messagingProtocols?: string[]
  /** Maximum number of steps in a route */
  maxLength?: number
  /** For enabling experimental features in routing */
  experimental?: boolean
  /**
   * Mark it true if you are going to call this route via your own contract, so we
   * will filter routes that are not possible to be called from a contract
   */
  contractCall?: boolean
  /** The data required for relaying message in a cross-chain swap */
  interChainMessage?: InterChainMessage | null
  /**
   * You could set this parameter to true if you want to enable routing from the centralized protocols like Exodus.
   * By default, this parameter is false.
   */
  enableCentralizedSwappers?: boolean
  /** When it is true, Swappers that have native tokens as fee must be excluded. example: when you call it from AA account. */
  avoidNativeFee?: boolean
}

/** The response of best route, if the result fields is null, it means that no route is found */
export type BestRouteResponse = {
  /**
   * The unique requestId which is generated for this request by the server. It should be
   * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
   */
  requestId: string
  /** The human readable input amount from the request */
  requestAmount: string
  /** The source asset */
  from: Asset
  /** The destination asset */
  to: Asset
  result: SimulationResult | null
  /**
   * Pre-requisites check result. It will be null if
   * the request checkPrerequisites was false
   */
  validationStatus: BlockchainValidationStatus[]
  /**
   * list of string messages that might be cause of not finding the route.
   * It's just for display purposes
   */
  diagnosisMessages: string[]
  /**
   * List of all blockchains which are necessary to be present for the best
   * route and user has not provided any connected wallets for it. A null or empty list indicates that there is no problem.
   */
  missingBlockchains: string[]
  /** A warning indicates that none of your wallets have the same blockchain as X asset */
  walletNotSupportingFromBlockchain: boolean
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}

export type Tag =
  | 'RECOMMENDED'
  | 'FASTEST'
  | 'LOWEST_FEE'
  | 'HIGH_IMPACT'
  | 'CENTRALIZED'
  | 'CAMPAIGN'

/** A tag that can be assigned to a route. */
export type TagValue = Tag | Omit<string, Tag>

/** The multi-routing result tag. */
export type RouteTag = {
  /** The human-readable label. */
  label: string
  /** The value of Tag. */
  value: TagValue
}

/** The type of preferences for sorting routes. */
export type PreferenceType = 'FEE' | 'SPEED' | 'PRICE' | 'NET_OUTPUT' | 'SMART'

/** Score calculated for each preference for sorting in UI */
export type SimulationScore = {
  /** Type of evaluated aspect. */
  preferenceType: PreferenceType
  /** Value of score (typically between 0 to 100). */
  score: number
}

/** Full information of a path of multiple swaps that should be executed by user to swap X to Y */
export type MultiRouteSimulationResult = {
  /**
   * The unique requestId which is generated for this request by the server. It should be
   * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
   */
  requestId: string
  /** The estimation of Rango from output amount of Y */
  outputAmount: string
  /**
   * Indicates that result is OK or have some problems such as Price Impact issue.
   * If there is a price impact issue Rango won't allow dApps to createTransaction and it will fail because of the risk of huge loss for user.
   */
  resultType: RoutingResultType
  /** List of required swaps to swap X to Y with the expected outputAmount */
  swaps: SwapResult[]
  /** List of scores calculated for each preference aspect */
  scores: { preferenceType: PreferenceType; score: number }[]
  /** List of tags attributed to each route considering every aspect */
  tags: RouteTag[]
  /**
   * List of all blockchains which are necessary to be present for the best
   * route and user has not provided any connected wallets for it. A null or empty list indicates that there is no problem.
   */
  missingBlockchains: string[]
  /** A warning indicates that none of your wallets have the same blockchain as X asset */
  walletNotSupportingFromBlockchain: boolean
}

/** The best route request body for multi-routing */
export type MultiRouteRequest = Omit<BestRouteRequest, 'selectedWallets' | 'destination' | 'checkPrerequisites' | 'forceExecution' | 'maxLength'>

/** The best route response for multi-routing, if the results field is empty, it means that no route is found */
export type MultiRouteResponse = {
  /** The source asset */
  from: Asset
  /** The destination asset */
  to: Asset
  /** The human readable input amount from the request */
  requestAmount: string
  /** The unique roteId generated for this request by server */
  routeId: string
  /** List of best routes data */
  results: MultiRouteSimulationResult[]
  /**
   * list of string messages that might be cause of not finding the route.
   * It's just for display purposes
   */
  diagnosisMessages: string[]
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}

/** The body of confirmation request for selected route. */
export type ConfirmRouteRequest = {
  /**
   * The unique requestId which is generated for this request by the server. It should be
   * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
   */
  requestId: string
  /** Map of blockchain to selected address */
  selectedWallets: { [key: string]: string }
  /** Custom destination for the route */
  destination?: string
}

/** The response of confirmation request for selected route */
export type ConfirmRouteResponse = {
  /** If true, the result has a value and error message is null. */
  ok: boolean
  /** Result of confirm swap */
  result: Omit<BestRouteResponse, 'error' | 'errorCode' | 'traceId'> | null
  /** Error message about the incident if ok == false. */
  error: string | null
  /** Error code about the incident if ok == false. */
  errorCode: string | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}
