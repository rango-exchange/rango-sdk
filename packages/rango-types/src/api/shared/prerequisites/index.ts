import { EvmApprovePrerequisite } from './evm.js'
import { StellarChangeTrustLinePrerequisite } from './stellar.js'
import { TronApprovePrerequisite } from './tron.js'
import { XrplChangeTrustLinePrerequisite } from './xrpl.js'

export type TransactionPrerequisiteType =
  | StellarChangeTrustLinePrerequisite['type']
  | XrplChangeTrustLinePrerequisite['type']
  | EvmApprovePrerequisite['type']
  | TronApprovePrerequisite['type']

export type TransactionPrerequisite =
  | XrplChangeTrustLinePrerequisite
  | StellarChangeTrustLinePrerequisite
  | EvmApprovePrerequisite
  | TronApprovePrerequisite

export {
  XrplChangeTrustLinePrerequisite,
  isXrplChangeTrustLinePrerequisite,
} from './xrpl.js'
export {
  StellarChangeTrustLinePrerequisite,
  isStellarChangeTrustLinePrerequisite,
} from './stellar.js'
export { EvmApprovePrerequisite, isEvmApprovePrerequisite } from './evm.js'
export { TronApprovePrerequisite, isTronApprovePrerequisite } from './tron.js'

export {
  XRPL_CHANGE_TRUSTLINE_TYPE,
  STELLAR_CHANGE_TRUSTLINE_TYPE,
  EVM_APPROVE_TYPE,
  TRON_APPROVE_TYPE,
} from './constants.js'
