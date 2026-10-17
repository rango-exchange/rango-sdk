import type { SwapResult } from 'rango-sdk'

import { describe, expect, test } from 'vitest'

import { getOutputChangeWarnings } from './warnings.js'

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

describe('getOutputChangeWarnings', () => {
  test('warns when the output drops by at least 1% on an input of at least 1000 USD', () => {
    expect(
      getOutputChangeWarnings(
        pricedRoute({ usdIn: 3000, usdOut: 3000 }),
        pricedRoute({ usdIn: 3000, usdOut: 2940 }),
      ),
    ).toEqual([
      {
        type: 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE',
        message:
          'The confirmed output is worth much less than the quoted output.',
        metadata: { usdValueChange: -60, percentageChange: -2 },
      },
    ])
  })

  test('warns at exactly the threshold and the minimum input', () => {
    expect(
      getOutputChangeWarnings(
        pricedRoute({ usdIn: 1000, usdOut: 1000 }),
        pricedRoute({ usdIn: 1000, usdOut: 990 }),
      ),
    ).toEqual([
      {
        type: 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE',
        message:
          'The confirmed output is worth much less than the quoted output.',
        metadata: { usdValueChange: -10, percentageChange: -1 },
      },
    ])
  })

  test('uses the -2% entry for inputs between 500 and 1000 USD', () => {
    const quote = pricedRoute({ usdIn: 600, usdOut: 600 })

    expect(
      getOutputChangeWarnings(quote, pricedRoute({ usdIn: 600, usdOut: 591 })),
    ).toEqual([])
    expect(
      getOutputChangeWarnings(quote, pricedRoute({ usdIn: 600, usdOut: 585 })),
    ).toEqual([
      {
        type: 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE',
        message:
          'The confirmed output is worth much less than the quoted output.',
        metadata: { usdValueChange: -15, percentageChange: -2.5 },
      },
    ])
  })

  test('does not warn below every minimum input', () => {
    expect(
      getOutputChangeWarnings(
        pricedRoute({ usdIn: 400, usdOut: 400 }),
        pricedRoute({ usdIn: 400, usdOut: 200 }),
      ),
    ).toEqual([])
  })

  test('does not warn when the output grows', () => {
    expect(
      getOutputChangeWarnings(
        pricedRoute({ usdIn: 3000, usdOut: 3000 }),
        pricedRoute({ usdIn: 3000, usdOut: 3100 }),
      ),
    ).toEqual([])
  })

  test('does not warn when a USD value is unknown', () => {
    expect(
      getOutputChangeWarnings(
        pricedRoute({ usdIn: null, usdOut: 3000 }),
        pricedRoute({ usdIn: null, usdOut: 2000 }),
      ),
    ).toEqual([])
  })

  test('takes the input value from the Quote, not the Route', () => {
    const quote = pricedRoute({ usdIn: 3000, usdOut: 3000 })
    const route = { ...pricedRoute({ usdIn: 3000, usdOut: 2940 }) }

    expect(
      getOutputChangeWarnings(quote, { ...route, requestAmount: '0.1' }),
    ).toHaveLength(1)
    expect(
      getOutputChangeWarnings({ ...quote, requestAmount: '0.1' }, route),
    ).toEqual([])
  })
})
