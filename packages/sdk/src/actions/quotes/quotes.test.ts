import type * as Sdk from '../../mod.js'

import * as LegacySdk from 'rango-sdk'
import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

const legacy = vi.hoisted(() => {
  const constructorArgs: unknown[][] = []
  return { constructorArgs, getAllRoutes: vi.fn() }
})

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    getAllRoutes = legacy.getAllRoutes
    constructor(...args: unknown[]) {
      legacy.constructorArgs.push(args)
    }
  },
}))

async function loadSdk(): Promise<typeof Sdk> {
  return import('../../mod.js')
}

const ETH = { blockchain: 'ETH', symbol: 'ETH', address: null }
const USDC = {
  blockchain: 'BSC',
  symbol: 'USDC',
  address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
}

const req: Sdk.QuotesReq = { slippage: '1.5', swappers: ['Across'] }

// What the server gets for `quotes(ETH, USDC, '1', { req })`.
const request: LegacySdk.MultiRouteRequest = {
  from: ETH,
  to: USDC,
  amount: '1',
  ...req,
}

function swap(overrides: Partial<Sdk.SwapResult> = {}): Sdk.SwapResult {
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
    to: { ...asset, blockchain: 'BSC', symbol: 'USDC', usdPrice: 1 },
    toAmount: '3000',
    fromAmount: '1',
    fromAmountMaxValue: '10',
    fromAmountMinValue: '0.1',
    fromAmountPrecision: null,
    fromAmountRestrictionType: 'INCLUSIVE',
    routes: null,
    internalSwaps: null,
    fee: [],
    estimatedTimeInSeconds: 60,
    timeStat: null,
    includesDestinationTx: false,
    maxRequiredSign: 1,
    recommendedSlippage: { error: false, slippage: '1' },
    warnings: [],
    ...overrides,
  }
}

const result: LegacySdk.MultiRouteSimulationResult = {
  requestId: 'request-1',
  outputAmount: '3000',
  resultType: LegacySdk.RoutingResultType.OK,
  swaps: [swap()],
  scores: [{ preferenceType: 'FEE', score: 90 }],
  tags: [{ label: 'Recommended', value: 'RECOMMENDED' }],
  missingBlockchains: [],
  walletNotSupportingFromBlockchain: false,
}

function response(overrides: Partial<LegacySdk.MultiRouteResponse> = {}) {
  return {
    from: ETH,
    to: USDC,
    requestAmount: '1',
    routeId: 'route-1',
    results: [result],
    diagnosisMessages: [],
    error: null,
    errorCode: null,
    traceId: null,
    ...overrides,
  } satisfies LegacySdk.MultiRouteResponse
}

const BAD_REQUEST = 400
const UNAUTHORIZED = 401
const TOO_MANY_REQUESTS = 429
const SERVER_ERROR = 500

function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with ${status}`), {
    response: { status, data },
  })
}

function sentBody() {
  return legacy.getAllRoutes.mock.lastCall?.[0]
}

describe('quotes', () => {
  beforeEach(() => {
    vi.resetModules()
    legacy.constructorArgs.length = 0
    legacy.getAllRoutes.mockReset()
    legacy.getAllRoutes.mockResolvedValue(response())
  })

  test('builds the legacy client with the configured API key and base URL', async () => {
    const { RangoClient } = await loadSdk()

    new RangoClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
    })

    expect(legacy.constructorArgs).toEqual([
      ['test-key', 'https://example.test'],
    ])
  })

  test('builds the legacy client with the default base URL when none is given', async () => {
    const { RangoClient } = await loadSdk()

    new RangoClient({ apiKey: 'test-key' })

    expect(legacy.constructorArgs).toEqual([
      ['test-key', 'https://api.rango.exchange'],
    ])
  })

  test('sends the request with the affiliate fields as given and the signal', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const controller = new AbortController()
    const affiliate = {
      affiliateRef: 'REF',
      affiliatePercent: 0.2,
      affiliateWallets: { ETH: '0xaff' },
    }

    await client.quotes(ETH, USDC, '1', {
      req: { ...req, ...affiliate },
      signal: controller.signal,
    })

    expect(sentBody()).toEqual({ ...request, ...affiliate })
    expect(legacy.getAllRoutes.mock.lastCall?.[1]).toEqual({
      signal: controller.signal,
    })
  })

  test('sends from, to and amount alone when called without options', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })

    await client.quotes(ETH, USDC, '1')

    expect(legacy.getAllRoutes.mock.lastCall).toEqual([
      { from: ETH, to: USDC, amount: '1' },
      { signal: undefined },
    ])
  })

  test('rejects from, to and amount in options.req, and the one-object call', () => {
    const misuse = async (client: Sdk.RangoClient) => {
      // @ts-expect-error from is an argument
      await client.quotes(ETH, USDC, '1', { req: { from: ETH } })
      // @ts-expect-error to is an argument
      await client.quotes(ETH, USDC, '1', { req: { to: USDC } })
      // @ts-expect-error amount is an argument
      await client.quotes(ETH, USDC, '1', { req: { amount: '2' } })
      // @ts-expect-error request fields don't sit flat in the options
      await client.quotes(ETH, USDC, '1', { slippage: '1' })
      // @ts-expect-error the one-object call is replaced
      await client.quotes(request)
    }

    expectTypeOf(misuse).toBeFunction()
    expectTypeOf<Sdk.QuotesReq>().toEqualTypeOf<
      Omit<LegacySdk.MultiRouteRequest, 'from' | 'to' | 'amount'>
    >()
  })

  test('sends no affiliate fields when the request has none', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })

    await client.quotes(ETH, USDC, '1', { req })

    expect(sentBody()).toEqual(request)
  })

  test('sends each request with its own affiliate', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })

    await client.quotes(ETH, USDC, '1', {
      req: { ...req, affiliateRef: 'OLD', affiliatePercent: 0.1 },
    })
    await client.quotes(ETH, USDC, '1', {
      req: { ...req, affiliateRef: 'NEW' },
    })

    expect(sentBody()).toEqual({ ...request, affiliateRef: 'NEW' })
  })

  test('returns data (the response without its error fields and results, with an entry per Quote) and _response as received', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const success = response({
      diagnosisMessages: ['Some swappers are down'],
      traceId: 12,
    })
    legacy.getAllRoutes.mockResolvedValue(success)

    const quotes = await client.quotes(ETH, USDC, '1', { req })

    expect(quotes).toEqual({
      data: {
        from: ETH,
        to: USDC,
        requestAmount: '1',
        routeId: 'route-1',
        quotes: [
          {
            data: { ...result, requestAmount: '1', to: USDC, slippage: '1.5' },
            warnings: [],
          },
        ],
        diagnosisMessages: ['Some swappers are down'],
      },
      _response: success,
    })
    expect(quotes._response).toBe(success)
    expect(quotes.data).not.toHaveProperty('results')
    expect(quotes.data).not.toHaveProperty('traceId')
    expect(quotes).not.toHaveProperty('error')
    expect(quotes.data.quotes[0]).not.toHaveProperty('error')
    expectTypeOf(quotes).toEqualTypeOf<Sdk.QuotesResult>()
    expectTypeOf(quotes.data).toEqualTypeOf<Sdk.QuotesData>()
    expectTypeOf(quotes.data.quotes).toEqualTypeOf<Sdk.QuoteEntry[]>()
  })

  test('types the result with no error field and the legacy response as _response', () => {
    expectTypeOf<Sdk.QuotesResult>().not.toHaveProperty('error')
    expectTypeOf<Sdk.QuotesResult>().not.toHaveProperty('warnings')
    expectTypeOf<
      Sdk.QuotesResult['_response']
    >().toEqualTypeOf<LegacySdk.MultiRouteResponse>()
  })

  test('fills nothing in from the request when the response leaves fields out', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const {
      from: _from,
      to: _to,
      requestAmount: _amount,
      ...partial
    } = response()
    legacy.getAllRoutes.mockResolvedValue(partial)

    const { data } = await client.quotes(ETH, USDC, '1', { req })

    expect(data).not.toHaveProperty('from')
    expect(data).not.toHaveProperty('to')
    expect(data).not.toHaveProperty('requestAmount')
    expect(data.quotes[0]?.data.to).toBeUndefined()
    expect(data.quotes[0]?.data.requestAmount).toBeUndefined()
  })

  test("gives each Quote the response's requestAmount and to, and the request's slippage", async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValue(
      response({
        requestAmount: '2',
        results: [
          { ...result, requestId: 'first' },
          { ...result, requestId: 'second' },
        ],
      }),
    )

    const { data } = await client.quotes(ETH, USDC, '1', {
      req: { ...req, slippage: '3' },
    })

    expect(data.requestAmount).toBe('2')
    expect(data.to).toEqual(USDC)
    for (const entry of data.quotes) {
      expect(entry.data).toMatchObject({
        requestAmount: '2',
        to: USDC,
        slippage: '3',
      })
    }
  })

  test('gives a Quote no slippage key when the request had no slippage', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const { slippage: _, ...withoutSlippage } = req

    const quotes = (
      await client.quotes(ETH, USDC, '1', { req: withoutSlippage })
    ).data.quotes

    expect(quotes[0]?.data).not.toHaveProperty('slippage')
  })

  test('a Quote has no error or warnings', () => {
    expectTypeOf<Sdk.Quote>().not.toHaveProperty('error')
    expectTypeOf<Sdk.Quote>().not.toHaveProperty('warnings')
  })

  test('attaches the first SdkError to each unusable entry, in the server order, and still returns the others', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const baseSwap = swap()
    const tooSmall = swap({ fromAmountMinValue: '2' })
    const amountResult = {
      ...result,
      requestId: 'amount',
      swaps: [baseSwap, tooSmall],
    }
    const slippageResult = {
      ...result,
      requestId: 'slippage',
      swaps: [
        {
          ...baseSwap,
          recommendedSlippage: { error: true, slippage: '4' },
        },
      ],
    }
    const flaggedTooSmall = {
      ...tooSmall,
      recommendedSlippage: { error: true, slippage: '4' },
    }
    const bothResult = {
      ...result,
      requestId: 'both',
      swaps: [flaggedTooSmall],
    }
    legacy.getAllRoutes.mockResolvedValue(
      response({
        results: [
          { ...result, requestId: 'ok', swaps: [baseSwap] },
          amountResult,
          slippageResult,
          bothResult,
        ],
      }),
    )

    const quotes = (await client.quotes(ETH, USDC, '1', { req })).data.quotes

    expect(quotes.map((entry) => entry.data.requestId)).toEqual([
      'ok',
      'amount',
      'slippage',
      'both',
    ])
    expect(quotes[0]).not.toHaveProperty('error')
    expect(quotes.find((entry) => !entry.error)?.data.requestId).toBe('ok')
    expect(quotes[1]?.error).toBeInstanceOf(SdkError)
    expect(quotes[1]?.error).toMatchObject({
      type: 'BRIDGE_LIMIT',
      metadata: { swap: tooSmall, limit: 'MIN' },
    })
    expect(quotes[1]?.error).toHaveProperty('metadata', {
      swap: tooSmall,
      limit: 'MIN',
      limitValue: '2',
      exclusive: false,
    })
    expect(quotes[2]?.error).toBeInstanceOf(SdkError)
    expect(quotes[2]?.error).toMatchObject({
      type: 'UNKNOWN_SLIPPAGE',
    })
    expect(quotes[2]?.error).not.toHaveProperty('metadata')
    // The flagged entry keeps its warnings next to the error.
    expect(quotes[2]?.warnings).toEqual([
      {
        type: 'INSUFFICIENT_SLIPPAGE',
        message: 'The slippage is below the minimum the route requires.',
        metadata: {
          recommendedSlippages: [{ swapIndex: 0, slippage: '4' }],
          minRequiredSlippage: '4',
        },
      },
    ])
    // Failing both checks, the entry carries only the first error.
    const both = quotes.find((entry) => entry.data.requestId === 'both')
    expect(both?.error).toMatchObject({
      type: 'BRIDGE_LIMIT',
      metadata: { swap: flaggedTooSmall, limit: 'MIN' },
    })
    expect(both?.warnings).toHaveLength(1)
  })

  test('gives each Quote its own balance-independent warnings', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const unpriced = swap()
    unpriced.to = { ...unpriced.to, usdPrice: null }
    legacy.getAllRoutes.mockResolvedValue(
      response({
        results: [
          { ...result, requestId: 'clean' },
          {
            ...result,
            requestId: 'loss',
            outputAmount: '2400',
            swaps: [swap({ toAmount: '2400' })],
          },
          { ...result, requestId: 'unpriced', swaps: [unpriced] },
          {
            ...result,
            requestId: 'slippage',
            swaps: [
              swap({ recommendedSlippage: { error: false, slippage: '2' } }),
            ],
          },
        ],
      }),
    )

    const quotes = (await client.quotes(ETH, USDC, '1', { req })).data.quotes

    expect(
      quotes.map(({ data, warnings }) => [data.requestId, warnings]),
    ).toEqual([
      ['clean', []],
      [
        'loss',
        [
          {
            type: 'HIGH_VALUE_LOSS',
            message: "The route loses a large share of the input's USD value.",
            metadata: {
              inputUsdValue: 3000,
              outputUsdValue: 2400,
              priceImpact: -20,
              totalFee: 0,
              warningLevel: 'high',
            },
          },
        ],
      ],
      [
        'unpriced',
        [
          {
            type: 'UNKNOWN_PRICE',
            message: 'The USD value of the input or the output is unknown.',
          },
        ],
      ],
      [
        'slippage',
        [
          {
            type: 'INSUFFICIENT_SLIPPAGE',
            message: 'The slippage is below the minimum the route requires.',
            metadata: {
              recommendedSlippages: [{ swapIndex: 0, slippage: '2' }],
              minRequiredSlippage: '2',
            },
          },
        ],
      ],
    ])
    expectTypeOf<Sdk.QuoteEntry['warnings']>().toEqualTypeOf<Sdk.SdkWarning[]>()
  })

  test('raises HIGH_SLIPPAGE above the threshold', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })

    const atThreshold = await client.quotes(ETH, USDC, '1', {
      req: { ...req, slippage: '5' },
    })
    const above = await client.quotes(ETH, USDC, '1', {
      req: { ...req, slippage: '6' },
    })

    expect(atThreshold.data.quotes[0]?.warnings).toEqual([])
    expect(above.data.quotes[0]?.warnings).toEqual([
      {
        type: 'HIGH_SLIPPAGE',
        message: 'The slippage is above the high-slippage threshold.',
        metadata: { slippage: '6' },
      },
    ])
  })

  test('takes only req and signal as options', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })

    expectTypeOf(client.quotes).parameters.toEqualTypeOf<
      [
        Sdk.Asset,
        Sdk.Asset,
        string,
        ({ req?: Sdk.QuotesReq; signal?: AbortSignal } | undefined)?,
      ]
    >()
  })

  test('raises HIGH_FEE and LONG_DURATION at the default thresholds', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const networkFee: Sdk.SwapResult['fee'][number] = {
      name: 'Network Fee',
      expenseType: 'FROM_SOURCE_WALLET',
      asset: ETH,
      amount: '5',
      price: 3,
      meta: null,
    }
    legacy.getAllRoutes.mockResolvedValue(
      response({
        results: [
          {
            ...result,
            swaps: [
              swap({ fee: [networkFee], estimatedTimeInSeconds: 600 }),
              swap({ fee: [networkFee], estimatedTimeInSeconds: 300 }),
            ],
          },
        ],
      }),
    )

    const quotes = (await client.quotes(ETH, USDC, '1', { req })).data.quotes

    expect(quotes[0]?.warnings).toEqual([
      {
        type: 'HIGH_FEE',
        message: "The route's total fee is at or above the high-fee threshold.",
        metadata: { totalFee: 30 },
      },
      {
        type: 'LONG_DURATION',
        message:
          "The route's estimated time is at or above the long-duration threshold.",
        metadata: { estimatedTimeInSeconds: 900 },
      },
    ])
  })

  test('skips the slippage warnings when the request has no slippage', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValue(
      response({
        results: [
          {
            ...result,
            swaps: [
              swap({ recommendedSlippage: { error: false, slippage: '2' } }),
            ],
          },
        ],
      }),
    )
    const { slippage: _, ...withoutSlippage } = req

    const quotes = (
      await client.quotes(ETH, USDC, '1', { req: withoutSlippage })
    ).data.quotes

    expect(quotes[0]?.warnings).toEqual([])
  })

  test('attaches NO_RESULT without a diagnosis message to a Quote with no swaps', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValue(
      response({
        results: [
          { ...result, requestId: 'empty', swaps: [] },
          { ...result, requestId: 'ok' },
        ],
        diagnosisMessages: ['Some swappers are down'],
      }),
    )

    const quotes = (await client.quotes(ETH, USDC, '1', { req })).data.quotes

    expect(quotes.map((entry) => entry.data.requestId)).toEqual(['empty', 'ok'])
    expect(quotes[0]?.error).toBeInstanceOf(SdkError)
    expect(quotes[0]?.error).toMatchObject({
      type: 'NO_RESULT',
      metadata: {},
    })
    expect(quotes[0]?.error?.metadata).not.toHaveProperty('diagnosisMessage')
    // With no swaps there is no USD price, and the warnings are still computed.
    expect(quotes[0]?.warnings).toEqual([
      {
        type: 'UNKNOWN_PRICE',
        message: 'The USD value of the input or the output is unknown.',
      },
    ])
    expect(quotes[1]).not.toHaveProperty('error')
  })

  test('throws REQUEST_FAILED with the original as cause for a TypeError from checking a Quote', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const unexpected = new TypeError('unreadable limit')
    const unreadable = Object.defineProperty(swap(), 'fromAmountMinValue', {
      get() {
        throw unexpected
      },
    })
    legacy.getAllRoutes.mockResolvedValue(
      response({ results: [{ ...result, swaps: [unreadable] }] }),
    )

    const error = await client
      .quotes(ETH, USDC, '1', { req })
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({ type: 'REQUEST_FAILED', cause: unexpected })
  })

  test('throws REQUEST_FAILED with the original as cause for a TypeError inside the pipeline', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValue(null)

    const error = await client
      .quotes(ETH, USDC, '1', { req })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toHaveProperty('type', 'REQUEST_FAILED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('throws REQUEST_CANCELED for a TypeError inside the pipeline when the signal was aborted', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const controller = new AbortController()
    legacy.getAllRoutes.mockImplementation(async () => {
      controller.abort()
      return null
    })

    const error = await client
      .quotes(ETH, USDC, '1', { req, signal: controller.signal })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toHaveProperty('type', 'REQUEST_CANCELED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('rejects with an SdkError raised inside the pipeline unchanged, even when the signal was aborted', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const controller = new AbortController()
    const raised = new SdkError('NO_RESULT', 'Raised inside', { metadata: {} })
    legacy.getAllRoutes.mockImplementation(async () => {
      controller.abort()
      throw raised
    })

    const error = await client
      .quotes(ETH, USDC, '1', { req, signal: controller.signal })
      .catch((e: unknown) => e)

    expect(error).toBe(raised)
  })

  test('rejects with the SdkError a result check throws, even when the signal was aborted', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const controller = new AbortController()
    const empty = response({ results: [] })
    legacy.getAllRoutes.mockImplementation(async () => {
      controller.abort()
      return empty
    })

    const error = await client
      .quotes(ETH, USDC, '1', { req, signal: controller.signal })
      .catch((e: unknown) => e)

    expect(error).toMatchObject({ type: 'NO_RESULT' })
  })

  test.each<
    [
      string,
      { from?: Sdk.Asset; to?: Sdk.Asset; amount?: string },
      string,
      string,
    ]
  >([
    ['to is the same asset as from', { to: { ...ETH } }, 'to', 'SAME_ASSET'],
    [
      'to has the same blockchain, symbol and address as from',
      { from: USDC, to: { ...USDC } },
      'to',
      'SAME_ASSET',
    ],
    [
      'to is the same asset and the amount is not a number',
      { to: { ...ETH }, amount: 'x' },
      'to',
      'SAME_ASSET',
    ],
    ['the amount is not a number', { amount: '' }, 'amount', 'NOT_A_NUMBER'],
    ['the amount is 0', { amount: '0' }, 'amount', 'NOT_POSITIVE'],
    ['the amount is negative', { amount: '-1' }, 'amount', 'NOT_POSITIVE'],
  ])(
    'throws INVALID_INPUT without sending a request when %s',
    async (_, overrides, field, reason) => {
      const { RangoClient, SdkError } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
      })

      const error = await client
        .quotes(
          overrides.from ?? ETH,
          overrides.to ?? USDC,
          overrides.amount ?? '1',
          { req },
        )
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(SdkError)
      expect(error).toHaveProperty('name', 'SdkError')
      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field, reason },
      })
      expect(legacy.getAllRoutes).not.toHaveBeenCalled()
    },
  )

  test.each([
    ['blockchain', { ...ETH, blockchain: 'ARBITRUM' }],
    ['symbol', { ...ETH, symbol: 'WETH' }],
    ['address', { ...ETH, address: '0x1' }],
  ])('sends a request whose assets differ only by %s', async (_, to) => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })

    await client.quotes(ETH, to, '1', { req })

    expect(legacy.getAllRoutes).toHaveBeenCalledOnce()
  })

  test.each(['abc', '0', '100'])(
    'sends the slippage %j as it is',
    async (slippage) => {
      const { RangoClient } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
      })

      await client.quotes(ETH, USDC, '1', { req: { ...req, slippage } })

      expect(legacy.getAllRoutes).toHaveBeenCalledWith(
        { ...request, slippage },
        expect.anything(),
      )
    },
  )

  test('throws BAD_REQUEST with the body error message for an HTTP 400', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const badRequest = httpError(BAD_REQUEST, {
      error: 'Amount is too small',
      errorCode: 1,
      traceId: 2,
    })
    legacy.getAllRoutes.mockRejectedValue(badRequest)

    const error = await client
      .quotes(ETH, USDC, '1', { req })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({
      message: 'Amount is too small',
      type: 'BAD_REQUEST',
      cause: badRequest,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test.each([
    ['an empty', []],
    ['a null', null],
  ])(
    'throws NO_RESULT with the first diagnosis message for %s result list',
    async (_, results) => {
      const { RangoClient, SdkError } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
      })
      const noResults = response({
        results: results as LegacySdk.MultiRouteSimulationResult[],
        diagnosisMessages: ['No route', 'Try another amount'],
      })
      legacy.getAllRoutes.mockResolvedValue(noResults)

      const error = await client
        .quotes(ETH, USDC, '1', { req })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(SdkError)
      expect(error).toMatchObject({
        message: 'No result was found for this request.',
        type: 'NO_RESULT',
        metadata: { diagnosisMessage: 'No route' },
      })
    },
  )

  test.each([
    ['an empty', []],
    ['a null', null],
  ])(
    'throws NO_RESULT without a diagnosis message for %s result list with no diagnosis',
    async (_, results) => {
      const { RangoClient } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
      })
      legacy.getAllRoutes.mockResolvedValue(
        response({
          results: results as LegacySdk.MultiRouteSimulationResult[],
          diagnosisMessages: [],
        }),
      )

      const error = await client
        .quotes(ETH, USDC, '1', { req })
        .catch((e: unknown) => e)

      expect(error).toMatchObject({ type: 'NO_RESULT', metadata: {} })
      expect((error as Sdk.SdkError).metadata).not.toHaveProperty(
        'diagnosisMessage',
      )
    },
  )

  test('throws REQUEST_CANCELED when the signal aborts the request, even for an HTTP 400', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const controller = new AbortController()
    const canceled = httpError(BAD_REQUEST, { error: 'canceled' })
    legacy.getAllRoutes.mockImplementation(async () => {
      controller.abort()
      throw canceled
    })

    const error = await client
      .quotes(ETH, USDC, '1', { req, signal: controller.signal })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({ type: 'REQUEST_CANCELED', cause: canceled })
  })

  test.each([
    [UNAUTHORIZED, 'UNAUTHORIZED'],
    [TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS'],
    [SERVER_ERROR, 'SERVER_ERROR'],
  ])(
    'throws an HTTP %i as %s with the body error message, keeping the cause',
    async (status, type) => {
      const { RangoClient, SdkError } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
      })
      const failure = httpError(status, {
        error: 'Failed',
        errorCode: 42,
        traceId: 7,
      })
      legacy.getAllRoutes.mockRejectedValue(failure)

      const error = await client
        .quotes(ETH, USDC, '1', { req })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(SdkError)
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({
        message: 'Failed',
        type,
        cause: failure,
      })
      expect(error).not.toHaveProperty('metadata')
    },
  )

  test('throws REQUEST_FAILED without metadata for a network failure', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const networkError = new Error('Network Error')
    legacy.getAllRoutes.mockRejectedValue(networkError)

    const error = await client
      .quotes(ETH, USDC, '1', { req })
      .catch((e: unknown) => e)

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      cause: networkError,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED when the response has an error, keeping the response as the cause', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const failed = response({
      results: [],
      error: 'Invalid asset',
      errorCode: 1001,
      traceId: 99,
    })
    legacy.getAllRoutes.mockResolvedValue(failed)

    const error = await client
      .quotes(ETH, USDC, '1', { req })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toMatchObject({
      message: 'Invalid asset',
      type: 'REQUEST_FAILED',
      cause: failed,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('narrows a caught error with instanceof, then metadata on type', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockRejectedValue(new Error('Network Error'))

    let type: unknown
    try {
      await client.quotes(ETH, USDC, '1', { req })
    } catch (error) {
      if (!(error instanceof SdkError)) {
        throw error
      }
      type = error.type
      if (error.type === 'REQUEST_FAILED') {
        expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
      } else if (error.type === 'NO_RESULT') {
        expectTypeOf(error.metadata).toEqualTypeOf<Sdk.NoResultMetadata>()
      } else if (error.type === 'INVALID_INPUT') {
        expectTypeOf(error.metadata).toEqualTypeOf<Sdk.InvalidInputMetadata>()
      } else if (error.type === 'BRIDGE_LIMIT') {
        expectTypeOf(error.metadata).toEqualTypeOf<Sdk.BridgeLimitMetadata>()
      } else {
        expectTypeOf(error.type).toEqualTypeOf<
          | 'REQUEST_CANCELED'
          | 'BAD_REQUEST'
          | 'UNAUTHORIZED'
          | 'FORBIDDEN'
          | 'NOT_FOUND'
          | 'TOO_MANY_REQUESTS'
          | 'SERVER_ERROR'
          | 'UNKNOWN_SLIPPAGE'
        >()
        expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
      }
    }
    expect(type).toBe('REQUEST_FAILED')
  })

  test('throws every error as an SdkError named SdkError', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockRejectedValue(new Error('Network Error'))

    const error = await client
      .quotes(ETH, USDC, '1', { req })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SdkError)
    expect(error).toBeInstanceOf(Error)
    expect(error).toHaveProperty('name', 'SdkError')
  })

  test("types an entry's error as an optional SdkError", () => {
    expectTypeOf<Sdk.QuoteEntry['error']>().toEqualTypeOf<
      Sdk.SdkError | undefined
    >()
    expectTypeOf<{
      data: Sdk.Quote
      warnings: Sdk.SdkWarning[]
    }>().toExtend<Sdk.QuoteEntry>()
  })
})

describe('quotes cache', () => {
  beforeEach(() => {
    vi.resetModules()
    legacy.getAllRoutes.mockReset()
  })

  test('has no quotes map before the first successful call', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })

    expect(client.cache.get('quotes')).toBeUndefined()
  })

  test("caches every Quote under the response's route ID, then its request ID, including one whose entry has an error, without its warnings or error", async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValue(
      response({
        routeId: 'route-a',
        results: [
          { ...result, requestId: 'ok' },
          {
            ...result,
            requestId: 'too-small',
            swaps: [swap({ fromAmountMinValue: '2' })],
          },
        ],
      }),
    )

    const { data } = await client.quotes(ETH, USDC, '1', { req })

    expect(data.quotes[1]?.error).toBeDefined()
    const routes = client.cache.get('quotes')
    expect([...(routes?.keys() ?? [])]).toEqual([data.routeId])
    const quotes = routes?.get('route-a')
    expect([...(quotes?.keys() ?? [])]).toEqual(['ok', 'too-small'])
    for (const entry of data.quotes) {
      const cached = quotes?.get(entry.data.requestId)
      expect(cached).toEqual(entry.data)
      expect(cached).not.toBe(entry.data)
      expect(cached).not.toHaveProperty('warnings')
      expect(cached).not.toHaveProperty('error')
    }
  })

  test('keeps the cached Quote unchanged when the app mutates the Quote quotes() returned, nested values included', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    // Objects of its own, since the returned Quote shares them with the response.
    legacy.getAllRoutes.mockResolvedValue(
      response({
        to: { ...USDC },
        results: [{ ...result, swaps: [swap()], scores: [...result.scores] }],
      }),
    )
    const { data } = await client.quotes(ETH, USDC, '1', { req })
    const returned = data.quotes[0]?.data
    if (!returned) {
      throw new Error('quotes() returned no Quote')
    }
    const before = structuredClone(returned)

    returned.requestId = 'mutated'
    returned.slippage = '99'
    returned.to.blockchain = 'X'
    const [firstSwap] = returned.swaps
    if (firstSwap) {
      firstSwap.toAmount = '0'
    }
    returned.scores.length = 0

    expect(
      client.cache.get('quotes')?.get('route-1')?.get('request-1'),
    ).toEqual(before)
  })

  test.each([
    ['INVALID_INPUT', () => undefined, '0'],
    [
      'NO_RESULT',
      () =>
        legacy.getAllRoutes.mockResolvedValue(
          response({ routeId: 'route-thrown', results: [] }),
        ),
      '1',
    ],
    [
      'REQUEST_FAILED',
      () => legacy.getAllRoutes.mockRejectedValue(new Error('Network Error')),
      '1',
    ],
  ])(
    'leaves the quotes map as it was after a call that throws %s',
    async (type, arrange, amount) => {
      const { RangoClient } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
      })
      legacy.getAllRoutes.mockResolvedValue(
        response({
          routeId: 'route-kept',
          results: [{ ...result, requestId: 'kept' }],
        }),
      )
      const { data } = await client.quotes(ETH, USDC, '1', { req })
      const before = client.cache.get('quotes')
      legacy.getAllRoutes.mockResolvedValue(
        response({
          routeId: 'route-thrown',
          results: [{ ...result, requestId: 'thrown' }],
        }),
      )
      arrange()

      const error = await client
        .quotes(ETH, USDC, amount, { req })
        .catch((e: unknown) => e)

      expect(error).toMatchObject({ type })
      const routes = client.cache.get('quotes')
      expect(routes).toBe(before)
      expect([...(routes?.keys() ?? [])]).toEqual(['route-kept'])
      expect(routes?.get('route-kept')?.get('kept')).toEqual(
        data.quotes[0]?.data,
      )
    },
  )

  test("a later successful call adds its route ID as the newest, keeping the earlier call's Quotes", async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({
        routeId: 'route-a',
        results: [{ ...result, requestId: 'first' }],
      }),
    )
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({
        routeId: 'route-b',
        results: [{ ...result, requestId: 'second' }],
      }),
    )

    const first = await client.quotes(ETH, USDC, '1', { req })
    const second = await client.quotes(ETH, USDC, '1', { req })

    const routes = client.cache.get('quotes')
    expect([...(routes?.keys() ?? [])]).toEqual(['route-a', 'route-b'])
    expect(routes?.get('route-a')?.get('first')).toEqual(
      first.data.quotes[0]?.data,
    )
    expect(routes?.get('route-b')?.get('second')).toEqual(
      second.data.quotes[0]?.data,
    )
  })

  test('keeps the last 10 route IDs, dropping the oldest on the 11th', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const routeIds = Array.from({ length: 11 }, (_, index) => `route-${index}`)
    for (const routeId of routeIds) {
      legacy.getAllRoutes.mockResolvedValueOnce(
        response({ routeId, results: [{ ...result, requestId: routeId }] }),
      )
      await client.quotes(ETH, USDC, '1', { req })
    }

    const routes = client.cache.get('quotes')
    expect([...(routes?.keys() ?? [])]).toEqual(routeIds.slice(1))
    expect(routes?.get('route-0')).toBeUndefined()
  })

  test('replaces a route ID that is already cached and moves it to the newest place', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({
        routeId: 'route-a',
        results: [{ ...result, requestId: 'old' }],
      }),
    )
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({ routeId: 'route-b', results: [result] }),
    )
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({
        routeId: 'route-a',
        results: [{ ...result, requestId: 'new' }],
      }),
    )

    await client.quotes(ETH, USDC, '1', { req })
    await client.quotes(ETH, USDC, '1', { req })
    const repeated = await client.quotes(ETH, USDC, '1', { req })

    const routes = client.cache.get('quotes')
    expect([...(routes?.keys() ?? [])]).toEqual(['route-b', 'route-a'])
    expect([...(routes?.get('route-a')?.keys() ?? [])]).toEqual(['new'])
    expect(routes?.get('route-a')?.get('new')).toEqual(
      repeated.data.quotes[0]?.data,
    )
  })

  test('stores a new outer map on each successful call, leaving the one it read and each inner map unchanged', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({
        routeId: 'route-a',
        results: [{ ...result, requestId: 'first' }],
      }),
    )
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({
        routeId: 'route-b',
        results: [{ ...result, requestId: 'second' }],
      }),
    )

    await client.quotes(ETH, USDC, '1', { req })
    const held = client.cache.get('quotes')
    const heldInner = held?.get('route-a')
    expect(client.cache.get('quotes')).toBe(held)

    await client.quotes(ETH, USDC, '1', { req })

    const routes = client.cache.get('quotes')
    expect(routes).not.toBe(held)
    expect([...(held?.keys() ?? [])]).toEqual(['route-a'])
    expect(routes?.get('route-a')).toBe(heldInner)
    expect([...(heldInner?.keys() ?? [])]).toEqual(['first'])
  })

  test('adds overlapping calls in the order they resolve', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
    })
    const slowResponse = Promise.withResolvers<LegacySdk.MultiRouteResponse>()
    legacy.getAllRoutes.mockReturnValueOnce(slowResponse.promise)
    legacy.getAllRoutes.mockResolvedValueOnce(
      response({
        routeId: 'route-fast',
        results: [{ ...result, requestId: 'fast' }],
      }),
    )

    const slow = client.quotes(ETH, USDC, '1', { req })
    await client.quotes(ETH, USDC, '1', { req })
    slowResponse.resolve(
      response({
        routeId: 'route-slow',
        results: [{ ...result, requestId: 'slow' }],
      }),
    )
    await slow

    expect([...(client.cache.get('quotes')?.keys() ?? [])]).toEqual([
      'route-fast',
      'route-slow',
    ])
  })

  test("two clients don't share cached Quotes", async () => {
    const { RangoClient } = await loadSdk()
    const first = new RangoClient({
      apiKey: 'test-key',
    })
    const second = new RangoClient({
      apiKey: 'test-key',
    })
    legacy.getAllRoutes.mockResolvedValue(response())

    await first.quotes(ETH, USDC, '1', { req })

    expect(
      first.cache.get('quotes')?.get('route-1')?.get('request-1'),
    ).toBeDefined()
    expect(second.cache.get('quotes')).toBeUndefined()
  })

  test('types the quotes slot as read-only maps and exposes no set', async () => {
    const sdk = await loadSdk()
    const client = new sdk.RangoClient({
      apiKey: 'test-key',
    })

    expectTypeOf(client.cache.get('quotes')).toEqualTypeOf<
      ReadonlyMap<string, ReadonlyMap<string, Sdk.Quote>> | undefined
    >()
    expectTypeOf(client.cache).toEqualTypeOf<Sdk.ReadonlyCache>()
    // @ts-expect-error a request ID is not a cache slot
    void client.cache.get('request-1')
    // @ts-expect-error the app can't write to the cache
    void client.cache.set
    expect('set' in client.cache).toBe(false)
    const routes = client.cache.get('quotes')
    // @ts-expect-error the quotes map is read-only
    void routes?.set
    // @ts-expect-error the quotes map is read-only
    void routes?.delete
    // @ts-expect-error the quotes map is read-only
    void routes?.clear
    const quotes = routes?.get('route-1')
    // @ts-expect-error a route's map is read-only
    void quotes?.set
    // @ts-expect-error a route's map is read-only
    void quotes?.delete
    // @ts-expect-error a route's map is read-only
    void quotes?.clear
  })

  test('exports the read-only cache type, and keeps the Cache class internal with no key constant', async () => {
    const sdk = await loadSdk()

    expect('Cache' in sdk).toBe(false)
    expect(Object.keys(sdk).filter((name) => /KEY/i.test(name))).toEqual([])
    // @ts-expect-error Cache is not exported.
    void sdk.Cache
    expectTypeOf<Sdk.ReadonlyCache>().toHaveProperty('get')
    // @ts-expect-error QuotesRequest is replaced by QuotesReq.
    expectTypeOf<Sdk.QuotesRequest>().not.toBeNever()
  })
})
