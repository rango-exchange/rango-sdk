export type RequestFailedMetadata = {
  errorCode: number | null
  traceId: number | null
}

export type QuotesErrorMetadata = {
  REQUEST_FAILED: RequestFailedMetadata
  CANCELED: undefined
}

export type QuotesErrorType = keyof QuotesErrorMetadata

type MetadataOption<T extends QuotesErrorType> =
  undefined extends QuotesErrorMetadata[T]
    ? { metadata?: QuotesErrorMetadata[T] }
    : { metadata: QuotesErrorMetadata[T] }

export type QuotesErrorOptions<T extends QuotesErrorType = QuotesErrorType> =
  T extends QuotesErrorType
    ? { type: T } & MetadataOption<T> & ErrorOptions
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
