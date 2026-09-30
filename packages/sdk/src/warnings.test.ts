import type { BlockchainValidationStatus, SwapFee, SwapResult } from 'rango-sdk'

import { describe, expect, test } from 'vitest'

import { resolveThresholds } from './thresholds.js'
import { balanceWarnings, quoteWarnings } from './warnings.js'

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

/*
 * Warning fixtures mirror generateQuoteWarnings, hasHighValueLoss,
 * getPriceImpactLevel and hasProperSlippage in rango-client's widget
 * (widget/embedded/src/utils/quote.ts and utils/swap.ts).
 */
const defaults = resolveThresholds()
const DIGITS = 9

// One swap from an asset worth `usdIn` into `usdOut` units of a 1 USD asset.
function pricedRoute(
  prices: { usdIn: number | null; usdOut: number },
  overrides: Partial<SwapResult> = {},
) {
  const { usdIn, usdOut } = prices
  const base = swap()
  return {
    requestAmount: '1',
    outputAmount: String(usdOut),
    swaps: [
      swap({
        from: { ...base.from, usdPrice: usdIn },
        to: { ...base.to, symbol: 'USDC', usdPrice: 1 },
        ...overrides,
      }),
    ],
  }
}

function fee(overrides: Partial<SwapFee> = {}): SwapFee {
  return {
    name: 'Network Fee',
    expenseType: 'FROM_SOURCE_WALLET',
    asset: { blockchain: 'ETH', symbol: 'ETH', address: null },
    amount: '0.01',
    price: 3000,
    meta: null,
    ...overrides,
  }
}

describe('quoteWarnings: value loss and price', () => {
  test.each([
    {
      name: 'exactly at the high threshold',
      usdIn: 1000,
      usdOut: 900,
      priceImpact: -10,
      level: 'high',
    },
    {
      name: 'below the high threshold',
      usdIn: 3000,
      usdOut: 2400,
      priceImpact: -20,
      level: 'high',
    },
    {
      name: 'just above the high threshold',
      usdIn: 1000,
      usdOut: 901,
      priceImpact: -9.9,
      level: 'low',
    },
    {
      name: 'at the second entry, with a large enough input',
      usdIn: 1000,
      usdOut: 950,
      priceImpact: -5,
      level: 'low',
    },
  ] as const)(
    'returns HIGH_VALUE_LOSS for a price impact $name',
    ({ usdIn, usdOut, priceImpact, level }) => {
      expect(
        quoteWarnings(pricedRoute({ usdIn, usdOut }), undefined, defaults),
      ).toEqual([
        {
          kind: 'HIGH_VALUE_LOSS',
          usdIn,
          usdOut,
          priceImpact: expect.closeTo(priceImpact, DIGITS),
          totalFee: 0,
          level,
        },
      ])
    },
  )

  test.each([
    { name: 'no price impact', usdIn: 1000, usdOut: 1000 },
    { name: 'a gain', usdIn: 1000, usdOut: 1100 },
    {
      name: 'a -10% loss on an input below 400 USD',
      usdIn: 399,
      usdOut: 359.1,
    },
    {
      name: 'a -6% loss on an input below 1000 USD',
      usdIn: 999,
      usdOut: 939.06,
    },
    { name: 'a -4.9% loss on a large input', usdIn: 10000, usdOut: 9510 },
  ])('returns no warning for $name', ({ usdIn, usdOut }) => {
    expect(
      quoteWarnings(pricedRoute({ usdIn, usdOut }), undefined, defaults),
    ).toEqual([])
  })

  test('sums the USD value of every fee not taken from the output', () => {
    const route = pricedRoute(
      { usdIn: 1000, usdOut: 800 },
      {
        fee: [
          fee({ amount: '0.01', price: 3000 }),
          fee({ amount: '2', price: 1.5 }),
          fee({ amount: '5', price: null }),
          fee({ amount: '100', price: 1, expenseType: 'DECREASE_FROM_OUTPUT' }),
        ],
      },
    )

    expect(quoteWarnings(route, undefined, defaults)).toMatchObject([
      { kind: 'HIGH_VALUE_LOSS', totalFee: 33 },
    ])
  })

  test('takes the level from the priceImpact thresholds', () => {
    const thresholds = resolveThresholds({ priceImpact: { low: -1, high: -5 } })

    expect(
      quoteWarnings(
        pricedRoute({ usdIn: 1000, usdOut: 940 }),
        undefined,
        thresholds,
      ),
    ).toMatchObject([{ kind: 'HIGH_VALUE_LOSS', level: 'high' }])
  })

  test('raises HIGH_VALUE_LOSS from the highValueLoss thresholds', () => {
    const thresholds = resolveThresholds({
      highValueLoss: [{ threshold: -1, minInput: 10 }],
    })

    expect(
      quoteWarnings(
        pricedRoute({ usdIn: 100, usdOut: 96 }),
        undefined,
        thresholds,
      ),
    ).toMatchObject([{ kind: 'HIGH_VALUE_LOSS', level: 'low' }])
  })

  describe('with a highValueLoss entry above the low threshold', () => {
    const thresholds = resolveThresholds({
      highValueLoss: [{ threshold: -1, minInput: 10 }],
    })

    test.each([
      { name: 'just above the low threshold', usdOut: 97.1, level: 'low' },
      {
        name: 'between the low and highValueLoss thresholds',
        usdOut: 98,
        level: 'low',
      },
      {
        name: 'exactly at the highValueLoss threshold',
        usdOut: 99,
        level: 'low',
      },
      { name: 'exactly at the low threshold', usdOut: 97, level: 'low' },
      { name: 'just below the low threshold', usdOut: 96.9, level: 'low' },
      { name: 'exactly at the high threshold', usdOut: 90, level: 'high' },
    ] as const)(
      'returns HIGH_VALUE_LOSS for a price impact $name',
      ({ usdOut, level }) => {
        expect(
          quoteWarnings(
            pricedRoute({ usdIn: 100, usdOut }),
            undefined,
            thresholds,
          ),
        ).toMatchObject([{ kind: 'HIGH_VALUE_LOSS', level }])
      },
    )

    test('returns no warning for a price impact above the highValueLoss threshold', () => {
      expect(
        quoteWarnings(
          pricedRoute({ usdIn: 100, usdOut: 99.5 }),
          undefined,
          thresholds,
        ),
      ).toEqual([])
    })
  })

  test('returns HIGH_VALUE_LOSS at the high level for a zero output value', () => {
    expect(
      quoteWarnings(
        pricedRoute({ usdIn: 1000, usdOut: 0 }),
        undefined,
        defaults,
      ),
    ).toEqual([
      {
        kind: 'HIGH_VALUE_LOSS',
        usdIn: 1000,
        usdOut: 0,
        priceImpact: -100,
        totalFee: 0,
        level: 'high',
      },
    ])
  })

  test('returns no warning for a zero output value when no highValueLoss entry matches', () => {
    expect(
      quoteWarnings(
        pricedRoute({ usdIn: 100, usdOut: 0 }),
        undefined,
        defaults,
      ),
    ).toEqual([])
  })

  test('returns UNKNOWN_PRICE for a zero input value', () => {
    const route = {
      ...pricedRoute({ usdIn: 3000, usdOut: 500 }),
      requestAmount: '0',
    }

    expect(quoteWarnings(route, undefined, defaults)).toEqual([
      { kind: 'UNKNOWN_PRICE' },
    ])
  })

  test('returns UNKNOWN_PRICE when the input asset has no USD price', () => {
    expect(
      quoteWarnings(
        pricedRoute({ usdIn: null, usdOut: 500 }),
        undefined,
        defaults,
      ),
    ).toEqual([{ kind: 'UNKNOWN_PRICE' }])
  })

  test('returns UNKNOWN_PRICE when the output asset has no USD price', () => {
    const base = swap()
    const route = {
      requestAmount: '1',
      outputAmount: '500',
      swaps: [swap(), swap({ to: { ...base.to, usdPrice: null } })],
    }

    expect(quoteWarnings(route, undefined, defaults)).toEqual([
      { kind: 'UNKNOWN_PRICE' },
    ])
  })

  test('returns UNKNOWN_PRICE for a route with no swaps', () => {
    const route = { requestAmount: '1', outputAmount: '1', swaps: [] }

    expect(quoteWarnings(route, undefined, defaults)).toEqual([
      { kind: 'UNKNOWN_PRICE' },
    ])
  })
})

describe('quoteWarnings: slippage', () => {
  // A route with no price impact whose swaps recommend these slippages.
  function recommending(...slippages: (string | null)[]) {
    const base = swap()
    return {
      requestAmount: '1',
      outputAmount: '3000',
      swaps: slippages.map((slippage) =>
        swap({
          to: { ...base.to, usdPrice: 1 },
          recommendedSlippage:
            slippage === null ? null : { error: false, slippage },
        }),
      ),
    }
  }

  test('returns INSUFFICIENT_SLIPPAGE with the recommended slippages above the requested one', () => {
    expect(
      quoteWarnings(recommending('2', null, '0.5', '1', '3'), '1', defaults),
    ).toEqual([
      {
        kind: 'INSUFFICIENT_SLIPPAGE',
        recommendedSlippages: [
          { swapIndex: 0, slippage: '2' },
          { swapIndex: 4, slippage: '3' },
        ],
        minRequired: '3',
      },
    ])
  })

  test('returns no slippage warning when the slippage equals the minimum required', () => {
    expect(quoteWarnings(recommending('2', '3'), '3', defaults)).toEqual([])
  })

  test('returns no INSUFFICIENT_SLIPPAGE when a swap reported a slippage error', () => {
    const route = recommending('2')
    const flagged = pricedRoute(
      { usdIn: 3000, usdOut: 3000 },
      {
        recommendedSlippage: { error: true, slippage: '2' },
      },
    )

    expect(quoteWarnings(route, '1', defaults)).toHaveLength(1)
    expect(quoteWarnings(flagged, '1', defaults)).toEqual([])
  })

  test('returns HIGH_SLIPPAGE when the slippage is above the threshold and the minimum required', () => {
    expect(quoteWarnings(recommending('1'), '6', defaults)).toEqual([
      { kind: 'HIGH_SLIPPAGE', slippage: '6' },
    ])
  })

  test('returns HIGH_SLIPPAGE when no swap recommends a slippage', () => {
    expect(quoteWarnings(recommending(null), '6', defaults)).toEqual([
      { kind: 'HIGH_SLIPPAGE', slippage: '6' },
    ])
  })

  test('returns no HIGH_SLIPPAGE at the threshold itself', () => {
    expect(quoteWarnings(recommending('1'), '5', defaults)).toEqual([])
  })

  test('returns INSUFFICIENT_SLIPPAGE, not HIGH_SLIPPAGE, for a high slippage below the minimum required', () => {
    expect(quoteWarnings(recommending('7'), '6', defaults)).toEqual([
      {
        kind: 'INSUFFICIENT_SLIPPAGE',
        recommendedSlippages: [{ swapIndex: 0, slippage: '7' }],
        minRequired: '7',
      },
    ])
  })

  test('raises HIGH_SLIPPAGE from the highSlippage threshold', () => {
    const thresholds = resolveThresholds({ highSlippage: 10 })

    expect(quoteWarnings(recommending('1'), '6', thresholds)).toEqual([])
    expect(quoteWarnings(recommending('1'), '11', thresholds)).toEqual([
      { kind: 'HIGH_SLIPPAGE', slippage: '11' },
    ])
  })

  test.each([undefined, ''])(
    'skips both slippage warnings when the request has no slippage (%j)',
    (slippage) => {
      expect(quoteWarnings(recommending('3'), slippage, defaults)).toEqual([])
      expect(
        quoteWarnings(recommending('3'), slippage, {
          ...defaults,
          highSlippage: -1,
        }),
      ).toEqual([])
    },
  )

  test('returns every warning that applies', () => {
    const route = pricedRoute(
      { usdIn: 3000, usdOut: 2400 },
      {
        recommendedSlippage: { error: false, slippage: '1' },
      },
    )

    expect(
      quoteWarnings(route, '6', defaults).map((warning) => warning.kind),
    ).toEqual(['HIGH_VALUE_LOSS', 'HIGH_SLIPPAGE'])
  })
})

describe('balanceWarnings', () => {
  const USDC = {
    blockchain: 'BSC',
    symbol: 'USDC',
    address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  }
  const BNB = { blockchain: 'BSC', symbol: 'BNB', address: null }
  const ETH = { blockchain: 'ETH', symbol: 'ETH', address: null }

  test('returns one INSUFFICIENT_BALANCE per asset that is short', () => {
    const validationStatus: BlockchainValidationStatus[] = [
      {
        blockchain: 'BSC',
        wallets: [
          {
            address: '0xbsc',
            addressIsValid: true,
            validResult: true,
            requiredAssets: [
              {
                asset: USDC,
                requiredAmount: { amount: '5000000', decimals: 6 },
                currentAmount: { amount: '1000000', decimals: 6 },
                ok: false,
                reason: 'INPUT_ASSET',
              },
              {
                asset: BNB,
                requiredAmount: { amount: '1', decimals: 18 },
                currentAmount: { amount: '2', decimals: 18 },
                ok: true,
                reason: 'FEE',
              },
            ],
          },
        ],
      },
      {
        blockchain: 'ETH',
        wallets: [
          {
            address: '0xeth',
            addressIsValid: true,
            validResult: true,
            requiredAssets: [
              {
                asset: ETH,
                requiredAmount: { amount: '3', decimals: 18 },
                currentAmount: { amount: '0', decimals: 18 },
                ok: false,
                reason: 'FEE_AND_INPUT_ASSET',
              },
            ],
          },
        ],
      },
    ]

    expect(balanceWarnings(validationStatus)).toEqual([
      {
        kind: 'INSUFFICIENT_BALANCE',
        blockchain: 'BSC',
        address: '0xbsc',
        asset: USDC,
        required: { amount: '5000000', decimals: 6 },
        current: { amount: '1000000', decimals: 6 },
        reason: 'INPUT_ASSET',
      },
      {
        kind: 'INSUFFICIENT_BALANCE',
        blockchain: 'ETH',
        address: '0xeth',
        asset: ETH,
        required: { amount: '3', decimals: 18 },
        current: { amount: '0', decimals: 18 },
        reason: 'FEE_AND_INPUT_ASSET',
      },
    ])
  })

  test('returns no warnings without a validation status', () => {
    expect(balanceWarnings(null)).toEqual([])
    expect(balanceWarnings([])).toEqual([])
  })
})
