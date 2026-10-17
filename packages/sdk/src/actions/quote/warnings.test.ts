import type { BlockchainValidationStatus, SwapFee, SwapResult } from 'rango-sdk'

import BigNumber from 'bignumber.js'
import { describe, expect, test } from 'vitest'

import {
  getBalanceWarnings,
  getPercentageChange,
  getPriceImpact,
  getPriceImpactLevel,
  getQuoteWarnings,
  hasHighValueLoss,
} from './warnings.js'

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

// Fixtures for the value loss, price impact and slippage rules.
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

describe('getQuoteWarnings: value loss and price', () => {
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
        getQuoteWarnings(pricedRoute({ usdIn, usdOut }), undefined),
      ).toEqual([
        {
          type: 'HIGH_VALUE_LOSS',
          message: "The route loses a large share of the input's USD value.",
          metadata: {
            inputUsdValue: usdIn,
            outputUsdValue: usdOut,
            priceImpact: expect.closeTo(priceImpact, DIGITS),
            totalFee: 0,
            warningLevel: level,
          },
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
    expect(getQuoteWarnings(pricedRoute({ usdIn, usdOut }), undefined)).toEqual(
      [],
    )
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

    expect(getQuoteWarnings(route, undefined)).toMatchObject([
      {
        type: 'HIGH_VALUE_LOSS',
        message: "The route loses a large share of the input's USD value.",
        metadata: { totalFee: 33 },
      },
      {
        type: 'HIGH_FEE',
        message: "The route's total fee is at or above the high-fee threshold.",
        metadata: { totalFee: 33 },
      },
    ])
  })

  test.each([
    { name: 'a zero output value', requestAmount: '1', outputAmount: '0' },
    { name: 'a zero input value', requestAmount: '0', outputAmount: '500' },
    {
      name: 'an input amount that is not a number',
      requestAmount: 'abc',
      outputAmount: '500',
    },
    {
      name: 'an output amount that is not a number',
      requestAmount: '1',
      outputAmount: 'abc',
    },
  ])(
    'returns no value warning for $name',
    ({ requestAmount, outputAmount }) => {
      const route = {
        ...pricedRoute({ usdIn: 3000, usdOut: 0 }),
        requestAmount,
        outputAmount,
      }

      expect(getQuoteWarnings(route, undefined)).toEqual([])
    },
  )

  test('returns UNKNOWN_PRICE for a missing amount', () => {
    const route = pricedRoute({ usdIn: 3000, usdOut: 500 })

    expect(
      getQuoteWarnings({ ...route, requestAmount: '' }, undefined),
    ).toEqual([
      {
        type: 'UNKNOWN_PRICE',
        message: 'The USD value of the input or the output is unknown.',
      },
    ])
    expect(getQuoteWarnings({ ...route, outputAmount: '' }, undefined)).toEqual(
      [
        {
          type: 'UNKNOWN_PRICE',
          message: 'The USD value of the input or the output is unknown.',
        },
      ],
    )
  })

  test.each([
    { name: 'just past -10%', usdIn: 500, usdOut: 450.02, raised: true },
    { name: 'just short of -10%', usdIn: 500, usdOut: 450.03, raised: false },
    { name: 'just past -5%', usdIn: 1000, usdOut: 950.04, raised: true },
    { name: 'just short of -5%', usdIn: 1000, usdOut: 950.06, raised: false },
  ])(
    'rounds the price impact before comparing it with the thresholds, $name',
    ({ usdIn, usdOut, raised }) => {
      expect(
        getQuoteWarnings(pricedRoute({ usdIn, usdOut }), undefined),
      ).toEqual(
        raised
          ? [
              expect.objectContaining({
                type: 'HIGH_VALUE_LOSS',
                message:
                  "The route loses a large share of the input's USD value.",
                metadata: expect.objectContaining({ warningLevel: 'low' }),
              }),
            ]
          : [],
      )
    },
  )

  test('returns UNKNOWN_PRICE when the input asset has no USD price', () => {
    expect(
      getQuoteWarnings(pricedRoute({ usdIn: null, usdOut: 500 }), undefined),
    ).toEqual([
      {
        type: 'UNKNOWN_PRICE',
        message: 'The USD value of the input or the output is unknown.',
      },
    ])
  })

  test('returns UNKNOWN_PRICE when the output asset has no USD price', () => {
    const base = swap()
    const route = {
      requestAmount: '1',
      outputAmount: '500',
      swaps: [swap(), swap({ to: { ...base.to, usdPrice: null } })],
    }

    expect(getQuoteWarnings(route, undefined)).toEqual([
      {
        type: 'UNKNOWN_PRICE',
        message: 'The USD value of the input or the output is unknown.',
      },
    ])
  })

  test('returns UNKNOWN_PRICE for a route with no swaps', () => {
    const route = { requestAmount: '1', outputAmount: '1', swaps: [] }

    expect(getQuoteWarnings(route, undefined)).toEqual([
      {
        type: 'UNKNOWN_PRICE',
        message: 'The USD value of the input or the output is unknown.',
      },
    ])
  })

  test('gives UNKNOWN_PRICE no metadata key', () => {
    const route = { requestAmount: '1', outputAmount: '1', swaps: [] }

    const [warning] = getQuoteWarnings(route, undefined)

    expect(warning).toStrictEqual({
      type: 'UNKNOWN_PRICE',
      message: 'The USD value of the input or the output is unknown.',
    })
    expect(warning).not.toHaveProperty('metadata')
    expect(warning).not.toHaveProperty('data')
  })
})

describe('getQuoteWarnings: fee', () => {
  // A route with no price impact whose swaps charge these fees.
  function charging(...swapFees: SwapFee[][]) {
    const base = swap()
    return {
      requestAmount: '1',
      outputAmount: '3000',
      swaps: swapFees.map((fees) =>
        swap({ to: { ...base.to, usdPrice: 1 }, fee: fees }),
      ),
    }
  }

  test.each([
    { name: 'just below the threshold', amount: '29.99', raised: false },
    { name: 'exactly at the threshold', amount: '30', raised: true },
    { name: 'above the threshold', amount: '45', raised: true },
  ])('HIGH_FEE for a total fee $name', ({ amount, raised }) => {
    const route = charging([fee({ amount, price: 1 })])

    expect(getQuoteWarnings(route, undefined)).toEqual(
      raised
        ? [
            {
              type: 'HIGH_FEE',
              message:
                "The route's total fee is at or above the high-fee threshold.",
              metadata: { totalFee: Number(amount) },
            },
          ]
        : [],
    )
  })

  test('sums the fees in every swap, leaving out fees taken from the output', () => {
    const route = charging(
      [fee({ amount: '20', price: 1 }), fee({ amount: '4', price: 2.5 })],
      [fee({ amount: '15', price: 1, expenseType: 'DECREASE_FROM_OUTPUT' })],
    )
    const belowWithoutOutputFees = charging(
      [fee({ amount: '20', price: 1 })],
      [fee({ amount: '15', price: 1, expenseType: 'DECREASE_FROM_OUTPUT' })],
    )

    expect(getQuoteWarnings(route, undefined)).toEqual([
      {
        type: 'HIGH_FEE',
        message: "The route's total fee is at or above the high-fee threshold.",
        metadata: { totalFee: 30 },
      },
    ])
    expect(getQuoteWarnings(belowWithoutOutputFees, undefined)).toEqual([])
  })

  test('counts a fee with an unknown price as 0', () => {
    const route = charging(
      [fee({ amount: '30', price: 1 })],
      [fee({ amount: '1', price: null })],
    )
    const below = charging(
      [fee({ amount: '29', price: 1 })],
      [fee({ amount: '100', price: null })],
    )

    expect(getQuoteWarnings(route, undefined)).toEqual([
      {
        type: 'HIGH_FEE',
        message: "The route's total fee is at or above the high-fee threshold.",
        metadata: { totalFee: 30 },
      },
    ])
    expect(getQuoteWarnings(below, undefined)).toEqual([])
  })

  test('uses the same fee total for HIGH_VALUE_LOSS and HIGH_FEE', () => {
    const route = {
      ...charging(
        [fee({ amount: '40', price: 1 })],
        [fee({ amount: '100', price: 1, expenseType: 'DECREASE_FROM_OUTPUT' })],
      ),
      outputAmount: '2000',
    }

    expect(getQuoteWarnings(route, undefined)).toMatchObject([
      {
        type: 'HIGH_VALUE_LOSS',
        message: "The route loses a large share of the input's USD value.",
        metadata: { totalFee: 40 },
      },
      {
        type: 'HIGH_FEE',
        message: "The route's total fee is at or above the high-fee threshold.",
        metadata: { totalFee: 40 },
      },
    ])
  })
})

describe('getQuoteWarnings: duration', () => {
  // A route with no price impact of two swaps taking these times.
  function taking(times: { first: number; second: number | null }) {
    const base = swap()
    const priced = { to: { ...base.to, usdPrice: 1 } }
    return {
      requestAmount: '1',
      outputAmount: '3000',
      swaps: [
        swap({ ...priced, estimatedTimeInSeconds: times.first }),
        // The server can omit the time despite the type.
        { ...swap(priced), estimatedTimeInSeconds: times.second as number },
      ],
    }
  }

  test.each([
    {
      name: 'just below the threshold',
      first: 600,
      second: 299,
      total: 899,
      raised: false,
    },
    {
      name: 'exactly at the threshold',
      first: 600,
      second: 300,
      total: 900,
      raised: true,
    },
    {
      name: 'above the threshold',
      first: 600,
      second: 600,
      total: 1200,
      raised: true,
    },
  ])(
    'LONG_DURATION for a total time $name',
    ({ first, second, total, raised }) => {
      expect(getQuoteWarnings(taking({ first, second }), undefined)).toEqual(
        raised
          ? [
              {
                type: 'LONG_DURATION',
                message:
                  "The route's estimated time is at or above the long-duration threshold.",
                metadata: { estimatedTimeInSeconds: total },
              },
            ]
          : [],
      )
    },
  )

  test('counts a swap with no estimated time as 0', () => {
    expect(
      getQuoteWarnings(taking({ first: 900, second: null }), undefined),
    ).toEqual([
      {
        type: 'LONG_DURATION',
        message:
          "The route's estimated time is at or above the long-duration threshold.",
        metadata: { estimatedTimeInSeconds: 900 },
      },
    ])
    expect(
      getQuoteWarnings(taking({ first: 899, second: null }), undefined),
    ).toEqual([])
  })
})

describe('getQuoteWarnings: slippage', () => {
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
      getQuoteWarnings(recommending('2', null, '0.5', '1', '3'), '1'),
    ).toEqual([
      {
        type: 'INSUFFICIENT_SLIPPAGE',
        message: 'The slippage is below the minimum the route requires.',
        metadata: {
          recommendedSlippages: [
            { swapIndex: 0, slippage: '2' },
            { swapIndex: 4, slippage: '3' },
          ],
          minRequiredSlippage: '3',
        },
      },
    ])
  })

  test('returns no slippage warning when the slippage equals the minimum required', () => {
    expect(getQuoteWarnings(recommending('2', '3'), '3')).toEqual([])
  })

  test('returns INSUFFICIENT_SLIPPAGE when a swap reported a slippage error', () => {
    const flagged = pricedRoute(
      { usdIn: 3000, usdOut: 3000 },
      {
        recommendedSlippage: { error: true, slippage: '2' },
      },
    )

    expect(getQuoteWarnings(flagged, '1')).toEqual([
      {
        type: 'INSUFFICIENT_SLIPPAGE',
        message: 'The slippage is below the minimum the route requires.',
        metadata: {
          recommendedSlippages: [{ swapIndex: 0, slippage: '2' }],
          minRequiredSlippage: '2',
        },
      },
    ])
  })

  test('reads slippages with parseFloat', () => {
    expect(getQuoteWarnings(recommending('2'), '1.5%')).toEqual([
      {
        type: 'INSUFFICIENT_SLIPPAGE',
        message: 'The slippage is below the minimum the route requires.',
        metadata: {
          recommendedSlippages: [{ swapIndex: 0, slippage: '2' }],
          minRequiredSlippage: '2',
        },
      },
    ])
    expect(getQuoteWarnings(recommending('1'), '6abc')).toEqual([
      {
        type: 'HIGH_SLIPPAGE',
        message: 'The slippage is above the high-slippage threshold.',
        metadata: { slippage: '6' },
      },
    ])
    expect(getQuoteWarnings(recommending('2abc'), '2')).toEqual([])
  })

  test('returns HIGH_SLIPPAGE when the slippage is above the threshold and the minimum required', () => {
    expect(getQuoteWarnings(recommending('1'), '6')).toEqual([
      {
        type: 'HIGH_SLIPPAGE',
        message: 'The slippage is above the high-slippage threshold.',
        metadata: { slippage: '6' },
      },
    ])
  })

  test('returns HIGH_SLIPPAGE when no swap recommends a slippage', () => {
    expect(getQuoteWarnings(recommending(null), '6')).toEqual([
      {
        type: 'HIGH_SLIPPAGE',
        message: 'The slippage is above the high-slippage threshold.',
        metadata: { slippage: '6' },
      },
    ])
  })

  test('returns no HIGH_SLIPPAGE at the threshold itself', () => {
    expect(getQuoteWarnings(recommending('1'), '5')).toEqual([])
  })

  test('returns INSUFFICIENT_SLIPPAGE, not HIGH_SLIPPAGE, for a high slippage below the minimum required', () => {
    expect(getQuoteWarnings(recommending('7'), '6')).toEqual([
      {
        type: 'INSUFFICIENT_SLIPPAGE',
        message: 'The slippage is below the minimum the route requires.',
        metadata: {
          recommendedSlippages: [{ swapIndex: 0, slippage: '7' }],
          minRequiredSlippage: '7',
        },
      },
    ])
  })

  test.each([undefined, ''])(
    'skips both slippage warnings when the request has no slippage (%j)',
    (slippage) => {
      expect(getQuoteWarnings(recommending('3'), slippage)).toEqual([])
    },
  )

  test('returns every warning that applies', () => {
    const route = pricedRoute(
      { usdIn: 3000, usdOut: 2400 },
      {
        recommendedSlippage: { error: false, slippage: '1' },
      },
    )

    expect(getQuoteWarnings(route, '6').map((warning) => warning.type)).toEqual(
      ['HIGH_VALUE_LOSS', 'HIGH_SLIPPAGE'],
    )
  })

  test('builds each warning as a plain { type, message, metadata } object', () => {
    const route = pricedRoute(
      { usdIn: 3000, usdOut: 2400 },
      {
        recommendedSlippage: { error: false, slippage: '1' },
        fee: [fee()],
        estimatedTimeInSeconds: 900,
      },
    )

    const warnings = getQuoteWarnings(route, '6')

    expect(warnings.map((warning) => warning.type)).toEqual([
      'HIGH_VALUE_LOSS',
      'HIGH_SLIPPAGE',
      'HIGH_FEE',
      'LONG_DURATION',
    ])
    for (const warning of warnings) {
      expect(Object.keys(warning).sort()).toEqual([
        'message',
        'metadata',
        'type',
      ])
      expect(Object.getPrototypeOf(warning)).toBe(Object.prototype)
    }
    expect(JSON.parse(JSON.stringify(warnings))).toStrictEqual(warnings)
    expect(structuredClone(warnings)).toStrictEqual(warnings)
  })
})

describe('getBalanceWarnings', () => {
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

    expect(getBalanceWarnings(validationStatus)).toEqual([
      {
        type: 'INSUFFICIENT_BALANCE',
        message: "A wallet doesn't hold enough of an asset.",
        metadata: {
          blockchain: 'BSC',
          address: '0xbsc',
          asset: USDC,
          required: { amount: '5000000', decimals: 6 },
          current: { amount: '1000000', decimals: 6 },
          reason: 'INPUT_ASSET',
        },
      },
      {
        type: 'INSUFFICIENT_BALANCE',
        message: "A wallet doesn't hold enough of an asset.",
        metadata: {
          blockchain: 'ETH',
          address: '0xeth',
          asset: ETH,
          required: { amount: '3', decimals: 18 },
          current: { amount: '0', decimals: 18 },
          reason: 'FEE_AND_INPUT_ASSET',
        },
      },
    ])
  })

  test('returns no warnings without a validation status', () => {
    expect(getBalanceWarnings(null)).toEqual([])
    expect(getBalanceWarnings([])).toEqual([])
  })
})

// Edge cases of the warning helpers.
describe('helper edge cases', () => {
  test.each([
    { name: 'a loss', input: '100', output: '90', expected: -10 },
    { name: 'no change', input: '100', output: '100', expected: null },
    { name: 'a gain', input: '100', output: '110', expected: null },
    { name: 'a zero input', input: '0', output: '90', expected: null },
    { name: 'a zero output', input: '100', output: '0', expected: null },
    { name: 'a negative output', input: '100', output: '-5', expected: null },
    { name: 'a NaN input', input: 'NaN', output: '90', expected: null },
    { name: 'a NaN output', input: '100', output: 'NaN', expected: null },
  ])(
    'getPriceImpact gives $expected for $name',
    ({ input, output, expected }) => {
      expect(getPriceImpact(input, output)).toBe(expected)
    },
  )

  test.each([
    { name: 'a loss', input: '100', output: '90', expected: -10 },
    { name: 'a zero output', input: '100', output: '0', expected: null },
    { name: 'a missing input', input: null, output: '90', expected: null },
  ])(
    'getPriceImpact gives $expected for $name as BigNumber values',
    ({ input, output, expected }) => {
      expect(
        getPriceImpact(
          input === null ? null : new BigNumber(input),
          new BigNumber(output),
        ),
      ).toBe(expected)
    },
  )

  test.each([
    { priceImpact: -2.99, expected: undefined },
    { priceImpact: -3, expected: 'low' },
    { priceImpact: -9.99, expected: 'low' },
    { priceImpact: -10, expected: 'high' },
    { priceImpact: -50, expected: 'high' },
  ] as const)(
    'getPriceImpactLevel gives $expected for $priceImpact',
    ({ priceImpact, expected }) => {
      expect(getPriceImpactLevel(priceImpact)).toBe(expected)
    },
  )

  test.each([
    { priceImpact: -9.994, inputUsdValue: 400, expected: false },
    { priceImpact: -9.996, inputUsdValue: 400, expected: true },
    { priceImpact: -10.99, inputUsdValue: 400, expected: true },
    { priceImpact: -10, inputUsdValue: 399, expected: false },
    { priceImpact: -4.994, inputUsdValue: 1000, expected: false },
    { priceImpact: -4.996, inputUsdValue: 1000, expected: true },
    { priceImpact: -5, inputUsdValue: 999, expected: false },
  ])(
    'hasHighValueLoss gives $expected for $priceImpact on $inputUsdValue USD',
    ({ priceImpact, inputUsdValue, expected }) => {
      expect(hasHighValueLoss(new BigNumber(inputUsdValue), priceImpact)).toBe(
        expected,
      )
    },
  )

  test('hasHighValueLoss gives false without an input value', () => {
    const priceImpact = -20

    expect(hasHighValueLoss(null, priceImpact)).toBe(false)
  })

  test.each([
    { input: '0.3', output: '0.1', expected: -66.66666666666667 },
    { input: '3000', output: '2940', expected: -2 },
    { input: '0', output: '1', expected: Infinity },
    { input: '0', output: '0', expected: NaN },
  ])(
    'getPercentageChange computes $input to $output in BigNumber',
    ({ input, output, expected }) => {
      expect(getPercentageChange(input, output)).toBe(expected)
    },
  )
})
