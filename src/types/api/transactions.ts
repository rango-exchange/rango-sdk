import {Asset, QuoteSimulationResult} from "./common";
import {CosmosTransaction, EvmTransaction, Transfer} from "./txs";
import {Token} from "./meta";


/**
 * The type of transaction
 */
export enum TransactionType {
  EVM = 'EVM',
  TRANSFER = 'TRANSFER',
  COSMOS = 'COSMOS',
}

/**
 * Transaction object
 * Check EvmTransaction, TransferTransaction and CosmosTransaction models for more details
 *
 */
export type GenericTransaction = EvmTransaction | CosmosTransaction | Transfer


/**
 * A transaction's url that can be displayed to advanced user to track the progress
 *
 * @property {string} url - Url of the transaction in blockchain explorer. example: https://etherscan.io/tx/0xa1a3...
 * @property {string | null} description - A custom display name to help user distinguish the transactions from each
 * other. Example: Inbound, Outbound, Bridge, or null
 *
 */
export type SwapExplorerUrl = {
  description: string | null
  url: string
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
 * @property {Asset} from - The source asset
 * @property {Asset} to - The destination asset
 * @property {string} amount - The human-readable amount of asset X that is going to be swapped, example: 0.28
 * @property {string[]} [swappers] - List of all accepted swappers, an empty list means no filter is required
 * @property {string} fromAddress - User source wallet address
 * @property {string} toAddress - User destination wallet address
 * @property {string | number} referrerAddress - Referrer address
 * @property {string | number} referrerFee - Referrer fee in percent, (e.g. 0.3 means: 0.3% fee based on input amount)
 * @property {boolean} disableEstimate - check pre-requests of a swap before creating tx (e.g. check having enough balance)
 * @property {string} slippage - User slippage for this swap (e.g. 5.0 which means 5% slippage)
 *
 */
export type SwapRequest = {
  from: Asset
  to: Asset
  amount: string
  swappers?: string[]
  fromAddress: string
  toAddress: string
  referrerAddress: string | null
  referrerFee: string | null
  disableEstimate: boolean
  slippage: string
}

/**
 * Data of the event including its type and an extra metadata
 * It should be used when an error happened in client and we want to inform server that transaction failed,
 * E.g. user rejected the transaction dialog or and an RPC error raised during signing tx by user.
 *
 * @property {string} requestId - The requestId from best route endpoint
 * @property {string} eventType - Type of the event that happened, example: TX_FAIL
 * @property {[key: string]: string} data - A list of key-value for extra details
 *
 */
export type ReportTransactionRequest = {
  requestId: string
  eventType: 'TX_FAIL'
  data: { [key: string]: string }
}

/**
 * The status of transaction in tracking
 */
export enum TransactionStatus {
  FAILED = 'failed',
  RUNNING = 'running',
  SUCCESS = 'success',
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
  type: "REVERTED_TO_INPUT" | "MIDDLE_ASSET_IN_SRC" | "MIDDLE_ASSET_IN_DEST" | "DESIRED_OUTPUT"
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
 *
 */
export type StatusResponse = {
  status: TransactionStatus | null
  error: string | null
  output: StatusOutput | null
  explorerUrl: SwapExplorerUrl[] | null
}

/**
 * Response body of check-approval
 *
 * @property {boolean} isApproved - A flag which indicates that the approve tx is done or not
 *
 */
export type CheckApprovalResponse = {
  isApproved: boolean
}

/**
 * Response body of swap API
 * @see https://docs.rango.exchange/integration/rango-sdk/sample-transactions
 *
 * @property {string} requestId - The unique requestId which is generated for this request by the server. It should be
 * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
 * @property {string} resultType - Type of result (OK or error type)
 * @property {QuoteSimulationResult | null} route - Suggested route
 * @property {string | null} error - Error message
 * @property {GenericTransaction | null} transaction - Transaction data
 *
 */
export type SwapResponse = {
  requestId: string
  resultType: "OK" | "HIGH_IMPACT" | "INPUT_LIMIT_ISSUE" | "NO_ROUTE"
  route: QuoteSimulationResult | null
  error: string | null
  tx: GenericTransaction | null
}
