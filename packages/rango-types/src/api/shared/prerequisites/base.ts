import {
  StellarChangeTrustLinePrerequisite,
  StellarChangeTrustLinePrerequisiteResult,
} from './stellar.js'
import {
  XrplChangeTrustLinePrerequisite,
  XrplChangeTrustLinePrerequisiteResult,
} from './xrpl.js'

export type TransactionPrerequisiteType =
  | 'STELLAR_CHANGE_TRUSTLINE'
  | 'XRPL_CHANGE_TRUSTLINE'

export interface BaseTransactionPrerequisite {
  type: TransactionPrerequisiteType
  blockChain: string
}

export type TransactionPrerequisite =
  | XrplChangeTrustLinePrerequisite
  | StellarChangeTrustLinePrerequisite

export interface BaseTransactionPrerequisiteResult {
  prerequisiteIndex: number
  prerequisiteType: TransactionPrerequisiteType
  status: 'success' | 'failed' | 'pending'
}

export type TransactionPrerequisiteResult =
  | StellarChangeTrustLinePrerequisiteResult
  | XrplChangeTrustLinePrerequisiteResult
