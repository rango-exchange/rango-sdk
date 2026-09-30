import type { RouteValidationError } from './validation.js'
import type { AmountRestrictionType, SwapResult } from 'rango-sdk'

export type RequestFailedMetadata = {
  errorCode: number | null
  traceId: number | null
}

export type QuotesErrorMetadata = {
  NO_ROUTE: NoRouteMetadata
  REQUEST_FAILED: RequestFailedMetadata
  CANCELED: undefined
}

export type QuotesErrorType = keyof QuotesErrorMetadata

type MetadataOption<M, T extends keyof M> = undefined extends M[T]
  ? { metadata?: M[T] }
  : { metadata: M[T] }

export type QuotesErrorOptions<T extends QuotesErrorType = QuotesErrorType> =
  T extends QuotesErrorType
    ? { type: T } & MetadataOption<QuotesErrorMetadata, T> & ErrorOptions
    : never

type AnyQuotesError = {
  [K in QuotesErrorType]: QuotesError<K>
}[QuotesErrorType]

export class QuotesError<
  T extends QuotesErrorType = QuotesErrorType,
> extends Error {
  /*
   * Type-only: narrows `instanceof QuotesError` to a union discriminated on
   * `type` (TypeScript 5.3+). No runtime code; `instanceof` keeps its default
   * behavior. Not meant for subclassing: a subclass would inherit this predicate.
   */
  declare static readonly [Symbol.hasInstance]: (
    value: unknown,
  ) => value is AnyQuotesError

  readonly type: T
  readonly metadata: QuotesErrorMetadata[T]

  constructor(message: string, options: QuotesErrorOptions<T>)
  constructor(
    message: string,
    details: { type: T; metadata: QuotesErrorMetadata[T] } & ErrorOptions,
  ) {
    const { type, metadata, ...options } = details
    super(message, options)
    this.name = 'QuotesError'
    this.type = type
    this.metadata = metadata
  }
}

export type NoRouteMetadata = {
  diagnosisMessage?: string
}

export type AmountOutOfRangeMetadata = {
  swapIndex: number
  swap: SwapResult
  min: string | null
  max: string | null
  restrictionType: AmountRestrictionType
}

export type RecommendedSlippage = {
  swapIndex: number
  slippage: string
}

export type SlippageTooLowMetadata = {
  recommendedSlippages: RecommendedSlippage[]
  minRequiredSlippage: string
}

export type QuoteErrorMetadata = {
  NO_ROUTE: NoRouteMetadata
  AMOUNT_OUT_OF_RANGE: AmountOutOfRangeMetadata
  SLIPPAGE_TOO_LOW: SlippageTooLowMetadata
  REQUEST_FAILED: RequestFailedMetadata
  CANCELED: undefined
}

export type QuoteErrorType = keyof QuoteErrorMetadata

export type QuoteErrorOptions<T extends QuoteErrorType = QuoteErrorType> =
  T extends QuoteErrorType
    ? { type: T } & MetadataOption<QuoteErrorMetadata, T> & ErrorOptions
    : never

type AnyQuoteError = {
  [K in QuoteErrorType]: QuoteError<K>
}[QuoteErrorType]

export class QuoteError<
  T extends QuoteErrorType = QuoteErrorType,
> extends Error {
  // Type-only, as on QuotesError.
  declare static readonly [Symbol.hasInstance]: (
    value: unknown,
  ) => value is AnyQuoteError

  readonly type: T
  readonly metadata: QuoteErrorMetadata[T]

  constructor(message: string, options: QuoteErrorOptions<T>)
  constructor(
    message: string,
    details: { type: T; metadata: QuoteErrorMetadata[T] } & ErrorOptions,
  ) {
    const { type, metadata, ...options } = details
    super(message, options)
    this.name = 'QuoteError'
    this.type = type
    this.metadata = metadata
  }
}

export const VALIDATION_ERROR_MESSAGES: {
  [K in RouteValidationError['type']]: string
} = {
  NO_ROUTE: 'No route was found for this swap.',
  AMOUNT_OUT_OF_RANGE: "The amount is outside a swap's limits.",
  SLIPPAGE_TOO_LOW: 'The slippage is too low for a swap in this route.',
}

export function quoteErrorFromValidation(
  error: RouteValidationError,
  options?: ErrorOptions,
): QuoteError {
  return new QuoteError(VALIDATION_ERROR_MESSAGES[error.type], {
    ...error,
    ...options,
  })
}

export type ConfirmErrorMetadata = QuoteErrorMetadata

export type ConfirmErrorType = QuoteErrorType

export type ConfirmErrorOptions<T extends ConfirmErrorType = ConfirmErrorType> =
  QuoteErrorOptions<T>

type AnyConfirmError = {
  [K in ConfirmErrorType]: ConfirmError<K>
}[ConfirmErrorType]

export class ConfirmError<
  T extends ConfirmErrorType = ConfirmErrorType,
> extends Error {
  // Type-only, as on QuotesError.
  declare static readonly [Symbol.hasInstance]: (
    value: unknown,
  ) => value is AnyConfirmError

  readonly type: T
  readonly metadata: ConfirmErrorMetadata[T]

  constructor(message: string, options: ConfirmErrorOptions<T>)
  constructor(
    message: string,
    details: { type: T; metadata: ConfirmErrorMetadata[T] } & ErrorOptions,
  ) {
    const { type, metadata, ...options } = details
    super(message, options)
    this.name = 'ConfirmError'
    this.type = type
    this.metadata = metadata
  }
}

// Carries a Quote's error over to confirm(), keeping it as the cause.
export function confirmErrorFromQuoteError(error: QuoteError): ConfirmError {
  // `type` and `metadata` of one QuoteError always match, which TypeScript can't see here.
  return new ConfirmError(error.message, {
    type: error.type,
    metadata: error.metadata,
    cause: error,
  } as ConfirmErrorOptions)
}
