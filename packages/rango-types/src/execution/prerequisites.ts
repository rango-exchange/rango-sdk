import {
  STELLAR_CHANGE_TRUSTLINE_TYPE,
  XRPL_CHANGE_TRUSTLINE_TYPE,
  TransactionPrerequisiteType,
} from '../api/shared/prerequisites/index.js'

interface BaseTransactionPrerequisiteResult {
  prerequisiteIndex: number
  prerequisiteType: TransactionPrerequisiteType
  status: 'success' | 'failed' | 'pending'
}

export type StellarChangeTrustLinePrerequisiteResultData = {
  executedTransactionHash: string
}

export interface StellarChangeTrustLinePrerequisiteResult
  extends BaseTransactionPrerequisiteResult {
  prerequisiteType: typeof STELLAR_CHANGE_TRUSTLINE_TYPE
  data: StellarChangeTrustLinePrerequisiteResultData
}

export const isStellarChangeTrustLinePrerequisiteResult = (
  prerequisiteResult: BaseTransactionPrerequisiteResult
): prerequisiteResult is StellarChangeTrustLinePrerequisiteResult =>
  prerequisiteResult.prerequisiteType === STELLAR_CHANGE_TRUSTLINE_TYPE

export type XrplChangeTrustLinePrerequisiteResultData = {
  executedTransactionHash: string
}
export interface XrplChangeTrustLinePrerequisiteResult
  extends BaseTransactionPrerequisiteResult {
  prerequisiteType: typeof XRPL_CHANGE_TRUSTLINE_TYPE
  data: XrplChangeTrustLinePrerequisiteResultData
}

export const isXrplChangeTrustLinePrerequisiteResult = (
  prerequisiteResult: BaseTransactionPrerequisiteResult
): prerequisiteResult is XrplChangeTrustLinePrerequisiteResult =>
  prerequisiteResult.prerequisiteType === XRPL_CHANGE_TRUSTLINE_TYPE

export type TransactionPrerequisiteResult =
  | StellarChangeTrustLinePrerequisiteResult
  | XrplChangeTrustLinePrerequisiteResult
