import type { Asset, SimulationResult, SwapResult } from 'rango-sdk'

import { RoutingResultType } from 'rango-sdk'
import { describe, expect, test } from 'vitest'

import { SdkError } from '../../errors/mod.js'

import {
  getMinRequiredSlippage,
  isSameAsset,
  parseDecimal,
  validateRoute,
  validateSwaps,
} from './utils.js'

function swap(overrides: Partial<SwapResult> = {}): SwapResult {
  const asset = {
    blockchain: 'ETH',
    address: null,
    symbol: 'ETH',
    logo: '',
    blockchainLogo: '',
    decimals: 18,
    usdPrice: 3000,
  }
  return {
    swapperId: 'Across',
    swapperLogo: '',
    swapperType: 'BRIDGE',
    swapChainType: 'INTER_CHAIN',
    from: asset,
    to: asset,
    toAmount: '1',
    fromAmount: '1',
    fromAmountMaxValue: null,
    fromAmountMinValue: null,
    fromAmountPrecision: null,
    fromAmountRestrictionType: 'EXCLUSIVE',
    routes: null,
    internalSwaps: null,
    fee: [],
    estimatedTimeInSeconds: 60,
    timeStat: null,
    includesDestinationTx: false,
    maxRequiredSign: 1,
    recommendedSlippage: null,
    warnings: [],
    ...overrides,
  }
}

function result(swaps: SwapResult[]): SimulationResult {
  return { outputAmount: '3000', resultType: RoutingResultType.OK, swaps }
}

function thrownBy(check: () => void): unknown {
  try {
    check()
  } catch (error) {
    return error
  }
  throw new Error('Expected the check to throw.')
}

const ETH = { blockchain: 'ETH', symbol: 'ETH', address: null }
const USDC = {
  blockchain: 'ETH',
  symbol: 'USDC',
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
}

describe('isSameAsset', () => {
  test('is true for assets with the same blockchain, symbol and address', () => {
    expect(isSameAsset(USDC, { ...USDC })).toBe(true)
    expect(isSameAsset(ETH, { ...ETH })).toBe(true)
  })

  test('treats a missing address and a null address as equal', () => {
    // Untyped callers can leave the address out.
    const withoutAddress = { blockchain: 'ETH', symbol: 'ETH' } as Asset

    expect(isSameAsset(ETH, withoutAddress)).toBe(true)
  })

  test.each([
    ['blockchain', { ...ETH, blockchain: 'ARBITRUM' }],
    ['symbol', { ...ETH, symbol: 'WETH' }],
    ['address', { ...ETH, address: '0x1' }],
  ])('is false for assets that differ only by %s', (_, other) => {
    expect(isSameAsset(ETH, other)).toBe(false)
  })

  test('compares addresses case-sensitively', () => {
    expect(
      isSameAsset(USDC, { ...USDC, address: USDC.address.toUpperCase() }),
    ).toBe(false)
  })
})

describe('parseDecimal', () => {
  test.each(['0.000001', '.5', '1e3', '12345.678', ' 2 ', '0', '-1'])(
    'parses %j as a number',
    (value) => {
      expect(parseDecimal(value)).toBe(Number(value))
    },
  )

  test.each(['', ' ', 'abc', '1,5', '0x10', 'NaN', 'Infinity', '1e999'])(
    'returns null for %j',
    (value) => {
      expect(parseDecimal(value)).toBeNull()
    },
  )
})

// The highest positive recommendation of any swap wins.
describe('getMinRequiredSlippage', () => {
  test('returns the highest positive recommendation', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: true, slippage: '1.5' } }),
      swap({ recommendedSlippage: { error: false, slippage: '4' } }),
      swap(),
    ]

    expect(getMinRequiredSlippage(swaps)).toBe('4')
  })

  test('ignores recommendations that are not positive', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: true, slippage: '0' } }),
      swap({ recommendedSlippage: { error: true, slippage: '' } }),
      swap({ recommendedSlippage: { error: true, slippage: 'abc' } }),
      swap({ recommendedSlippage: { error: false, slippage: '2' } }),
    ]

    expect(getMinRequiredSlippage(swaps)).toBe('2')
  })

  test('reads recommendations with parseFloat', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: true, slippage: '1.5%' } }),
      swap({ recommendedSlippage: { error: false, slippage: '1' } }),
    ]

    expect(getMinRequiredSlippage(swaps)).toBe('1.5%')
  })

  test('returns null when no swap recommends a positive slippage', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: true, slippage: '0' } }),
      swap(),
    ]

    expect(getMinRequiredSlippage(swaps)).toBeNull()
  })
})

describe('validateRoute', () => {
  test('throws NO_RESULT with the first diagnosis message for a null result', () => {
    const error = thrownBy(() =>
      validateRoute({
        result: null,
        diagnosisMessages: ['Amount too small', 'Other'],
      }),
    )

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({
      type: 'NO_RESULT',
      metadata: { diagnosisMessage: 'Amount too small' },
    })
  })

  test('throws NO_RESULT without a diagnosis message when none was given', () => {
    const error = thrownBy(() =>
      validateRoute({ result: null, diagnosisMessages: [] }),
    )

    expect(error).toHaveProperty('type', 'NO_RESULT')
    expect(error).toHaveProperty('metadata', {})
  })

  test('throws NO_RESULT for a result with no swaps', () => {
    expect(
      thrownBy(() =>
        validateRoute({
          result: result([]),
          diagnosisMessages: ['No liquidity'],
        }),
      ),
    ).toMatchObject({
      type: 'NO_RESULT',
      metadata: { diagnosisMessage: 'No liquidity' },
    })
  })

  test('throws an SdkError without a cause, because the route is not an error', () => {
    const error = thrownBy(() => validateRoute({ result: null }))

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toHaveProperty('name', 'SdkError')
    expect(error).not.toHaveProperty('cause')
  })

  test('does not throw for a usable result', () => {
    expect(() => validateRoute({ result: result([swap()]) })).not.toThrow()
  })

  test('applies the swap checks to a result with swaps', () => {
    const tooSmall = swap({ fromAmount: '0.5', fromAmountMinValue: '1' })

    expect(
      thrownBy(() => validateRoute({ result: result([tooSmall]) })),
    ).toMatchObject({
      type: 'BRIDGE_LIMIT',
      metadata: { swap: tooSmall, limit: 'MIN', limitValue: '1' },
    })
  })
})

// Limit, then slippage checks, applied in order; the first broken one is the error.
describe('validateSwaps: amount limits', () => {
  test.each([
    ['below an inclusive minimum', '0.5', '1', null, 'INCLUSIVE', 'MIN', '1'],
    [
      'above an inclusive maximum',
      '10.01',
      null,
      '10',
      'INCLUSIVE',
      'MAX',
      '10',
    ],
    [
      'below an exclusive minimum',
      '0.09',
      '0.1',
      '10',
      'EXCLUSIVE',
      'MIN',
      '0.1',
    ],
    ['equal to an exclusive minimum', '1', '1', null, 'EXCLUSIVE', 'MIN', '1'],
    [
      'equal to an exclusive zero minimum',
      '0',
      '0',
      null,
      'EXCLUSIVE',
      'MIN',
      '0',
    ],
    ['above an exclusive maximum', '11', '1', '10', 'EXCLUSIVE', 'MAX', '10'],
    [
      'equal to an exclusive maximum',
      '10',
      null,
      '10',
      'EXCLUSIVE',
      'MAX',
      '10',
    ],
    [
      'outside inclusive limits with the minimum above the maximum',
      '5',
      '10',
      '1',
      'INCLUSIVE',
      'MAX',
      '1',
    ],
    [
      'outside exclusive limits with the minimum above the maximum',
      '5',
      '10',
      '1',
      'EXCLUSIVE',
      'MAX',
      '1',
    ],
  ] as const)(
    'throws BRIDGE_LIMIT for an amount %s',
    (_, fromAmount, min, max, restrictionType, limit, limitValue) => {
      const outOfRange = swap({
        fromAmount,
        fromAmountMinValue: min,
        fromAmountMaxValue: max,
        fromAmountRestrictionType: restrictionType,
      })

      const error = thrownBy(() => validateSwaps([outOfRange]))

      expect(error).toBeInstanceOf(SdkError)
      expect(error).toHaveProperty('type', 'BRIDGE_LIMIT')
      expect(error).not.toHaveProperty('cause')
      expect(error).toHaveProperty('metadata', {
        swap: outOfRange,
        limit,
        limitValue,
        exclusive: restrictionType === 'EXCLUSIVE',
      })
    },
  )

  test('treats a missing restriction type as inclusive', () => {
    const atMinimum = swap({
      fromAmount: '1',
      fromAmountMinValue: '1',
      fromAmountRestrictionType: undefined,
    })
    const belowMinimum = swap({
      fromAmount: '0.5',
      fromAmountMinValue: '1',
      fromAmountRestrictionType: undefined,
    })

    expect(() => validateSwaps([atMinimum])).not.toThrow()
    expect(thrownBy(() => validateSwaps([belowMinimum]))).toHaveProperty(
      'metadata',
      { swap: belowMinimum, limit: 'MIN', limitValue: '1', exclusive: false },
    )
  })

  test.each([
    ['equal to an inclusive minimum', '1', '1', null, 'INCLUSIVE'],
    ['equal to an inclusive maximum', '10', null, '10', 'INCLUSIVE'],
    ['between inclusive limits', '5', '1', '10', 'INCLUSIVE'],
    ['between exclusive limits', '5', '1', '10', 'EXCLUSIVE'],
    ['with no limits', '1000000', null, null, 'EXCLUSIVE'],
    [
      'beyond float precision but inside the limit',
      '100000000000000000001',
      null,
      '100000000000000000002',
      'EXCLUSIVE',
    ],
  ] as const)(
    'does not throw for an amount %s',
    (_, fromAmount, min, max, restrictionType) => {
      const inRange = swap({
        fromAmount,
        fromAmountMinValue: min,
        fromAmountMaxValue: max,
        fromAmountRestrictionType: restrictionType,
      })

      expect(() => validateSwaps([inRange])).not.toThrow()
    },
  )

  test.each([
    ['an empty minimum', { fromAmount: '0.5', fromAmountMinValue: '' }],
    ['an empty maximum', { fromAmount: '20', fromAmountMaxValue: '' }],
  ])('treats %s as no limit', (_, overrides) => {
    expect(() => validateSwaps([swap(overrides)])).not.toThrow()
  })

  test('reports the first swap that is out of range', () => {
    const inRange = swap()
    const tooLarge = swap({ fromAmount: '20', fromAmountMaxValue: '10' })
    const tooSmall = swap({ fromAmount: '0.1', fromAmountMinValue: '1' })

    expect(
      thrownBy(() => validateSwaps([inRange, tooLarge, tooSmall])),
    ).toHaveProperty('metadata', {
      swap: tooLarge,
      limit: 'MAX',
      limitValue: '10',
      exclusive: true,
    })
  })
})

describe('validateSwaps: slippage', () => {
  test('throws UNKNOWN_SLIPPAGE for a flagged swap, with no metadata', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: false, slippage: '5' } }),
      swap({ recommendedSlippage: { error: true, slippage: '3' } }),
    ]

    const error = thrownBy(() => validateSwaps(swaps))

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({
      type: 'UNKNOWN_SLIPPAGE',
      message: "Rango failed to compute a swap's slippage.",
    })
    expect(error).not.toHaveProperty('cause')
    expect(error).not.toHaveProperty('metadata')
  })

  test('does not throw for recommendations without the error flag', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: false, slippage: '3' } }),
      swap(),
    ]

    expect(() => validateSwaps(swaps)).not.toThrow()
  })

  test('throws BRIDGE_LIMIT for a route that fails both checks', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: true, slippage: '3' } }),
      swap({ fromAmount: '0.5', fromAmountMinValue: '1' }),
    ]

    expect(thrownBy(() => validateSwaps(swaps))).toHaveProperty(
      'type',
      'BRIDGE_LIMIT',
    )
  })
})
