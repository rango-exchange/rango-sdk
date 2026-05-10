import { BaseTransaction, TransactionType } from '../../shared/index.js'

/**
 * The transaction object for all EVM-based blockchains, including Ethereum, BSC, Polygon, Harmony, etc
 *
 * @property {TransactionType} type - This fields equals to EVM for all EvmTransactions
 * @property {string} blockChain - The blockchain that this transaction is going to run in
 * @property {boolean} isApprovalTx - Determines that this transaction is an approval transaction or not, if true user
 * should approve the transaction and call create transaction endpoint again to get the original tx. Beware that most
 * of the fields of this object will be passed directly to the wallet without any change.
 * @property {string | null} from - The source wallet address, it can be null
 * @property {string} to - Address of destination wallet or the smart contract or token that is going to be called
 * @property {string | null} data - The data of smart contract call, it can be null in case of native token transfer
 * @property {string | null} value - The amount of transaction in case of native token transfer
 * @property {string | null} nonce - The nonce value for transaction
 * @property {string | null} gasPrice - The suggested gas price for this transaction
 * @property {string | null} gasLimit - The suggested gas limit for this transaction
 * @property {string | null} maxPriorityFeePerGas - Suggested max priority fee per gas for this transaction
 * @property {string | null} maxFeePerGas - Suggested max fee per gas for this transaction
 *
 */
export interface EvmTransaction extends BaseTransaction {
  type: TransactionType.EVM
  isApprovalTx: boolean
  from: string | null
  to: string
  data: string | null
  value: string | null
  nonce: string | null
  gasLimit: string | null
  gasPrice: string | null
  maxPriorityFeePerGas: string | null
  maxFeePerGas: string | null
}

export const isEvmTransaction = (transaction: {
  type: TransactionType
}): transaction is EvmTransaction => transaction.type === TransactionType.EVM
