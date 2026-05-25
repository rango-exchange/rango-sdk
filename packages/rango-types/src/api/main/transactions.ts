import {
  TransactionType,
  GenericTransactionType,
  SwapExplorerUrl,
  ReportTransactionRequest,
  TransactionStatus,
  CheckApprovalResponse,
  CosmosTransaction,
  Transfer,
  SolanaTransaction,
  TronTransaction,
  TonTransaction,
} from '../shared/index.js'
import { Token } from './meta.js'
import {
  EvmTransaction,
  SuiTransaction,
  XrplTransaction,
  StellarTransaction,
  StarknetTransaction,
  HyperliquidTransaction,
} from './txs/index.js'

export {
  TransactionType,
  GenericTransactionType,
  SwapExplorerUrl,
  SuiTransaction,
  XrplTransaction,
  HyperliquidTransaction,
  StellarTransaction,
  ReportTransactionRequest,
  TransactionStatus,
  CheckApprovalResponse,
}

/**
 * @deprecated use Transaction type instead
 * Parent model for all types of transactions
 * Check EvmTransaction, TransferTransaction and CosmosTransaction models for more details
 */
export type GenericTransaction = {
  type: TransactionType
}

/** Data of referral rewards of a transaction */
export type TransactionStatusReferral = {
  /** The blockchain that reward is generated in, example: BSC */
  blockChain: string
  /** The smart contract address of rewarded asset, null for native assets */
  address: string | null
  /** The symbol of the asset that is rewarded, example: ADA */
  symbol: string
  /** The decimals of the rewarded asset, example: 18 */
  decimals: number
  /** The machine-readable amount of the reward, example: 1000000000000000000 */
  amount: string
}

/** Settings of user for swaps */
export type UserSettings = {
  /** Amount of users' preferred slippage in percent */
  slippage: string
  /** Infinite approval settings, default is false */
  infiniteApprove?: boolean
}

/** List of validations that Rango should do */
export type CreateTransactionValidation = {
  /** If true [Recommended], Rango will check that user has the required balance for swap */
  balance: boolean
  /** If true [Recommended], Rango will check that user has the required fees in the wallet */
  fee: boolean
  /** If false, Rango will skip creating approve transactions for each step. */
  approve: boolean
}

/** Request body of check tx status */
export type CheckTxStatusRequest = {
  /** The unique ID which is generated in the best route endpoint */
  requestId: string
  /** 1-based step number of a complex multi-step swap, example: 1, 2, ... */
  step: number
  /** Tx hash that wallet returned, example: 0xa1a37ce2063c4764da27d990a22a0c89ed8ac585286a77a... */
  txId: string
}

/** Request body of createTransaction endpoint */
export type CreateTransactionRequest = {
  /** The unique ID which is generated in the best route endpoint */
  requestId: string
  /** 1-based step number of a complex multi-step swap, example: 1, 2, ... */
  step: number
  /** user settings for the swap */
  userSettings: UserSettings
  /** the validation checks we are interested to check by Rango before starting the swap */
  validations: CreateTransactionValidation
}

/** The swapper details for a transaction step */
export type SwapperStatusStep = {
  name: string
  state: 'PENDING' | 'CREATED' | 'WAITING' | 'SIGNED' | 'SUCCESSED' | 'FAILED'
  current: boolean
}

/** Type of the transaction */
export type Transaction =
  | EvmTransaction
  | CosmosTransaction
  | SolanaTransaction
  | TronTransaction
  | StarknetTransaction
  | TonTransaction
  | SuiTransaction
  | XrplTransaction
  | StellarTransaction
  | HyperliquidTransaction
  | Transfer

/** Extra data about executed transaction */
export type BridgeExtra = {
  /**
   * Indicates whether the user must take any action to recover their assets from the underlying protocol.
   * While this situation is uncommon, there are rare cases where user assets may become stuck in the underlying protocol.
   * In such cases, manual intervention may be required to identify the user and process the refund.
   */
  requireRefundAction: boolean
  /** Inbound transaction hash */
  srcTx: string | null
  /** Outbound transaction hash in case of cross chain transaction */
  destTx: string | null
}

/** Response of check transaction status containing the latest status of transaction */
export type TransactionStatusResponse = {
  /**
   * Status of the transaction, while the status is running or null, the
   * client should retry until it turns into success or failed
   */
  status: TransactionStatus | null
  /**
   * The timestamp of the executed transaction. Beware that timestamp can be null even if
   * the status is successful or failed, example: 1635271424813
   */
  timestamp: number | null
  /** A message in case of failure, that could be shown to the user */
  extraMessage: string | null
  /** The output amount of the transaction if it was successful, exmaple: 0.28 */
  outputAmount: string | null
  /** The output token, it could be the desired token or the refunded token */
  outputToken: Token | null
  /** Type of output token */
  outputType:
    | null
    | 'REVERTED_TO_INPUT'
    | 'MIDDLE_ASSET_IN_SRC'
    | 'MIDDLE_ASSET_IN_DEST'
    | 'DESIRED_OUTPUT'
  /**
   * if a transaction needs more than one-step transaction to be signed by
   * the user, the next step transaction will be returned in this field.
   */
  newTx: Transaction | null
  /**
   * In some special cases [e.g. AnySwap], the user should follow some steps
   * outside Rango to get its assets back (refund). You can show this link to the user to help him
   */
  diagnosisUrl: string | null
  /** List of explorer URLs for the transactions that happened in this step. */
  explorerUrl: SwapExplorerUrl[] | null
  /** List of referral reward for the dApp and Rango */
  referrals: TransactionStatusReferral[] | null
  /** Internal steps details of a route step, used for solana */
  steps: SwapperStatusStep[] | null
  /** Extra data about executed transaction */
  bridgeExtra: BridgeExtra | null
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}

/**
 * Response body of create transaction, to see a list of example transactions
 * @see https://rango.exchange/apis/docs/tx-example
 */
export type CreateTransactionResponse = {
  /** Error message about the incident if ok == false */
  error: string | null
  /** If true, Rango has created a non-null transaction and the error message is null */
  ok: boolean
  /** Transaction data */
  transaction: Transaction | null
}
