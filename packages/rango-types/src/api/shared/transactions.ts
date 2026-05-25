/** The type of transaction */
export enum TransactionType {
  EVM = 'EVM',
  TRANSFER = 'TRANSFER',
  COSMOS = 'COSMOS',
  SOLANA = 'SOLANA',
  TRON = 'TRON',
  STARKNET = 'STARKNET',
  TON = 'TON',
  SUI = 'SUI',
  XRPL = 'XRPL',
  STELLAR = 'STELLAR',
  HYPERLIQUID = 'HYPERLIQUID',
}

/**
 * The type of transaction
 * @deprecated use TransactionType instead
 */
export enum GenericTransactionType {
  EVM = 'EVM',
  TRANSFER = 'TRANSFER',
  COSMOS = 'COSMOS',
  SOLANA = 'SOLANA',
}

/** A transaction's url that can be displayed to advanced user to track the progress */
export type SwapExplorerUrl = {
  /** A custom display name to help user distinguish the transactions from each other. Example: Inbound, Outbound, Bridge, or null */
  description: string | null
  /** Url of the transaction in blockchain explorer. example: https://etherscan.io/tx/0xa1a3... */
  url: string
}

/**
 * APIErrorCode
 *
 * Error code of a swap failure
 */
export type APIErrorCode =
  | 'TX_FAIL'
  | 'TX_EXPIRED'
  | 'FETCH_TX_FAILED'
  | 'USER_REJECT'
  | 'USER_CANCEL'
  | 'USER_CANCELED_TX'
  | 'CALL_WALLET_FAILED'
  | 'SEND_TX_FAILED'
  | 'CALL_OR_SEND_FAILED'
  | 'TX_FAILED_IN_BLOCKCHAIN'
  | 'CLIENT_UNEXPECTED_BEHAVIOUR'
  | 'INSUFFICIENT_APPROVE'

/**
 * The function checks if a given string value is a valid API error code.
 * @param {string} value - a string that represents a possible API error code.
 * @returns A boolean value is being returned, indicating whether the input `value` is of type
 * `APIErrorCode` or not.
 */
export function isAPIErrorCode(value: string): value is APIErrorCode {
  return [
    'TX_FAIL',
    'TX_EXPIRED',
    'FETCH_TX_FAILED',
    'USER_REJECT',
    'USER_CANCEL',
    'USER_CANCELED_TX',
    'CALL_WALLET_FAILED',
    'SEND_TX_FAILED',
    'CALL_OR_SEND_FAILED',
    'TX_FAILED_IN_BLOCKCHAIN',
    'CLIENT_UNEXPECTED_BEHAVIOUR',
    'INSUFFICIENT_APPROVE',
  ].includes(value)
}

/**
 * ReportTransactionRequest
 *
 * It should be used when an error happened in client and we want to inform server that transaction failed,
 * E.g. user rejected the transaction dialog or and an RPC error raised during signing tx by user.
 */
export type ReportTransactionRequest = {
  /** The requestId from best route endpoint */
  requestId: string
  /** Type of the event that happened, example: USER_REJECT */
  eventType: APIErrorCode
  /** Step number in which failure happened */
  step?: number
  /** Reason or message for the error */
  reason?: string
  /** @deprecated A list of key-value for extra details */
  data?: { [key: string]: string }
  /** A list of key-value for pre-defined tags */
  tags?: { wallet?: string; errorCode?: string }
}

/** The status of transaction in tracking */
export enum TransactionStatus {
  FAILED = 'failed',
  RUNNING = 'running',
  SUCCESS = 'success',
}

/**
 * Response body of check-approval
 * You could stop check approval if:
 *  1- approved successfully
 *  => isApproved = true
 *  2- approval transaction failed
 *  => isApproved = false && txStatus === 'failed'
 *  3- approval transaction succeeded but currentApprovedAmount is still less than requiredApprovedAmount
 *  (e.g. user changed transaction data and enter another approve amount in MetaMask)
 *  => isApproved = false && txStatus == 'success'
 */
export type CheckApprovalResponse = {
  /** A flag which indicates that the approve tx is done or not */
  isApproved: boolean
  /**
   * Status of approve transaction in blockchain,
   * if isArppoved is false and txStatus is failed, it seems that approve transaction failed in blockchain
   */
  txStatus: TransactionStatus | null
  /** required amount to be approved by user */
  requiredApprovedAmount: string | null
  /** current approved amount by user */
  currentApprovedAmount: string | null
}
