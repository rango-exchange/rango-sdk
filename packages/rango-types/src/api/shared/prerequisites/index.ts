import { StellarChangeTrustLinePrerequisite } from './stellar.js'
import { XrplChangeTrustLinePrerequisite } from './xrpl.js'

export type TransactionPrerequisiteType =
  | StellarChangeTrustLinePrerequisite['type']
  | XrplChangeTrustLinePrerequisite['type']

export type TransactionPrerequisite =
  | XrplChangeTrustLinePrerequisite
  | StellarChangeTrustLinePrerequisite

export {
  XrplChangeTrustLinePrerequisite,
  isXrplChangeTrustLinePrerequisite,
} from './xrpl.js'
export {
  StellarChangeTrustLinePrerequisite,
  isStellarChangeTrustLinePrerequisite,
} from './stellar.js'

export {
  XRPL_CHANGE_TRUSTLINE_TYPE,
  STELLAR_CHANGE_TRUSTLINE_TYPE,
} from './constants.js'
