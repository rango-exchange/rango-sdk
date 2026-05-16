import { BaseTransactionPrerequisite } from './base.js'
import { STELLAR_CHANGE_TRUSTLINE_TYPE } from './constants.js'

/**
 *  Stellar Prerequisite Type
 *
 */
export interface StellarChangeTrustLinePrerequisite
  extends BaseTransactionPrerequisite {
  /** Stellar change trustline type. */
  type: typeof STELLAR_CHANGE_TRUSTLINE_TYPE
  /** BlockChain equals to STELLAR. */
  blockChain: 'STELLAR'
  /** Stellar asset code (e.g. USDC). */
  code: string
  /** Stellar asset issuer (e.g.: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN). */
  issuer: string
  /** The minimum amount of required trustline for this stellar asset, such as 11.50. */
  value: string
  /** User's wallet address which must have this trustline allowed for the stellar asset. */
  wallet: string
}

export const isStellarChangeTrustLinePrerequisite = (
  prerequisite: BaseTransactionPrerequisite
): prerequisite is StellarChangeTrustLinePrerequisite =>
  prerequisite.type === STELLAR_CHANGE_TRUSTLINE_TYPE
