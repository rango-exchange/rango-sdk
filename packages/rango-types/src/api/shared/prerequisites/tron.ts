import { BaseTransactionPrerequisite } from './base.js'
import { TRON_APPROVE_TYPE } from './constants.js'

/**
 *  Tron Approve Prerequisite Type
 *
 */
export interface TronApprovePrerequisite extends BaseTransactionPrerequisite {
  /** equals to "TRON_APPROVE" **/
  type: typeof TRON_APPROVE_TYPE
  /** equals to "TRON" **/
  blockChain: string
  /** User's wallet address which must approve the token (0x-hex form) **/
  wallet: string
  /** The TRC-20 token contract address that must be approved (0x-hex form) **/
  token: string
  /** The contract address which will be allowed to spend the token (0x-hex form) **/
  spender: string
  /** The minimum required allowance, as an integer string in the token's smallest unit **/
  amount: string
}

export const isTronApprovePrerequisite = (
  prerequisite: BaseTransactionPrerequisite,
): prerequisite is TronApprovePrerequisite =>
  prerequisite.type === TRON_APPROVE_TYPE
