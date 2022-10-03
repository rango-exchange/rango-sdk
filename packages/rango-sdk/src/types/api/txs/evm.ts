import { TransactionType } from 'common'

/**
 * The transaction object for all EVM-based blockchains, including Ethereum, BSC, Polygon, Harmony, etc
 *
 * @property {boolean} isApprovalTx - Determines that this transaction is an approval transaction or not, if true user
 * should approve the transaction and call create transaction endpoint again to get the original tx. Beware that most
 * of the fields of this object will be passed directly to the wallet without any change.
 * @property {string} blockChain - The blockchain that this transaction is going to run in
 * @property {string | null} from - The source wallet address, it can be null
 * @property {string} to - Address of destination wallet or the smart contract or token that is going to be called
 * @property {string | null} data - The data of smart contract call, it can be null in case of native token transfer
 * @property {string | null} value - The amount of transaction in case of native token transfer
 * @property {string | null} nonce - The nonce value for transaction
 * @property {string | null} gasPrice - The suggested gas price for this transaction
 * @property {string | null} gasLimit - The suggested gas limit for this transaction
 *
 */
export interface EvmTransaction {
  type: TransactionType
  isApprovalTx: boolean
  blockChain: string
  from: string | null
  to: string
  data: string | null
  value: string | null
  nonce: string | null
  gasLimit: string | null
  gasPrice: string | null
}
