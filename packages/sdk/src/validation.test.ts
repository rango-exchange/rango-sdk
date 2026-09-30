import type { SimulationResult, SwapResult } from 'rango-sdk'

import { RoutingResultType } from 'rango-sdk'
import { describe, expect, test } from 'vitest'

import {
  validateDestination,
  validateRequest,
  validateRoute,
  validateSwaps,
} from './validation.js'

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

const ETH = { blockchain: 'ETH', symbol: 'ETH', address: null }
const USDC = {
  blockchain: 'ETH',
  symbol: 'USDC',
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
}
const MAX_SLIPPAGE = 30
const HIGHER_MAX_SLIPPAGE = 50

function invalid(field: string, reason: string) {
  return { type: 'INVALID_INPUT', metadata: { field, reason } }
}

describe('validateRequest', () => {
  const request = { from: ETH, to: USDC, amount: '1', slippage: '1.5' }

  test('returns null for valid input', () => {
    expect(validateRequest(request, MAX_SLIPPAGE)).toBeNull()
  })

  test('returns MISSING for a missing from, before a missing to', () => {
    expect(
      validateRequest({ ...request, from: null, to: null }, MAX_SLIPPAGE),
    ).toEqual(invalid('from', 'MISSING'))
  })

  test('returns MISSING for a missing to', () => {
    expect(
      validateRequest({ ...request, to: undefined }, MAX_SLIPPAGE),
    ).toEqual(invalid('to', 'MISSING'))
  })

  test('returns SAME_ASSET on to when both assets match by blockchain, symbol and address', () => {
    expect(
      validateRequest(
        { ...request, to: { ...USDC }, from: USDC },
        MAX_SLIPPAGE,
      ),
    ).toEqual(invalid('to', 'SAME_ASSET'))
    expect(
      validateRequest({ ...request, to: { ...ETH } }, MAX_SLIPPAGE),
    ).toEqual(invalid('to', 'SAME_ASSET'))
  })

  test('accepts assets that differ only by blockchain, symbol or address', () => {
    for (const to of [
      { ...ETH, blockchain: 'ARBITRUM' },
      { ...ETH, symbol: 'WETH' },
      { ...ETH, address: '0x1' },
    ]) {
      expect(validateRequest({ ...request, to }, MAX_SLIPPAGE)).toBeNull()
    }
  })

  test('checks the assets before the amount', () => {
    expect(
      validateRequest({ ...request, to: ETH, amount: 'x' }, MAX_SLIPPAGE),
    ).toEqual(invalid('to', 'SAME_ASSET'))
  })

  test.each(['', ' ', 'abc', '1,5', '0x10', 'NaN', 'Infinity', undefined])(
    'returns NOT_A_NUMBER for the amount %j',
    (amount) => {
      expect(validateRequest({ ...request, amount }, MAX_SLIPPAGE)).toEqual(
        invalid('amount', 'NOT_A_NUMBER'),
      )
    },
  )

  test.each(['0', '0.0', '-1'])(
    'returns NOT_POSITIVE for the amount %j',
    (amount) => {
      expect(validateRequest({ ...request, amount }, MAX_SLIPPAGE)).toEqual(
        invalid('amount', 'NOT_POSITIVE'),
      )
    },
  )

  test.each(['0.000001', '.5', '1e3', '12345.678'])(
    'accepts the amount %j',
    (amount) => {
      expect(validateRequest({ ...request, amount }, MAX_SLIPPAGE)).toBeNull()
    },
  )

  test('checks the amount before the slippage', () => {
    expect(
      validateRequest({ ...request, amount: '0', slippage: '0' }, MAX_SLIPPAGE),
    ).toEqual(invalid('amount', 'NOT_POSITIVE'))
  })

  test('skips the slippage check when no slippage is given', () => {
    expect(
      validateRequest({ ...request, slippage: undefined }, MAX_SLIPPAGE),
    ).toBeNull()
  })

  test.each(['', 'abc', 'NaN'])(
    'returns NOT_A_NUMBER for the slippage %j',
    (slippage) => {
      expect(validateRequest({ ...request, slippage }, MAX_SLIPPAGE)).toEqual(
        invalid('slippage', 'NOT_A_NUMBER'),
      )
    },
  )

  test.each(['0', '-1', '30.01', '100'])(
    'returns OUT_OF_RANGE for the slippage %j',
    (slippage) => {
      expect(validateRequest({ ...request, slippage }, MAX_SLIPPAGE)).toEqual(
        invalid('slippage', 'OUT_OF_RANGE'),
      )
    },
  )

  test('accepts a slippage of exactly the maximum', () => {
    expect(
      validateRequest({ ...request, slippage: '30' }, MAX_SLIPPAGE),
    ).toBeNull()
    expect(
      validateRequest({ ...request, slippage: '50' }, HIGHER_MAX_SLIPPAGE),
    ).toBeNull()
  })
})

describe('validateDestination', () => {
  const blockchains = [
    { name: 'ETH', addressPatterns: ['^(0x)[0-9A-Fa-f]{40}$'] },
    {
      name: 'SOLANA',
      addressPatterns: ['^[1-9A-HJ-NP-Za-km-z]{32,44}$', '^invalid($'],
    },
    { name: 'NO_PATTERNS', addressPatterns: [] },
  ]
  const EVM_ADDRESS = '0x0000000000000000000000000000000000000001'

  test('returns null for a destination that matches a pattern of the blockchain', () => {
    expect(validateDestination(EVM_ADDRESS, 'ETH', blockchains)).toBeNull()
    expect(
      validateDestination(
        'So11111111111111111111111111111111111111112',
        'SOLANA',
        blockchains,
      ),
    ).toBeNull()
  })

  test("returns PATTERN_MISMATCH for a destination that matches none of the blockchain's patterns", () => {
    expect(validateDestination('0x123', 'ETH', blockchains)).toEqual(
      invalid('destination', 'PATTERN_MISMATCH'),
    )
    expect(validateDestination(EVM_ADDRESS, 'SOLANA', blockchains)).toEqual(
      invalid('destination', 'PATTERN_MISMATCH'),
    )
  })

  test('returns NO_ADDRESS_PATTERNS when the blockchain is missing or has no patterns', () => {
    expect(validateDestination(EVM_ADDRESS, 'BSC', blockchains)).toEqual(
      invalid('destination', 'NO_ADDRESS_PATTERNS'),
    )
    expect(
      validateDestination(EVM_ADDRESS, 'NO_PATTERNS', blockchains),
    ).toEqual(invalid('destination', 'NO_ADDRESS_PATTERNS'))
    expect(validateDestination(EVM_ADDRESS, 'ETH', undefined)).toEqual(
      invalid('destination', 'NO_ADDRESS_PATTERNS'),
    )
  })
})
