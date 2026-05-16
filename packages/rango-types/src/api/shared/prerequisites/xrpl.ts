import {
  BaseTransactionPrerequisiteResult,
  BaseTransactionPrerequisite,
} from './base.js'

/**
 *  Xrpl Prerequisite Type
 *
 * @property {string} type equals to XRPL_CHANGE_TRUSTLINE
 * @property {string} blockChain, equals to XRPL
 * @property {string} currency The Xrpl currency
 * @property {string} issuer The Xrpl asset issuer
 * @property {string} value The minimum amount of required trustline for the Xrpl asset
 * @property {string} wallet User's wallet address which must have this trustline allowed for the Xrpl asset
 *
 */
export interface XrplChangeTrustLinePrerequisite
  extends BaseTransactionPrerequisite {
  type: 'XRPL_CHANGE_TRUSTLINE'
  blockChain: 'XRPL'
  /** Xrpl Currency **/
  currency: string
  /** Xrpl Asset Issuer **/
  issuer: string
  /** Minimum expected value of trust **/
  value: string
  /** User's wallet address **/
  wallet: string
}

export const isXrplChangeTrustLinePrerequisite = (
  prerequisite: BaseTransactionPrerequisite
): prerequisite is XrplChangeTrustLinePrerequisite =>
  prerequisite.type === 'XRPL_CHANGE_TRUSTLINE'

export type XrplChangeTrustLinePrerequisiteResultData = {
  executedTransactionHash: string
}
export interface XrplChangeTrustLinePrerequisiteResult
  extends BaseTransactionPrerequisiteResult {
  prerequisiteType: 'XRPL_CHANGE_TRUSTLINE'
  data: XrplChangeTrustLinePrerequisiteResultData
}

export const isXrplChangeTrustLinePrerequisiteResult = (
  prerequisiteResult: BaseTransactionPrerequisiteResult
): prerequisiteResult is XrplChangeTrustLinePrerequisiteResult =>
  prerequisiteResult.prerequisiteType === 'XRPL_CHANGE_TRUSTLINE'
