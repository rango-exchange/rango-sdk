import { BlockchainMetaBase } from '../meta.js'
import { TransactionType } from '../transactions.js'

/** Blockchain info for basic API EVM transaction */
export type EvmTransactionBlockchain = Pick<
  BlockchainMetaBase,
  | 'name'
  | 'defaultDecimals'
  | 'addressPatterns'
  | 'feeAssets'
  | 'type'
  | 'chainId'
>

/** The transaction object for all EVM-based blockchains, including Ethereum, BSC, Polygon, Harmony, etc */
export interface EvmTransaction {
  /** This fields equals to EVM for all EVMTransactions */
  type: TransactionType.EVM
  /** The blockchain info that this transaction is going to run in */
  blockChain: EvmTransactionBlockchain
  /** The source wallet address, it can be null */
  from: string | null
  /** Address of source token erc20 contract for increasing approve amount */
  approveTo: string | null
  /** The data of approve transaction */
  approveData: string | null
  /** Address of dex/bridge smart contract that is going to be called */
  txTo: string
  /** The data of main transaction, it can be null in case of native token transfer */
  txData: string | null
  /** The amount of transaction in case of native token transfer */
  value: string | null
  /** The suggested gas limit for this transaction */
  gasLimit: string | null
  /** The suggested gas price for this transaction */
  gasPrice: string | null
  /** Suggested max priority fee per gas for this transaction */
  maxPriorityFeePerGas: string | null
  /** Suggested max fee per gas for this transaction */
  maxFeePerGas: string | null
}

export const isEvmTransaction = (transaction: {
  type: TransactionType
}): transaction is EvmTransaction => transaction.type === TransactionType.EVM
