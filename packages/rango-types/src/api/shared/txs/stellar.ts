import {
  BaseTransaction as RangoBaseTransaction,
  TransactionType,
} from '../../shared/index.js'

/** The data object for Stellar transaction. */
export interface StellarTransactionData {
  /** Recommended base fee (in stroops) for building the stellar transaction. */
  baseFee: string | null
  /** CAP-21 PreconditionsV2 of transaction. */
  preconditions: {
    /** Time bounds of stellar transaction data. */
    timeBounds: {
      /** Unix timestamped constraint for minimum time of transaction validity. */
      minTime: number
      /** Unix timestamped constraint for maximum time of transaction validity. */
      maxTime: number
    }
    /**
     * Ledger bounds of stellar transaction data. Transaction only valid for ledger
     * numbers n such that minLedger <= n < maxLedger.
     */
    ledgerBounds: {
      /** Minimum ledger for transaction validity. */
      minLedger: number
      /** Maximum ledger for transaction validity; 0 means no maxLedger. */
      maxLedger: number
    }
    /**
     * If NULL, only valid when sourceAccount's sequence number is seqNum - 1.
     * Otherwise, valid when sourceAccount's sequence number n satisfies
     * minSeqNum <= n < tx.seqNum.
     */
    minSeqNumber: string | null
    /**
     * For the transaction to be valid, the current ledger time must be at least
     * minSeqAge greater than sourceAccount's seqTime.
     */
    minSeqAge: number | null
    /**
     * For the transaction to be valid, the current ledger number must be at least
     * minSeqLedgerGap greater than sourceAccount's seqLedger.
     */
    minSeqLedgerGap: number | null
    /**
     * For the transaction to be valid, there must be a signature corresponding to
     * every Signer in this array.
     */
    extraSigners: string[] | null
  }
  /** List of operations as base 64 encoded strings. */
  operationsXdrBase64: string[]
  /** Base 64 encoded memo of transaction. */
  memoXdrBase64: string | null
}

/** The transaction object for Stellar transaction. */
export interface StellarTransaction extends RangoBaseTransaction {
  /** TransactionType.STELLAR */
  type: TransactionType.STELLAR
  /** The data of the Stellar transaction. */
  data: StellarTransactionData
}

export const isStellarTransaction = (transaction: {
  type: TransactionType
}): transaction is StellarTransaction =>
  transaction.type === TransactionType.STELLAR
