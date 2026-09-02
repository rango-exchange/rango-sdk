import {
  EVM_APPROVE_TYPE,
  STELLAR_CHANGE_TRUSTLINE_TYPE,
  TRON_APPROVE_TYPE,
  XRPL_CHANGE_TRUSTLINE_TYPE,
  TransactionPrerequisiteType,
} from '../api/shared/prerequisites/index.js'

// Base Transaction Prerequisite Result
interface BaseTransactionPrerequisiteResult {
  prerequisiteIndex: number
  prerequisiteType: TransactionPrerequisiteType
}

interface BaseExecutedTransactionPrerequisiteResult extends BaseTransactionPrerequisiteResult {
  status: 'success' | 'failed' | 'pending'
}

interface BaseSkippedTransactionPrerequisiteResult extends BaseTransactionPrerequisiteResult {
  status: 'skipped'
  data: null
}

// Stellar Change Trust Line Prerequisite Result

export type StellarChangeTrustLinePrerequisiteResultData = {
  executedTransactionHash: string
}

export interface StellarExecutedChangeTrustLinePrerequisiteResult extends BaseExecutedTransactionPrerequisiteResult {
  prerequisiteType: typeof STELLAR_CHANGE_TRUSTLINE_TYPE
  data: StellarChangeTrustLinePrerequisiteResultData
}

export interface StellarSkippedChangeTrustLinePrerequisiteResult extends BaseSkippedTransactionPrerequisiteResult {
  prerequisiteType: typeof STELLAR_CHANGE_TRUSTLINE_TYPE
}

export type StellarChangeTrustLinePrerequisiteResult =
  | StellarExecutedChangeTrustLinePrerequisiteResult
  | StellarSkippedChangeTrustLinePrerequisiteResult

export const isStellarChangeTrustLinePrerequisiteResult = (
  prerequisiteResult: BaseTransactionPrerequisiteResult,
): prerequisiteResult is StellarChangeTrustLinePrerequisiteResult =>
  prerequisiteResult.prerequisiteType === STELLAR_CHANGE_TRUSTLINE_TYPE

// Xrpl Change Trust Line Prerequisite Result

export type XrplChangeTrustLinePrerequisiteResultData = {
  executedTransactionHash: string
}
export interface XrplExecutedChangeTrustLinePrerequisiteResult extends BaseExecutedTransactionPrerequisiteResult {
  prerequisiteType: typeof XRPL_CHANGE_TRUSTLINE_TYPE
  data: XrplChangeTrustLinePrerequisiteResultData
}
export interface XrplSkippedChangeTrustLinePrerequisiteResult extends BaseSkippedTransactionPrerequisiteResult {
  prerequisiteType: typeof XRPL_CHANGE_TRUSTLINE_TYPE
}

export type XrplChangeTrustLinePrerequisiteResult =
  | XrplExecutedChangeTrustLinePrerequisiteResult
  | XrplSkippedChangeTrustLinePrerequisiteResult

export const isXrplChangeTrustLinePrerequisiteResult = (
  prerequisiteResult: BaseTransactionPrerequisiteResult,
): prerequisiteResult is XrplChangeTrustLinePrerequisiteResult =>
  prerequisiteResult.prerequisiteType === XRPL_CHANGE_TRUSTLINE_TYPE

// Evm Approve Prerequisite Result

export type EvmApprovePrerequisiteResultData = {
  executedTransactionHash: string
}

export interface EvmExecutedApprovePrerequisiteResult extends BaseExecutedTransactionPrerequisiteResult {
  prerequisiteType: typeof EVM_APPROVE_TYPE
  data: EvmApprovePrerequisiteResultData
}

export interface EvmSkippedApprovePrerequisiteResult extends BaseSkippedTransactionPrerequisiteResult {
  prerequisiteType: typeof EVM_APPROVE_TYPE
}

export type EvmApprovePrerequisiteResult =
  | EvmExecutedApprovePrerequisiteResult
  | EvmSkippedApprovePrerequisiteResult

export const isEvmApprovePrerequisiteResult = (
  prerequisiteResult: BaseTransactionPrerequisiteResult,
): prerequisiteResult is EvmApprovePrerequisiteResult =>
  prerequisiteResult.prerequisiteType === EVM_APPROVE_TYPE

// Tron Approve Prerequisite Result

export type TronApprovePrerequisiteResultData = {
  executedTransactionHash: string
}

export interface TronExecutedApprovePrerequisiteResult extends BaseExecutedTransactionPrerequisiteResult {
  prerequisiteType: typeof TRON_APPROVE_TYPE
  data: TronApprovePrerequisiteResultData
}

export interface TronSkippedApprovePrerequisiteResult extends BaseSkippedTransactionPrerequisiteResult {
  prerequisiteType: typeof TRON_APPROVE_TYPE
}

export type TronApprovePrerequisiteResult =
  | TronExecutedApprovePrerequisiteResult
  | TronSkippedApprovePrerequisiteResult

export const isTronApprovePrerequisiteResult = (
  prerequisiteResult: BaseTransactionPrerequisiteResult,
): prerequisiteResult is TronApprovePrerequisiteResult =>
  prerequisiteResult.prerequisiteType === TRON_APPROVE_TYPE

export type TransactionPrerequisiteResult =
  | StellarChangeTrustLinePrerequisiteResult
  | XrplChangeTrustLinePrerequisiteResult
  | EvmApprovePrerequisiteResult
  | TronApprovePrerequisiteResult
