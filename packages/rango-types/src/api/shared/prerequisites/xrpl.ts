import { BaseTransactionPrerequisite } from './base.js'
import { XRPL_CHANGE_TRUSTLINE_TYPE } from './constants.js'

/**
 *  Xrpl Prerequisite Type
 *
 */
export interface XrplChangeTrustLinePrerequisite
  extends BaseTransactionPrerequisite {
  /** equals to "XRPL_CHANGE_TRUSTLINE" **/
  type: typeof XRPL_CHANGE_TRUSTLINE_TYPE
  /** equals to "XRPL" **/
  blockChain: 'XRPL'
  /** Xrpl Currency **/
  currency: string
  /** Xrpl Asset Issuer **/
  issuer: string
  /** The minimum amount of required trustline for the Xrpl asset **/
  value: string
  /** User's wallet address which must have this trustline allowed for the Xrpl asset **/
  wallet: string
}

export const isXrplChangeTrustLinePrerequisite = (
  prerequisite: BaseTransactionPrerequisite
): prerequisite is XrplChangeTrustLinePrerequisite =>
  prerequisite.type === XRPL_CHANGE_TRUSTLINE_TYPE
