import type { SdkWarningMetadata } from './definition.js'

export type SdkWarningType = keyof SdkWarningMetadata

// Distributes over `T`, so bare `SdkWarning` is the union of every warning and checking `type` narrows `metadata`.
export type SdkWarning<T extends SdkWarningType = SdkWarningType> = {
  [K in T]: undefined extends SdkWarningMetadata[K]
    ? { type: K; message: string; metadata?: SdkWarningMetadata[K] }
    : { type: K; message: string; metadata: SdkWarningMetadata[K] }
}[T]

// The metadata argument is optional only for the types without metadata.
type SdkWarningArgs<T extends SdkWarningType> =
  undefined extends SdkWarningMetadata[T]
    ? [metadata?: SdkWarningMetadata[T]]
    : [metadata: SdkWarningMetadata[T]]

export const WARNING_MESSAGES: Record<SdkWarningType, string> = {
  HIGH_VALUE_LOSS: "The route loses a large share of the input's USD value.",
  UNKNOWN_PRICE: 'The USD value of the input or the output is unknown.',
  INSUFFICIENT_SLIPPAGE:
    'The slippage is below the minimum the route requires.',
  HIGH_SLIPPAGE: 'The slippage is above the high-slippage threshold.',
  HIGH_FEE: "The route's total fee is at or above the high-fee threshold.",
  LONG_DURATION:
    "The route's estimated time is at or above the long-duration threshold.",
  INSUFFICIENT_BALANCE: "A wallet doesn't hold enough of an asset.",
}

export function createWarning<T extends SdkWarningType>(
  type: T,
  ...args: SdkWarningArgs<T>
): SdkWarning<T>
export function createWarning(
  type: SdkWarningType,
  metadata?: SdkWarningMetadata[SdkWarningType],
): {
  type: SdkWarningType
  message: string
  metadata?: SdkWarningMetadata[SdkWarningType]
} {
  return {
    type,
    message: WARNING_MESSAGES[type],
    ...(metadata === undefined ? {} : { metadata }),
  }
}
