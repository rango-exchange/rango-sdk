import type { SimulationResult, SwapResult } from 'rango-sdk'

import { RoutingResultType } from 'rango-sdk'
import { describe, expect, test } from 'vitest'

import { validateRoute, validateSwaps } from './validation.js'

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

describe('validateRoute', () => {
  test('returns NO_ROUTE with the first diagnosis message for a null result', () => {
    expect(validateRoute(null, ['Amount too small', 'Other'])).toEqual({
      type: 'NO_ROUTE',
      metadata: { diagnosisMessage: 'Amount too small' },
    })
  })

  test('returns NO_ROUTE without a diagnosis message when none was given', () => {
    expect(validateRoute(null, [])).toEqual({ type: 'NO_ROUTE', metadata: {} })
  })

  test('returns NO_ROUTE for a result with no swaps', () => {
    expect(validateRoute(result([]), ['No liquidity'])).toEqual({
      type: 'NO_ROUTE',
      metadata: { diagnosisMessage: 'No liquidity' },
    })
  })

  test('prefers NO_ROUTE over the swap checks', () => {
    expect(validateRoute(result([]), [])?.type).toBe('NO_ROUTE')
  })

  test('returns null for a usable result', () => {
    expect(validateRoute(result([swap()]), [])).toBeNull()
  })

  test('applies the swap checks to a result with swaps', () => {
    const tooSmall = swap({ fromAmount: '0.5', fromAmountMinValue: '1' })
    expect(validateRoute(result([tooSmall]), [])?.type).toBe(
      'AMOUNT_OUT_OF_RANGE',
    )
  })
})

/*
 * Fixtures mirror the branches of the widget's route checks in rango-client:
 * hasLimitError / getLimitErrorMessage, checkSlippageErrors and
 * getMinRequiredSlippage in widget/embedded/src/utils/swap.ts, applied in order
 * by getQuoteError in widget/embedded/src/hooks/useConfirmSwap/useConfirmSwap.helpers.ts.
 */
describe('validateSwaps: amount limits', () => {
  test.each([
    ['below an inclusive minimum', '0.5', '1', null, 'INCLUSIVE'],
    ['above an inclusive maximum', '10.01', null, '10', 'INCLUSIVE'],
    ['below an exclusive minimum', '0.09', '0.1', '10', 'EXCLUSIVE'],
    ['equal to an exclusive minimum', '1', '1', null, 'EXCLUSIVE'],
    ['equal to an exclusive zero minimum', '0', '0', null, 'EXCLUSIVE'],
    ['above an exclusive maximum', '11', '1', '10', 'EXCLUSIVE'],
    ['equal to an exclusive maximum', '10', null, '10', 'EXCLUSIVE'],
  ] as const)(
    'returns AMOUNT_OUT_OF_RANGE for an amount %s',
    (_, fromAmount, min, max, restrictionType) => {
      const outOfRange = swap({
        fromAmount,
        fromAmountMinValue: min,
        fromAmountMaxValue: max,
        fromAmountRestrictionType: restrictionType,
      })

      expect(validateSwaps([outOfRange])).toEqual({
        type: 'AMOUNT_OUT_OF_RANGE',
        metadata: {
          swapIndex: 0,
          swap: outOfRange,
          min,
          max,
          restrictionType,
        },
      })
    },
  )

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
    'returns null for an amount %s',
    (_, fromAmount, min, max, restrictionType) => {
      const inRange = swap({
        fromAmount,
        fromAmountMinValue: min,
        fromAmountMaxValue: max,
        fromAmountRestrictionType: restrictionType,
      })

      expect(validateSwaps([inRange])).toBeNull()
    },
  )

  test('reports the first swap that is out of range', () => {
    const inRange = swap()
    const tooLarge = swap({ fromAmount: '20', fromAmountMaxValue: '10' })
    const tooSmall = swap({ fromAmount: '0.1', fromAmountMinValue: '1' })

    expect(validateSwaps([inRange, tooLarge, tooSmall])).toMatchObject({
      type: 'AMOUNT_OUT_OF_RANGE',
      metadata: { swapIndex: 1, swap: tooLarge, max: '10' },
    })
  })
})

describe('validateSwaps: slippage', () => {
  test('lists only the swaps whose recommended slippage has its error flag set', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: false, slippage: '0.5' } }),
      swap(),
      swap({ recommendedSlippage: { error: true, slippage: '3' } }),
      swap({ recommendedSlippage: { error: true, slippage: '1.2' } }),
    ]

    expect(validateSwaps(swaps)).toEqual({
      type: 'SLIPPAGE_TOO_LOW',
      metadata: {
        recommendedSlippages: [
          { swapIndex: 2, slippage: '3' },
          { swapIndex: 3, slippage: '1.2' },
        ],
        minRequiredSlippage: '3',
      },
    })
  })

  test('takes the minimum required slippage from every swap, flagged or not', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: true, slippage: '1.5' } }),
      swap({ recommendedSlippage: { error: false, slippage: '4' } }),
      swap(),
    ]

    expect(validateSwaps(swaps)).toEqual({
      type: 'SLIPPAGE_TOO_LOW',
      metadata: {
        recommendedSlippages: [{ swapIndex: 0, slippage: '1.5' }],
        minRequiredSlippage: '4',
      },
    })
  })

  test('returns null when no recommended slippage has its error flag set', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: false, slippage: '5' } }),
      swap(),
    ]

    expect(validateSwaps(swaps)).toBeNull()
  })

  test('prefers AMOUNT_OUT_OF_RANGE over SLIPPAGE_TOO_LOW', () => {
    const swaps = [
      swap({ recommendedSlippage: { error: true, slippage: '3' } }),
      swap({ fromAmount: '0.1', fromAmountMinValue: '1' }),
    ]

    expect(validateSwaps(swaps)?.type).toBe('AMOUNT_OUT_OF_RANGE')
  })
})
