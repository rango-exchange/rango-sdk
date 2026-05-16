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

/**
 * Request body of check tx status
 *
 * @property {string} requestId - The unique ID which is generated in the best route endpoint
 * @property {number} txId - Tx hash that wallet returned, example: 0xa1a37ce2063c4764da27d990a22a0c89ed8ac585286a77a...
 *
 */
export type StatusRequest = {
  requestId: string
  txId: string
}

/**
 * Request body of swap endpoint
 *
 * @property {RequestedAsset} from - The source asset
 * @property {RequestedAsset} to - The destination asset
 * @property {string} amount - The human-readable amount of asset X that is going to be swapped, example: 0.28
 * @property {string} fromAddress - User source wallet address
 * @property {string} toAddress - User destination wallet address
 * @property {number} slippage - User slippage for this swap (e.g. 5.0 which means 5% slippage)
 * @property {boolean} [disableEstimate] - check pre-requests of a swap before creating tx (e.g. check having enough balance)
 * @property {string | null} [referrerCode] - Referrer code (or affiliate key) You could gnerate it using rango app affiliate menu
 * @property {string | null} [referrerAddress] - Referrer address
 * @property {string | null} [referrerFee] - Referrer fee in percent, (e.g. 0.3 means: 0.3% fee based on input amount)
 * @property {string[]} [swappers] - List of all accepted swappers, an empty list means no filter is required
 * @property {boolean} [swappersExclude] - Indicates include/exclude mode for the swappers param
 * @property {string[]} [swapperGroups] - List of all accepted swapper groups, an empty list means no filter is required
 * @property {boolean} [swappersGroupsExclude] - Indicates include/exclude mode for the swappers group param
 * @property {string[]} [messagingProtocols] - List of all messaging protocols, an empty list means no filter is required
 * @property {string} [sourceContract] - Address of your contract on source chain (will be called in case of refund in the source chain)
 * @property {string} [destinationContract] - Address of your contract on destination chain (will be called in case of success/refund in the destination chain)
 * @property {string} [imMessage] - The message that you want to pass to your contract on the destination chain
 * @property {boolean} [contractCall] - Mark it true if you are going to call this swap via your own contract, so we
 * will filter routes that are not possible to be called from a contract
 * @property {boolean} [enableCentralizedSwappers] - You could set this parameter to true if you want to enable routing from the centralized protocols like Xo Swap.
 * By default, this parameter is false.
 * @property {boolean} [infiniteApprove] - Infinite approval settings, default is false
 * @property {boolean} [avoidNativeFee] - When it is true, Swappers that have native tokens as fee must be excluded. example: when you call it from AA account.
 *
 */
export type SwapRequest = {
  from: RequestedAsset
  to: RequestedAsset
  amount: string
  fromAddress: string
  toAddress: string
  slippage: number
  disableEstimate?: boolean
  referrerCode?: string
  referrerAddress?: string | null
  referrerFee?: string | null
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
  infiniteApprove?: boolean
  avoidNativeFee?: boolean
}

/**
 * The final received asset and amount for a swap
 *
 * @property {string} amount - received token amount
 * @property {Token} receivedToken - received token asset
 * @property {string} type - type of received token
 *
 */
export type StatusOutput = {
  amount: string
  receivedToken: Token
  type:
    | 'REVERTED_TO_INPUT'
    | 'MIDDLE_ASSET_IN_SRC'
    | 'MIDDLE_ASSET_IN_DEST'
    | 'DESIRED_OUTPUT'
}

/**
 * Tracking data for bridged token
 *
 * @property {number} srcChainId - source chain id
 * @property {string | null} srcTxHash - source transaction hash
 * @property {string | null} srcToken - source token address
 * @property {string} srcTokenAmt - source token amount
 * @property {number} srcTokenDecimals - source token decimals
 * @property {number | null} srcTokenPrice - source token price
 * @property {number} destChainId - destination chain id
 * @property {string | null} destTxHash - destination transaction hash
 * @property {string | null} destToken - destination token address
 * @property {string | null} destTokenAmt - destination token amount
 * @property {number} destTokenDecimals - destination token decimals
 * @property {number | null} destTokenPrice - destination token price
 *
 */
export type BridgeData = {
  srcChainId: number
  srcTxHash: string | null
  srcToken: string | null
  srcTokenAmt: string
  srcTokenDecimals: number
  srcTokenPrice: string | null
  destChainId: number
  destTxHash: string | null
  destToken: string | null
  destTokenAmt: string | null
  destTokenDecimals: number
  destTokenPrice: string | null
}

/**
 * Response of check transaction status containing the latest status of transaction in blockchain
 *
 * @property {TransactionStatus | null} status - Status of the transaction, while the status is running or null, the
 * client should retry until it turns into success or failed
 * @property {string | null} error - A message in case of failure, that could be shown to the user
 * @property {StatusOutput | null} output - The output asset and amount, it could be different from destination asset in
 * case of failures and refund
 * @property {SwapExplorerUrl[] | null} explorerUrl - List of explorer URLs for the transactions of this swap.
 * @property {string | null} diagnosisUrl - Some times transaction will fail and user need follow this diagnosis to redeem the assets.
 * @property {BridgeData | null} bridgeData - Status of bridge
 *
 */
export type StatusResponse = {
  status: TransactionStatus | null
  error: string | null
  output: StatusOutput | null
  explorerUrl: SwapExplorerUrl[] | null
  diagnosisUrl: string | null
  bridgeData: BridgeData | null
}

/**
 * Response body of swap API
 * @see https://docs.rango.exchange/integration/rango-sdk/sample-transactions
 *
 * @property {string} requestId - The unique requestId which is generated for this request by the server. It should be
 * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
 * @property {RoutingResultType} resultType - Type of result (OK or error type)
 * @property {QuoteSimulationResult | null} route - Suggested route
 * @property {string | null} error - Error message
 * @property {EvmTransaction | CosmosTransaction | SolanaTransaction | Transfer | StarknetTransaction | TronTransaction | null} transaction - Transaction data
 *
 */
export type SwapResponse = {
  requestId: string
  resultType: RoutingResultType
  route: QuoteSimulationResult | null
  error: string | null
  tx:
    | EvmTransaction
    | CosmosTransaction
    | SolanaTransaction
    | Transfer
    | StarknetTransaction
    | TronTransaction
    | TonTransaction
    | XrplTransaction
    | null
}
