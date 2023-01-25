export type APIErrorCode =
  | 'TX_FAIL'
  | 'USER_CANCEL'
  | 'FETCH_TX_FAILED'
  | 'USER_REJECT'
  | 'CALL_WALLET_FAILED'
  | 'SEND_TX_FAILED'
  | 'CALL_OR_SEND_FAILED'
  | 'CLIENT_UNEXPECTED_BEHAVIOUR'

/**
 * Data of the event including its type and an extra metadata
 * It should be used when an error happened in client and we want to inform server that transaction failed,
 * E.g. user rejected the transaction dialog or and an RPC error raised during signing tx by user.
 *
 * @property {string} requestId - The requestId from best route endpoint
 * @property {APIErrorCode} eventType - Type of the event that happened, example: TX_FAIL
 * @property {[key: string]: string} data - A list of key-value for extra details
 *
 */
export type ReportTransactionRequest = {
  requestId: string
  eventType: APIErrorCode
  step?: number
  reason?: string
  tags?: { wallet: string }
  data?: { [key: string]: string }
}
