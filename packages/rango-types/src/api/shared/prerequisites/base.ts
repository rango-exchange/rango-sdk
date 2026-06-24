import { StellarChangeTrustLinePrerequisite } from './stellar.js'
import { XrplChangeTrustLinePrerequisite } from './xrpl.js'

export type TransactionPrerequisiteType =
  | StellarChangeTrustLinePrerequisite['type']
  | XrplChangeTrustLinePrerequisite['type']
export interface BaseTransactionPrerequisite {
  type: TransactionPrerequisiteType
  blockChain: string
}
