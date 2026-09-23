import { BaseTransaction, TransactionType } from '../../shared/index.js'

/** The transaction object for all EVM-based blockchains, including Ethereum, BSC, Polygon, Harmony, etc */
export interface EvmTransaction extends BaseTransaction {
  /** This fields equals to EVM for all EvmTransactions */
  type: TransactionType.EVM
  /**
   * Determines that this transaction is an approval transaction or not, if true user
   * should approve the transaction and call create transaction endpoint again to get the original tx. Beware that most
   * of the fields of this object will be passed directly to the wallet without any change.
   */
  isApprovalTx: boolean
  /** The source wallet address, it can be null */
  from: string | null
  /** Address of destination wallet or the smart contract or token that is going to be called */
  to: string
  /** The data of smart contract call, it can be null in case of native token transfer */
  data: string | null
  /** The amount of transaction in case of native token transfer */
  value: string | null
  /** The nonce value for transaction */
  nonce: string | null
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
