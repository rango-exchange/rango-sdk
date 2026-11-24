import { Hub3Error } from '@hub3js/core'
import { SignerError, SignerErrorCode } from 'rango-types'

// Rejects only with a `SignerError`, as the SDK's wallet interfaces require: hub3's user rejection becomes `REJECTED_BY_USER`, anything else `UNEXPECTED_BEHAVIOUR`.
export async function tryRunAndRejectWithSignerError<T>(
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (SignerError.isSignerError(error)) {
      throw error
    }
    if (
      error instanceof Hub3Error &&
      error.type === 'PROVIDER_USER_REJECTED_REQUEST'
    ) {
      throw new SignerError(
        SignerErrorCode.REJECTED_BY_USER,
        undefined,
        error,
        undefined,
        error,
      )
    }
    throw new SignerError(
      SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      undefined,
      error,
      undefined,
      error,
    )
  }
}
