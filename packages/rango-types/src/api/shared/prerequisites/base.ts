import { EvmApprovePrerequisite } from './evm.js'
import { StellarChangeTrustLinePrerequisite } from './stellar.js'
import { TronApprovePrerequisite } from './tron.js'
import { XrplChangeTrustLinePrerequisite } from './xrpl.js'

export type TransactionPrerequisiteType =
  | StellarChangeTrustLinePrerequisite['type']
  | XrplChangeTrustLinePrerequisite['type']
  | EvmApprovePrerequisite['type']
  | TronApprovePrerequisite['type']
export interface BaseTransactionPrerequisite {
  type: TransactionPrerequisiteType
  blockChain: string
}
