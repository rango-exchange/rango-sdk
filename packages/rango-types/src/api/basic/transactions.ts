import { QuoteSimulationResult, RequestedAsset } from './common.js'
import { Token } from './meta.js'
import {
  CosmosTransaction,
  EvmTransaction,
  Transfer,
  SolanaTransaction,
  StarknetTransaction,
} from './txs/index.js'
import {
  TransactionType,
  GenericTransactionType,
  SwapExplorerUrl,
  ReportTransactionRequest,
  TransactionStatus,
  CheckApprovalResponse,
  RoutingResultType,
  StellarTransaction,
  TronTransaction,
  TonTransaction,
  XrplTransaction,
} from '../shared/index.js'

export {
  TransactionType,
  GenericTransactionType,
  SwapExplorerUrl,
  ReportTransactionRequest,
  TransactionStatus,
  CheckApprovalResponse,
}

/** Request body of check tx status */
export type StatusRequest = {
  /** The unique ID which is generated in the best route endpoint */
  requestId: string
  /** Tx hash that wallet returned, example: 0xa1a37ce2063c4764da27d990a22a0c89ed8ac585286a77a... */
  txId: string
}

/** Request body of swap endpoint */
export type SwapRequest = {
  /** The source asset */
  from: RequestedAsset
  /** The destination asset */
  to: RequestedAsset
  /** The human-readable amount of asset X that is going to be swapped, example: 0.28 */
  amount: string
  /** User source wallet address */
  fromAddress: string
  /** User destination wallet address */
  toAddress: string
  /** User slippage for this swap (e.g. 5.0 which means 5% slippage) */
  slippage: number
  /** check pre-requests of a swap before creating tx (e.g. check having enough balance) */
  disableEstimate?: boolean
  /** Referrer code (or affiliate key) You could gnerate it using rango app affiliate menu */
  referrerCode?: string
  /** Referrer address */
  referrerAddress?: string | null
  /** Referrer fee in percent, (e.g. 0.3 means: 0.3% fee based on input amount) */
  referrerFee?: string | null
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
   * Mark it true if you are going to call this swap via your own contract, so we
   * will filter routes that are not possible to be called from a contract
   */
  contractCall?: boolean
  /**
   * You could set this parameter to true if you want to enable routing from the centralized protocols like Xo Swap.
   * By default, this parameter is false.
   */
  enableCentralizedSwappers?: boolean
  /** Infinite approval settings, default is false */
  infiniteApprove?: boolean
  /** When it is true, Swappers that have native tokens as fee must be excluded. example: when you call it from AA account. */
  avoidNativeFee?: boolean
}

/** The final received asset and amount for a swap */
export type StatusOutput = {
  /** received token amount */
  amount: string
  /** received token asset */
  receivedToken: Token
  /** type of received token */
  type:
    | 'REVERTED_TO_INPUT'
    | 'MIDDLE_ASSET_IN_SRC'
    | 'MIDDLE_ASSET_IN_DEST'
    | 'DESIRED_OUTPUT'
}

/** Tracking data for bridged token */
export type BridgeData = {
  /** source chain id */
  srcChainId: number
  /** source transaction hash */
  srcTxHash: string | null
  /** source token address */
  srcToken: string | null
  /** source token amount */
  srcTokenAmt: string
  /** source token decimals */
  srcTokenDecimals: number
  /** source token price */
  srcTokenPrice: string | null
  /** destination chain id */
  destChainId: number
  /** destination transaction hash */
  destTxHash: string | null
  /** destination token address */
  destToken: string | null
  /** destination token amount */
  destTokenAmt: string | null
  /** destination token decimals */
  destTokenDecimals: number
  /** destination token price */
  destTokenPrice: string | null
}

/** Response of check transaction status containing the latest status of transaction in blockchain */
export type StatusResponse = {
  /**
   * Status of the transaction, while the status is running or null, the
   * client should retry until it turns into success or failed
   */
  status: TransactionStatus | null
  /** A message in case of failure, that could be shown to the user */
  error: string | null
  /**
   * The output asset and amount, it could be different from destination asset in
   * case of failures and refund
   */
  output: StatusOutput | null
  /** List of explorer URLs for the transactions of this swap. */
  explorerUrl: SwapExplorerUrl[] | null
  /** Some times transaction will fail and user need follow this diagnosis to redeem the assets. */
  diagnosisUrl: string | null
  /** Status of bridge */
  bridgeData: BridgeData | null
}

/**
 * Response body of swap API
 * @see https://docs.rango.exchange/integration/rango-sdk/sample-transactions
 */
export type SwapResponse = {
  /**
   * The unique requestId which is generated for this request by the server. It should be
   * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
   */
  requestId: string
  /** Type of result (OK or error type) */
  resultType: RoutingResultType
  /** Suggested route */
  route: QuoteSimulationResult | null
  /** Error message */
  error: string | null
  /** Transaction data */
  tx:
    | EvmTransaction
    | CosmosTransaction
    | SolanaTransaction
    | Transfer
    | StarknetTransaction
    | StellarTransaction
    | TronTransaction
    | TonTransaction
    | XrplTransaction
    | null
}
