import { BaseTransactionPrerequisite } from './base.js'
import { EVM_APPROVE_TYPE } from './constants.js'

/**
 *  EVM Approve Prerequisite Type
 *
 */
export interface EvmApprovePrerequisite extends BaseTransactionPrerequisite {
  /** equals to "EVM_APPROVE" **/
  type: typeof EVM_APPROVE_TYPE
  /** The EVM-based blockchain that the approval is required on, e.g. ARBITRUM **/
  blockChain: string
  /** User's wallet address which must approve the token **/
  wallet: string
  /** The ERC-20 token contract address that must be approved **/
  token: string
  /** The contract address which will be allowed to spend the token **/
  spender: string
  /** The minimum required allowance, as an integer string in the token's smallest unit **/
  amount: string
}

export const isEvmApprovePrerequisite = (
  prerequisite: BaseTransactionPrerequisite,
): prerequisite is EvmApprovePrerequisite =>
  prerequisite.type === EVM_APPROVE_TYPE
