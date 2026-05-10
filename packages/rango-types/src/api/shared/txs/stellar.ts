import {
  BaseTransaction as RangoBaseTransaction,
  TransactionType,
  BaseTransactionPrerequisite,
} from '../../shared/index.js'

/**
 *  Stellar Prerequisite Type
 *
 * @property {string} type equals to STELLAR_CHANGE_TRUSTLINE
 * @property {string} blockChain, equals to STELLAR
 * @property {string} code The stellar output asset code, such as USDC
 * @property {string} issuer The stellar asset issuer, e.g.: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 * @property {string} value The minimum amount of required trustline for this stellar asset, such as 11.50
 * @property {string} wallet User's wallet address which must have this trustline allowed for the stellar asset
 *
 */
export interface StellarChangeTrustLinePrerequisite
  extends BaseTransactionPrerequisite {
  type: 'STELLAR_CHANGE_TRUSTLINE'
  blockChain: 'STELLAR'
  code: string
  issuer: string
  value: string
  wallet: string
}

export interface StellarTransaction
  extends RangoBaseTransaction<StellarChangeTrustLinePrerequisite> {
  type: TransactionType.STELLAR
  xdrBase64: string
}

export const isStellarTransaction = (transaction: {
  type: TransactionType
}): transaction is StellarTransaction =>
  transaction.type === TransactionType.STELLAR
