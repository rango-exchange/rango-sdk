import {
  BaseTransaction as RangoBaseTransaction,
  TransactionType,
} from '../../shared/index.js'

export interface XrplTransaction extends RangoBaseTransaction {
  type: TransactionType.XRPL
  data: Payment | TrustSet
}

export const isXrplTransaction = (transaction: {
  type: TransactionType
}): transaction is XrplTransaction => transaction.type === TransactionType.XRPL

export type XrplPaymentTransactionData = Payment
export type XrplTrustSetTransactionData = TrustSet
export type XrplTransactionDataIssuedCurrencyAmount = IssuedCurrencyAmount
export type XrplTransactionDataMPTAmount = MPTAmount

// --------------------------- These types come from xrpl.js directly -------------------------------------------
// @see https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/models/transactions/payment.ts

// eslint-disable-next-line @typescript-eslint/no-empty-interface -- no global flags right now, so this is fine
interface GlobalFlags {}

/**
 * Must be a valid account address
 */
type Account = string

interface Memo {
  Memo: {
    MemoData?: string
    MemoType?: string
    MemoFormat?: string
  }
}

interface Signer {
  Signer: {
    Account: string
    TxnSignature: string
    SigningPubKey: string
  }
}

/**
 * Every transaction has the same set of common fields.
 */
interface BaseTransaction {
  /** The unique address of the transaction sender. */
  Account: Account
  /**
   * The type of transaction. Valid types include: `Payment`, `OfferCreate`,
   * `TrustSet`, and many others.
   */
  TransactionType: string
  /**
   * Integer amount of XRP, in drops, to be destroyed as a cost for
   * distributing this transaction to the network. Some transaction types have
   * different minimum requirements.
   */
  Fee?: string
  /**
   * The sequence number of the account sending the transaction. A transaction
   * is only valid if the Sequence number is exactly 1 greater than the previous
   * transaction from the same account. The special case 0 means the transaction
   * is using a Ticket instead.
   */
  Sequence?: number
  /**
   * Hash value identifying another transaction. If provided, this transaction
   * is only valid if the sending account's previously-sent transaction matches
   * the provided hash.
   */
  AccountTxnID?: string
  /** Set of bit-flags for this transaction. */
  Flags?: number | GlobalFlags
  /**
   * Highest ledger index this transaction can appear in. Specifying this field
   * places a strict upper limit on how long the transaction can wait to be
   * validated or rejected.
   */
  LastLedgerSequence?: number
  /**
   * Additional arbitrary information used to identify this transaction.
   */
  Memos?: Memo[]
  /**
   * Array of objects that represent a multi-signature which authorizes this
   * transaction.
   */
  Signers?: Signer[]
  /**
   * Arbitrary integer used to identify the reason for this payment, or a sender
   * on whose behalf this transaction is made. Conventionally, a refund should
   * specify the initial payment's SourceTag as the refund payment's
   * DestinationTag.
   */
  SourceTag?: number
  /**
   * Hex representation of the public key that corresponds to the private key
   * used to sign this transaction. If an empty string, indicates a
   * multi-signature is present in the Signers field instead.
   */
  SigningPubKey?: string
  /**
   * The sequence number of the ticket to use in place of a Sequence number. If
   * this is provided, Sequence must be 0. Cannot be used with AccountTxnID.
   */
  TicketSequence?: number
  /**
   * The signature that verifies this transaction as originating from the
   * account it says it is from.
   */
  TxnSignature?: string
  /**
   * The network id of the transaction.
   */
  NetworkID?: number
}

interface IssuedCurrency {
  currency: string
  issuer: string
}

interface IssuedCurrencyAmount extends IssuedCurrency {
  value: string
}

interface MPTAmount {
  mpt_issuance_id: string
  value: string
}

type Amount = IssuedCurrencyAmount | string

interface PathStep {
  account?: string
  currency?: string
  issuer?: string
}

type Path = PathStep[]

interface PaymentFlagsInterface extends GlobalFlags {
  /**
   * Do not use the default path; only use paths included in the Paths field.
   * This is intended to force the transaction to take arbitrage opportunities.
   * Most clients do not need this.
   */
  tfNoRippleDirect?: boolean
  /**
   * If the specified Amount cannot be sent without spending more than SendMax,
   * reduce the received amount instead of failing outright. See Partial.
   * Payments for more details.
   */
  tfPartialPayment?: boolean
  /**
   * Only take paths where all the conversions have an input:output ratio that
   * is equal or better than the ratio of Amount:SendMax. See Limit Quality for
   * details.
   */
  tfLimitQuality?: boolean
}

interface TrustSetFlagsInterface {
  /**
   * Authorize the other party to hold currency issued by this account. (No
   * effect unless using the asfRequireAuth AccountSet flag.) Cannot be unset.
   */
  tfSetfAuth?: boolean
  /**
   * Enable the No Ripple flag, which blocks rippling between two trust lines
   * of the same currency if this flag is enabled on both.
   */
  tfSetNoRipple?: boolean
  /** Disable the No Ripple flag, allowing rippling on this trust line. */
  tfClearNoRipple?: boolean
  /** Freeze the trust line. */
  tfSetFreeze?: boolean
  /** Unfreeze the trust line. */
  tfClearFreeze?: boolean
  /** Deep-Freeze the trustline -- disallow sending and receiving the said IssuedCurrency */
  /** Allowed only if the trustline is already regularly frozen, or if tfSetFreeze is set in the same transaction. */
  tfSetDeepFreeze?: boolean
  /** Clear a Deep-Frozen trust line */
  tfClearDeepFreeze?: boolean
}

/**
 * Create or modify a trust line linking two accounts.
 *
 * @category Transaction Models
 */
interface TrustSet extends BaseTransaction {
  TransactionType: 'TrustSet'
  /**
   * Object defining the trust line to create or modify, in the format of a
   * Currency Amount.
   */
  LimitAmount: IssuedCurrencyAmount
  /**
   * Value incoming balances on this trust line at the ratio of this number per
   * 1,000,000,000 units. A value of 0 is shorthand for treating balances at
   * face value.
   */
  QualityIn?: number
  /**
   * Value outgoing balances on this trust line at the ratio of this number per
   * 1,000,000,000 units. A value of 0 is shorthand for treating balances at
   * face value.
   */
  QualityOut?: number
  Flags?: number | TrustSetFlagsInterface
}

/*
 * A Payment transaction represents a transfer of value from one account to
 * another.
 *
 * @category Transaction Models
 */
interface Payment extends BaseTransaction {
  TransactionType: 'Payment'
  /**
   * The amount of currency to deliver. For non-XRP amounts, the nested field
   * names MUST be lower-case. If the tfPartialPayment flag is set, deliver up
   * to this amount instead.
   */
  Amount: Amount | MPTAmount
  /** The unique address of the account receiving the payment. */
  Destination: Account
  /**
   * Arbitrary tag that identifies the reason for the payment to the
   * destination, or a hosted recipient to pay.
   */
  DestinationTag?: number
  /**
   * Arbitrary 256-bit hash representing a specific reason or identifier for
   * this payment.
   */
  InvoiceID?: string
  /**
   * Array of payment paths to be used for this transaction. Must be omitted
   * for XRP-to-XRP transactions.
   */
  Paths?: Path[]
  /**
   * Highest amount of source currency this transaction is allowed to cost,
   * including transfer fees, exchange rates, and slippage . Does not include
   * the XRP destroyed as a cost for submitting the transaction. For non-XRP
   * amounts, the nested field names MUST be lower-case. Must be supplied for
   * cross-currency/cross-issue payments. Must be omitted for XRP-to-XRP
   * Payments.
   */
  SendMax?: Amount | MPTAmount
  /**
   * Minimum amount of destination currency this transaction should deliver.
   * Only valid if this is a partial payment. For non-XRP amounts, the nested
   * field names are lower-case.
   */
  DeliverMin?: Amount | MPTAmount
  /**
   * Credentials associated with the sender of this transaction.
   * The credentials included must not be expired.
   */
  CredentialIDs?: string[]
  Flags?: number | PaymentFlagsInterface
}
