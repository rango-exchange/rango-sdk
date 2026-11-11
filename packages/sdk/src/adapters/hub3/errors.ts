import { SignerError, SignerErrorCode } from 'rango-types'

// Rejects only with a `SignerError`, as the **WalletPort** requires; anything else becomes `UNEXPECTED_BEHAVIOUR`.
export async function tryRunAndRejectWithSignerError<T>(
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (SignerError.isSignerError(error)) {
      throw error
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
