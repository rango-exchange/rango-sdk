import type { SdkErrorMetadata } from './definition.js'

export type SdkErrorType = keyof SdkErrorMetadata

export type SdkErrorOptions<T extends SdkErrorType = SdkErrorType> =
  (undefined extends SdkErrorMetadata[T]
    ? { metadata?: SdkErrorMetadata[T] }
    : { metadata: SdkErrorMetadata[T] }) &
    ErrorOptions

type AnySdkError = { [K in SdkErrorType]: SdkError<K> }[SdkErrorType]

// The third argument is optional only for the types without metadata.
type SdkErrorArgs<T extends SdkErrorType> =
  undefined extends SdkErrorMetadata[T]
    ? [options?: SdkErrorOptions<T>]
    : [options: SdkErrorOptions<T>]

export class SdkError<T extends SdkErrorType = SdkErrorType> extends Error {
  // Type-only: `instanceof SdkError` narrows to the union over every type, so checking `type` narrows `metadata` (TypeScript 5.3+).
  declare static readonly [Symbol.hasInstance]: (
    value: unknown,
  ) => value is AnySdkError

  override readonly name = 'SdkError'
  readonly type: T
  // `declare` emits no field, so it is set only when metadata is given; that is undefined exactly when `T` takes none.
  declare readonly metadata: SdkErrorMetadata[T]

  constructor(type: T, message: string, ...args: SdkErrorArgs<T>)
  constructor(
    type: T,
    message: string,
    options?: { metadata?: SdkErrorMetadata[T] } & ErrorOptions,
  ) {
    const { metadata, ...errorOptions } = options ?? {}
    super(message, errorOptions)
    this.type = type
    if (metadata !== undefined) {
      this.metadata = metadata
    }
  }
}
