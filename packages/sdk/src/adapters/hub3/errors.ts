import type { Hub3ErrorType } from '@hub3js/core'

import { SignerError, SignerErrorCode } from 'rango-types'

const HUB3_ERROR_NAME = 'Hub3Error'
const USER_REJECTED_TYPE: Hub3ErrorType = 'PROVIDER_USER_REJECTED_REQUEST'

/*
 * Runs a **Hub3 adapter**'s `sign` or `wait` and rejects only with a `SignerError`, as the **WalletPort** requires: a
 * `SignerError` passes through, hub3's user-rejected error becomes `REJECTED_BY_USER`, and anything else becomes
 * `UNEXPECTED_BEHAVIOUR` with the original as its root and cause.
 */
export async function runAndRejectWithSignerError<T>(
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (SignerError.isSignerError(error)) {
      throw error
    }
    const code = isHub3UserRejectedError(error)
      ? SignerErrorCode.REJECTED_BY_USER
      : SignerErrorCode.UNEXPECTED_BEHAVIOUR
    throw new SignerError(code, undefined, error, undefined, error)
  }
}

// Read by name and type, not `instanceof`, so an error from a second copy of hub3 still matches.
function isHub3UserRejectedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === HUB3_ERROR_NAME &&
    'type' in error &&
    error.type === USER_REJECTED_TYPE
  )
}
