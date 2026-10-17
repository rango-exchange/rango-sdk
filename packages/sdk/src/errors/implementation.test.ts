import type { BridgeLimitMetadata, NoResultMetadata } from './definition.js'
import type { SwapResult } from 'rango-sdk'

import { describe, expect, expectTypeOf, test } from 'vitest'

import { SdkError } from './implementation.js'

const SWAP = { swapperId: 'Across' } as unknown as SwapResult
const BRIDGE_LIMIT_METADATA = {
  swap: SWAP,
  limit: 'MIN',
  limitValue: '0.5',
  exclusive: false,
} as const

describe('SdkError', () => {
  test('is an Error named SdkError, with its type, metadata and cause', () => {
    const cause = new Error('underlying')
    const error = new SdkError('BRIDGE_LIMIT', 'Out of limits', {
      metadata: BRIDGE_LIMIT_METADATA,
      cause,
    })

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: 'SdkError',
      message: 'Out of limits',
      type: 'BRIDGE_LIMIT',
      metadata: BRIDGE_LIMIT_METADATA,
      cause,
    })
  })

  test.each(['REQUEST_FAILED', 'REQUEST_CANCELED'] as const)(
    'builds %s with or without the third argument',
    (type) => {
      const cause = new Error('underlying')
      const bare = new SdkError(type, 'Failed')
      const withCause = new SdkError(type, 'Failed', { cause })

      expect(bare).toMatchObject({ name: 'SdkError', type })
      expect(bare).not.toHaveProperty('metadata')
      expect(bare).not.toHaveProperty('cause')
      expect(withCause).toMatchObject({ type, cause })
      expect(withCause).not.toHaveProperty('metadata')
    },
  )

  test('rejects missing or wrong metadata for a type that has it', () => {
    // @ts-expect-error BRIDGE_LIMIT needs metadata.
    void new SdkError('BRIDGE_LIMIT', 'Out of limits')
    // @ts-expect-error BRIDGE_LIMIT needs metadata.
    void new SdkError('BRIDGE_LIMIT', 'Out of limits', { cause: null })
    void new SdkError('BRIDGE_LIMIT', 'Out of limits', {
      // @ts-expect-error BRIDGE_LIMIT needs the broken limit.
      metadata: { swap: SWAP },
    })
    void new SdkError('INVALID_INPUT', 'Bad input', {
      // @ts-expect-error `to` has no NOT_POSITIVE reason.
      metadata: { field: 'to', reason: 'NOT_POSITIVE' },
    })
    void new SdkError('NO_RESULT', 'No result', {
      // @ts-expect-error NO_RESULT has no swap.
      metadata: { swap: SWAP },
    })
  })

  test('narrows metadata on type after instanceof SdkError', () => {
    const caught: unknown = new SdkError('NO_RESULT', 'No result', {
      metadata: {},
    })
    if (!(caught instanceof SdkError)) {
      throw caught
    }

    expectTypeOf(caught.cause).toEqualTypeOf<unknown>()
    switch (caught.type) {
      case 'NO_RESULT':
        expectTypeOf(caught.metadata).toEqualTypeOf<NoResultMetadata>()
        break
      case 'BRIDGE_LIMIT':
        expectTypeOf(caught.metadata).toEqualTypeOf<BridgeLimitMetadata>()
        break
      case 'REQUEST_FAILED':
      case 'REQUEST_CANCELED':
      case 'BAD_REQUEST':
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
      case 'NOT_FOUND':
      case 'TOO_MANY_REQUESTS':
      case 'SERVER_ERROR':
      case 'UNKNOWN_SLIPPAGE':
        expectTypeOf(caught.metadata).toEqualTypeOf<undefined>()
        break
      case 'INVALID_INPUT':
        switch (caught.metadata.field) {
          case 'to':
            expectTypeOf(caught.metadata.reason).toEqualTypeOf<'SAME_ASSET'>()
            break
          case 'amount':
            expectTypeOf(caught.metadata.reason).toEqualTypeOf<
              'NOT_A_NUMBER' | 'NOT_POSITIVE'
            >()
            break
          case 'destination':
            expectTypeOf(caught.metadata.reason).toEqualTypeOf<
              'NO_ADDRESS_PATTERNS' | 'PATTERN_MISMATCH'
            >()
        }
    }
    expect(caught.type).toBe('NO_RESULT')
  })
})
