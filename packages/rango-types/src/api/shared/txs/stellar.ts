import {
  BaseTransaction as RangoBaseTransaction,
  TransactionType,
} from '../../shared/index.js'

/**
 * The data object for Stellar transaction
 *
 * @property {string | null} baseFee - Recommended base fee (in stroops) for building the stellar transaction
 * @property {object} preconditions - CAP-21 PreconditionsV2 of transaction transaction
 * @property {object} timeBounds - time bounds of stellar transaction data
 * @property {number} minTime - Unix timestamped constraint for minimum time of transaction validity
 * @property {number} maxTime - Unix timestamped constraint for maximum time of transaction validity
 * @property {object} ledgerBounds - ledger bounds of stellar transaction data, Transaction only valid for ledger numbers n such that minLedger <= n < maxLedger
 * @property {number} minLedger - Minimum ledger for transaction validity
 * @property {number} maxLedger - Maximum ledger for transaction validity, 0 here means no maxLedger
 * @property {string | null} minSeqNumber - If NULL, only valid when sourceAccount's sequence number is seqNum - 1.  Otherwise, valid when sourceAccount's sequence number n satisfies minSeqNum <= n < tx.seqNum
 * @property {number | null} minSeqAge - For the transaction to be valid, the current ledger time must be at least minSeqAge greater than sourceAccount's seqTime
 * @property {number | null} minSeqLedgerGap - For the transaction to be valid, the current ledger number must be at least minSeqLedgerGap greater than sourceAccount's seqLedger
 * @property {string[] | null} extraSigners - list of strings, For the transaction to be valid, there must be a signature corresponding to every Signer in this array
 * @property {string[]} operationsXdrBase64 - list of operations as base 64 encoded strings
 * @property {string | null} memoXdrBase64 - base 64 encoded memo of transaction
 */
export interface StellarTransactionData {
  baseFee: string | null
  preconditions: {
    timeBounds: {
      minTime: number
      maxTime: number
    }
    ledgerBounds: {
      minLedger: number
      maxLedger: number
    }
    minSeqNumber: string | null
    minSeqAge: number | null
    minSeqLedgerGap: number | null
    extraSigners: string[] | null
  }
  operationsXdrBase64: string[]
  memoXdrBase64: string | null
}

/**
 * The transaction object for Stellar transaction
 *
 * @property {TransactionType} type - TransactionType.STELLAR
 * @property {StellarTransactionData} data - The data of the Stellar transaction
 */
export interface StellarTransaction extends RangoBaseTransaction {
  type: TransactionType.STELLAR
  data: StellarTransactionData
}

export const isStellarTransaction = (transaction: {
  type: TransactionType
}): transaction is StellarTransaction =>
  transaction.type === TransactionType.STELLAR
