import { Hub3Error } from '@hub3js/core'
import { SignerError, SignerErrorCode } from 'rango-types'
import { describe, expect, test } from 'vitest'

import { tryRunAndRejectWithSignerError } from './errors.js'

async function rejectionOf(error: unknown): Promise<unknown> {
  return tryRunAndRejectWithSignerError(async () => {
    throw error
  }).catch((rejection: unknown) => rejection)
}

describe('tryRunAndRejectWithSignerError', () => {
  test('answers what the call answers', async () => {
    await expect(
      tryRunAndRejectWithSignerError(async () => 'answer'),
    ).resolves.toBe('answer')
  })

  test('hub3’s user-rejected error rejects as a SignerError REJECTED_BY_USER whose cause is the original', async () => {
    const error = new Hub3Error(
      'PROVIDER_USER_REJECTED_REQUEST',
      'The wallet said no.',
    )

    const rejection = await rejectionOf(error)

    expect(rejection).toBeInstanceOf(SignerError)
    expect(rejection).toMatchObject({
      code: SignerErrorCode.REJECTED_BY_USER,
      root: undefined,
      cause: error,
    })
  })

  test('another hub3 error rejects as a SignerError UNEXPECTED_BEHAVIOUR whose root and cause are the original', async () => {
    const error = new Hub3Error('PROVIDER_UNEXPECTED', 'The wallet crashed.')

    const rejection = await rejectionOf(error)

    expect(rejection).toBeInstanceOf(SignerError)
    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      root: error,
      cause: error,
    })
  })

  test('an Error that only copies hub3’s user-rejected name and type is not a Hub3Error: it rejects as a SignerError UNEXPECTED_BEHAVIOUR', async () => {
    const error = Object.assign(new Error('The wallet said no.'), {
      name: 'Hub3Error',
      type: 'PROVIDER_USER_REJECTED_REQUEST',
    })

    const rejection = await rejectionOf(error)

    expect(rejection).toBeInstanceOf(SignerError)
    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      root: error,
      cause: error,
    })
  })

  test('a SignerError rejects as it is', async () => {
    const error = new SignerError(
      SignerErrorCode.SIGN_TX_ERROR,
      'Wallet said no',
    )

    await expect(rejectionOf(error)).resolves.toBe(error)
  })
})
