import { BlockchainMetaBase } from '../meta.js'
import { TransactionType } from '../transactions.js'



/**
 * Blockchain info for basic API EVM transaction
 */
export type EvmTransactionBlockchain = Pick<
  BlockchainMetaBase, 'name' | 'defaultDecimals' | 'addressPatterns' | 'feeAssets' | 'type' | 'chainId'
>

/**
 * The transaction object for all EVM-based blockchains, including Ethereum, BSC, Polygon, Harmony, etc
 *
 * @property {TransactionType} type - This fields equals to EVM for all EVMTransactions
 * @property {EvmTransactionBlockchain} blockChain - The blockchain info that this transaction is going to run in
 * @property {string | null} from - The source wallet address, it can be null
 * @property {string} approveTo - Address of source token erc20 contract for increasing approve amount
 * @property {string | null} approveData - The data of approve transaction
 * @property {string} txTo - Address of dex/bridge smart contract that is going to be called
 * @property {string | null} txData - The data of main transaction, it can be null in case of native token transfer
 * @property {string | null} value - The amount of transaction in case of native token transfer
 * @property {string | null} gasPrice - The suggested gas price for this transaction
 * @property {string | null} gasLimit - The suggested gas limit for this transaction
 * @property {string | null} maxPriorityFeePerGas - Suggested max priority fee per gas for this transaction
 * @property {string | null} maxFeePerGas - Suggested max fee per gas for this transaction
 *
 */
export interface EvmTransaction {
  type: TransactionType.EVM
  blockChain: EvmTransactionBlockchain
  from: string | null
  approveTo: string | null
  approveData: string | null
  txTo: string
  txData: string | null
  value: string | null
  gasLimit: string | null
  gasPrice: string | null
  maxPriorityFeePerGas: string | null
  maxFeePerGas: string | null
}

export const isEvmTransaction = (transaction: {
  type: TransactionType
}): transaction is EvmTransaction => transaction.type === TransactionType.EVM
