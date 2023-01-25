import {
  TransactionStatus,
  SwapExplorerUrl,
  CosmosTransaction,
  SolanaTransaction,
  Transfer,
} from 'common'
import { EvmTransaction } from './txs'

/**
 * Data of referral rewards of a transaction
 *
 * @property {string} blockChain - The blockchain that reward is generated in, example: BSC
 * @property {string | null} address - The smart contract address of rewarded asset, null for native assets
 * @property {string} symbol - The symbol of the asset that is rewarded, example: ADA
 * @property {number} decimals - The decimals of the rewarded asset, example: 18
 * @property {string} amount - The machine-readable amount of the reward, example: 1000000000000000000
 *
 */
export type TransactionStatusReferral = {
  blockChain: string
  address: string | null
  symbol: string
  decimals: number
  amount: string
}

/**
 * Settings of user for swaps
 *
 * @property {string} slippage - Amount of users' preferred slippage in percent
 *
 */
export type UserSettings = {
  slippage: string
}

/**
 * List of validations that Rango should do
 *
 * @property {boolean} balance - If true [Recommended], Rango will check that user has the required balance for swap
 * @property {boolean} fee - If true [Recommended], Rango will check that user has the required fees in the wallet
 *
 */
export type CreateTransactionValidation = {
  balance: boolean
  fee: boolean
}

/**
 * Request body of check tx status
 *
 * @property {string} requestId - The unique ID which is generated in the best route endpoint
 * @property {number} step - 1-based step number of a complex multi-step swap, example: 1, 2, ...
 * @property {number} txId - Tx hash that wallet returned, example: 0xa1a37ce2063c4764da27d990a22a0c89ed8ac585286a77a...
 *
 */
export type CheckTxStatusRequest = {
  requestId: string
  step: number
  txId: string
}

/**
 * Request body of createTransaction endpoint
 *
 * @property {string} requestId - The unique ID which is generated in the best route endpoint
 * @property {number} step - 1-based step number of a complex multi-step swap, example: 1, 2, ...
 * @property {UserSettings} userSettings - user settings for the swap
 * @property {CreateTransactionValidation} validations - the validation checks we are interested to check by Rango
 * before starting the swap
 *
 */
export type CreateTransactionRequest = {
  requestId: string
  step: number
  userSettings: UserSettings
  validations: CreateTransactionValidation
}

/**
 * The swapper details for a transaction step
 */
export type SwapperStatusStep = {
  name: string
  state: 'PENDING' | 'CREATED' | 'WAITING' | 'SIGNED' | 'SUCCESSED' | 'FAILED'
  current: boolean
}

/**
 * Response of check transaction status containing the latest status of transaction
 *
 * @property {TransactionStatus | null} status - Status of the transaction, while the status is running or null, the
 * client should retry until it turns into success or failed
 * @property {number} timestamp - The timestamp of the executed transaction. Beware that timestamp can be null even if
 * the status is successful or failed, example: 1635271424813
 * @property {string | null} extraMessage - A message in case of failure, that could be shown to the user
 * @property {string | null} outputAmount - The output amount of the transaction if it was successful, exmaple: 0.28
 * @property {EvmTransaction | CosmosTransaction | Transfer | SolanaTransaction | null} newTx - if a transaction needs
 * more than one-step transaction to be signed by the user, the next step transaction will be returned in this field.
 * @property {string | null} diagnosisUrl - In some special cases [e.g. AnySwap], the user should follow some steps
 * outside Rango to get its assets back (refund). You can show this link to the user to help him
 * @property {SwapExplorerUrl[] | null} explorerUrl - List of explorer URLs for the transactions that happened in
 * this step.
 * @property {TransactionStatusReferral[] | null} referrals - List of referral reward for the dApp and Rango
 * @property {SwapperStatusStep[] | null} steps - Internal steps details of a route step, used for solana
 *
 */
export type TransactionStatusResponse = {
  status: TransactionStatus | null
  timestamp: number | null
  extraMessage: string | null
  outputAmount: string | null
  // TODO
  newTx:
    | EvmTransaction
    | CosmosTransaction
    | Transfer
    | SolanaTransaction
    | null
  diagnosisUrl: string | null
  explorerUrl: SwapExplorerUrl[] | null
  referrals: TransactionStatusReferral[] | null
  steps: SwapperStatusStep[] | null
}

/**
 * Response body of check-approval
 *
 * @property {boolean} isApproved - A flag which indicates that the approve tx is done or not
 *
 */
// TODO UPDATED
export type CheckApprovalResponse = {
  isApproved: boolean
}

/**
 * Response body of create transaction, to see a list of example transactions
 * @see https://rango.exchange/apis/docs/tx-example
 *
 * @property {string | null} error - Error message about the incident if ok == false
 * @property {boolean} ok - If true, Rango has created a non-null transaction and the error message is null
 * @property {EvmTransaction | CosmosTransaction | Transfer | SolanaTransaction | null} transaction - Transaction's raw data
 *
 */
// TODO ADD STARKNET TRON
export type CreateTransactionResponse = {
  error: string | null
  ok: boolean
  transaction:
    | EvmTransaction
    | CosmosTransaction
    | Transfer
    | SolanaTransaction
    | null
}
