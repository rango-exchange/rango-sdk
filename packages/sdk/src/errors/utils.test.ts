import { describe, expect, test } from 'vitest'

import { SdkError } from './implementation.js'
import { throwRequestError } from './utils.js'

function getThrown(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('Expected a throw.')
}

describe('throwRequestError', () => {
  test('rethrows an SdkError as it is, even when the signal is aborted', () => {
    const error = new SdkError('UNKNOWN_SLIPPAGE', 'slippage')
    const controller = new AbortController()
    controller.abort()

    expect(getThrown(() => throwRequestError(error, controller.signal))).toBe(
      error,
    )
  })

  test('rethrows an SdkError as it is, even when its cause has a 400 status', () => {
    const cause = { response: { status: 400, data: { error: 'bad request' } } }
    const error = Object.assign(
      new SdkError('REQUEST_FAILED', 'failed', { cause }),
      cause,
    )

    expect(getThrown(() => throwRequestError(error, undefined))).toBe(error)
  })

  test('throws REQUEST_CANCELED for an aborted signal, even for an HTTP 429', () => {
    const cause = { response: { status: 429, data: { error: 'slow down' } } }
    const controller = new AbortController()
    controller.abort()

    expect(
      getThrown(() => throwRequestError(cause, controller.signal)),
    ).toMatchObject({ type: 'REQUEST_CANCELED', cause })
  })

  test.each([
    { status: 400, type: 'BAD_REQUEST' },
    { status: 401, type: 'UNAUTHORIZED' },
    { status: 403, type: 'FORBIDDEN' },
    { status: 404, type: 'NOT_FOUND' },
    { status: 429, type: 'TOO_MANY_REQUESTS' },
    { status: 500, type: 'SERVER_ERROR' },
    { status: 503, type: 'SERVER_ERROR' },
    { status: 599, type: 'SERVER_ERROR' },
    { status: 402, type: 'REQUEST_FAILED' },
    { status: 499, type: 'REQUEST_FAILED' },
    { status: 600, type: 'REQUEST_FAILED' },
  ])('throws $type for an HTTP $status', ({ status, type }) => {
    const withMessage = { response: { status, data: { error: 'Bad input' } } }
    const withoutMessage = {
      response: { status, data: { message: 'Ignored' } },
    }
    const withEmptyMessage = { response: { status, data: { error: '' } } }

    expect(
      getThrown(() => throwRequestError(withMessage, undefined)),
    ).toMatchObject({
      type,
      message: 'Bad input',
      cause: withMessage,
    })
    expect(
      getThrown(() => throwRequestError(withoutMessage, undefined)),
    ).toMatchObject({
      type,
      message: 'The request failed.',
      cause: withoutMessage,
    })
    expect(
      getThrown(() => throwRequestError(withEmptyMessage, undefined)),
    ).toMatchObject({
      type,
      message: 'The request failed.',
    })
  })

  test('uses the fallback message for a plain-string body', () => {
    const cause = { response: { status: 400, data: 'Bad input' } }

    expect(getThrown(() => throwRequestError(cause, undefined))).toMatchObject({
      type: 'BAD_REQUEST',
      message: 'The request failed.',
    })
  })

  test('throws REQUEST_FAILED with the fallback message for a network error', () => {
    const cause = new Error('Network Error')

    expect(getThrown(() => throwRequestError(cause, undefined))).toMatchObject({
      type: 'REQUEST_FAILED',
      message: 'The request failed.',
      cause,
    })
  })
})
