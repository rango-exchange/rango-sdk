import type * as Sdk from './mod.js'

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
  return import('./mod.js')
}

const ETH = { blockchain: 'ETH', symbol: 'ETH', address: null }
const USDC = {
  blockchain: 'BSC',
  symbol: 'USDC',
  address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
}

const request: Sdk.QuotesRequest = {
  from: ETH,
  to: USDC,
  amount: '1',
  slippage: '1.5',
  swappers: ['Across'],
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

    new RangoClient({ apiKey: 'test-key', baseUrl: 'https://example.test' })

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

  test('sends the request with the affiliate from the config and the signal', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      affiliate: { ref: 'REF', percent: 0.2, wallets: { ETH: '0xaff' } },
    })
    const controller = new AbortController()

    await client.quotes(request, { signal: controller.signal })

    expect(sentBody()).toEqual({
      ...request,
      affiliateRef: 'REF',
      affiliatePercent: 0.2,
      affiliateWallets: { ETH: '0xaff' },
    })
    expect(legacy.getAllRoutes.mock.lastCall?.[1]).toEqual({
      signal: controller.signal,
    })
  })

  test('sends no affiliate fields when none is configured', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })

    await client.quotes(request)

    expect(sentBody()).toEqual(request)
  })

  test('sends the new affiliate on the next call after setAffiliate', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      affiliate: { ref: 'OLD', percent: 0.1 },
    })

    await client.quotes(request)
    client.setAffiliate({ ref: 'NEW' })
    await client.quotes(request)

    expect(sentBody()).toEqual({ ...request, affiliateRef: 'NEW' })
  })

  test('returns each result as a Quote with its request context', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })

    const quotes = await client.quotes(request)

    expect(quotes).toEqual([
      {
        requestId: 'request-1',
        outputAmount: '3000',
        resultType: 'OK',
        swaps: [swap()],
        scores: [{ preferenceType: 'FEE', score: 90 }],
        tags: [{ label: 'Recommended', value: 'RECOMMENDED' }],
        missingBlockchains: [],
        from: ETH,
        to: USDC,
        requestAmount: '1',
        slippage: '1.5',
        routingOptions: { swappers: ['Across'] },
        warnings: [],
        error: null,
      },
    ])
  })

  test('attaches a QuoteError to each unusable Quote and still returns the others', async () => {
    const { RangoClient, QuoteError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const baseSwap = swap()
    const tooSmall = swap({ fromAmountMinValue: '2' })
    legacy.getAllRoutes.mockResolvedValue(
      response({
        results: [
          { ...result, requestId: 'ok', swaps: [baseSwap] },
          { ...result, requestId: 'amount', swaps: [baseSwap, tooSmall] },
          {
            ...result,
            requestId: 'slippage',
            swaps: [
              {
                ...baseSwap,
                recommendedSlippage: { error: true, slippage: '4' },
              },
            ],
          },
        ],
      }),
    )

    const quotes = await client.quotes(request)

    expect(quotes.map((quote) => quote.requestId)).toEqual([
      'ok',
      'amount',
      'slippage',
    ])
    expect(quotes[0]?.error).toBeNull()
    expect(quotes[1]?.error).toBeInstanceOf(QuoteError)
    expect(quotes[1]?.error).toMatchObject({
      type: 'AMOUNT_OUT_OF_RANGE',
      metadata: {
        swapIndex: 1,
        swap: tooSmall,
        min: '2',
        max: '10',
        restrictionType: 'INCLUSIVE',
      },
    })
    expect(quotes[2]?.error).toBeInstanceOf(QuoteError)
    expect(quotes[2]?.error).toMatchObject({
      type: 'SLIPPAGE_TOO_LOW',
      metadata: {
        recommendedSlippages: [{ swapIndex: 0, slippage: '4' }],
        minRequiredSlippage: '4',
      },
    })
  })

  test('gives each Quote its own balance-independent warnings', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
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

    const quotes = await client.quotes(request)

    expect(
      quotes.map(({ requestId, warnings }) => [requestId, warnings]),
    ).toEqual([
      ['clean', []],
      [
        'loss',
        [
          {
            kind: 'HIGH_VALUE_LOSS',
            usdIn: 3000,
            usdOut: 2400,
            priceImpact: -20,
            totalFee: 0,
            level: 'high',
          },
        ],
      ],
      ['unpriced', [{ kind: 'UNKNOWN_PRICE' }]],
      [
        'slippage',
        [
          {
            kind: 'INSUFFICIENT_SLIPPAGE',
            recommendedSlippages: [{ swapIndex: 0, slippage: '2' }],
            minRequired: '2',
          },
        ],
      ],
    ])
    expectTypeOf<Sdk.Quote['warnings']>().toEqualTypeOf<Sdk.QuoteWarning[]>()
  })

  test('raises HIGH_SLIPPAGE from the client thresholds, overridden per call', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      validation: { highSlippage: 1 },
    })

    const withClientConfig = await client.quotes(request)
    const withOverride = await client.quotes(request, {
      validation: { highSlippage: 5 },
    })

    expect(withClientConfig[0]?.warnings).toEqual([
      { kind: 'HIGH_SLIPPAGE', slippage: '1.5' },
    ])
    expect(withOverride[0]?.warnings).toEqual([])
  })

  test('skips the slippage warnings when the request has no slippage', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      validation: { highSlippage: -1 },
    })
    const { slippage: _, ...withoutSlippage } = request

    const quotes = await client.quotes(withoutSlippage)

    expect(quotes[0]?.warnings).toEqual([])
  })

  test('attaches NO_ROUTE without a diagnosis message to a Quote with no swaps', async () => {
    const { RangoClient, QuoteError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.getAllRoutes.mockResolvedValue(
      response({
        results: [
          { ...result, requestId: 'empty', swaps: [] },
          { ...result, requestId: 'ok' },
        ],
        diagnosisMessages: ['Some swappers are down'],
      }),
    )

    const quotes = await client.quotes(request)

    expect(quotes.map((quote) => quote.requestId)).toEqual(['empty', 'ok'])
    expect(quotes[0]?.error).toBeInstanceOf(QuoteError)
    expect(quotes[0]?.error).toMatchObject({ type: 'NO_ROUTE', metadata: {} })
    expect(quotes[0]?.error?.metadata).not.toHaveProperty('diagnosisMessage')
    expect(quotes[1]?.error).toBeNull()
  })

  test('throws NO_ROUTE with the body error message for an HTTP 400', async () => {
    const { RangoClient, QuotesError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const badRequest = httpError(BAD_REQUEST, {
      error: 'Amount is too small',
      errorCode: 1,
      traceId: 2,
    })
    legacy.getAllRoutes.mockRejectedValue(badRequest)

    const error = await client.quotes(request).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(QuotesError)
    expect(error).toMatchObject({
      type: 'NO_ROUTE',
      metadata: { diagnosisMessage: 'Amount is too small' },
      cause: badRequest,
    })
  })

  test.each([
    ['an empty', []],
    ['a null', null],
  ])(
    'throws NO_ROUTE with the first diagnosis message for %s result list',
    async (_, results) => {
      const { RangoClient, QuotesError } = await loadSdk()
      const client = new RangoClient({ apiKey: 'test-key' })
      const noResults = response({
        results: results as LegacySdk.MultiRouteSimulationResult[],
        diagnosisMessages: ['No route', 'Try another amount'],
      })
      legacy.getAllRoutes.mockResolvedValue(noResults)

      const error = await client.quotes(request).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(QuotesError)
      expect(error).toMatchObject({
        type: 'NO_ROUTE',
        metadata: { diagnosisMessage: 'No route' },
        cause: noResults,
      })
    },
  )

  test.each([
    ['an empty', []],
    ['a null', null],
  ])(
    'throws NO_ROUTE without a diagnosis message for %s result list with no diagnosis',
    async (_, results) => {
      const { RangoClient } = await loadSdk()
      const client = new RangoClient({ apiKey: 'test-key' })
      legacy.getAllRoutes.mockResolvedValue(
        response({
          results: results as LegacySdk.MultiRouteSimulationResult[],
          diagnosisMessages: [],
        }),
      )

      const error = await client.quotes(request).catch((e: unknown) => e)

      expect(error).toMatchObject({ type: 'NO_ROUTE', metadata: {} })
      expect((error as Sdk.QuotesError).metadata).not.toHaveProperty(
        'diagnosisMessage',
      )
    },
  )

  test('throws CANCELED when the signal aborts the request, even for an HTTP 400', async () => {
    const { RangoClient, QuotesError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const controller = new AbortController()
    const canceled = httpError(BAD_REQUEST, { error: 'canceled' })
    legacy.getAllRoutes.mockImplementation(async () => {
      controller.abort()
      throw canceled
    })

    const error = await client
      .quotes(request, { signal: controller.signal })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(QuotesError)
    expect(error).toMatchObject({ type: 'CANCELED', cause: canceled })
  })

  test.each([UNAUTHORIZED, TOO_MANY_REQUESTS, SERVER_ERROR])(
    'throws REQUEST_FAILED for an HTTP %i, keeping the cause',
    async (status) => {
      const { RangoClient, QuotesError } = await loadSdk()
      const client = new RangoClient({ apiKey: 'test-key' })
      const failure = httpError(status, {
        error: 'Failed',
        errorCode: 42,
        traceId: 7,
      })
      legacy.getAllRoutes.mockRejectedValue(failure)

      const error = await client.quotes(request).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(QuotesError)
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({
        type: 'REQUEST_FAILED',
        metadata: { errorCode: 42, traceId: 7 },
        cause: failure,
      })
    },
  )

  test('throws REQUEST_FAILED with null metadata for a network failure', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const networkError = new Error('Network Error')
    legacy.getAllRoutes.mockRejectedValue(networkError)

    await expect(client.quotes(request)).rejects.toMatchObject({
      type: 'REQUEST_FAILED',
      metadata: { errorCode: null, traceId: null },
      cause: networkError,
    })
  })

  test('throws REQUEST_FAILED when the response has an error, keeping the response as the cause', async () => {
    const { RangoClient, QuotesError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const failed = response({
      results: [],
      error: 'Invalid asset',
      errorCode: 1001,
      traceId: 99,
    })
    legacy.getAllRoutes.mockResolvedValue(failed)

    const error = await client.quotes(request).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(QuotesError)
    expect(error).toMatchObject({
      message: 'Invalid asset',
      type: 'REQUEST_FAILED',
      metadata: { errorCode: 1001, traceId: 99 },
      cause: failed,
    })
  })

  test('narrows a caught error with instanceof, then metadata on type', async () => {
    const { RangoClient, QuotesError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.getAllRoutes.mockRejectedValue(new Error('Network Error'))

    let metadata: unknown
    try {
      await client.quotes(request)
    } catch (error) {
      if (!(error instanceof QuotesError)) {
        throw error
      }
      if (error.type === 'REQUEST_FAILED') {
        expectTypeOf(error.metadata).toEqualTypeOf<Sdk.RequestFailedMetadata>()
        metadata = error.metadata
      } else if (error.type === 'NO_ROUTE') {
        expectTypeOf(error.metadata).toEqualTypeOf<Sdk.NoRouteMetadata>()
      } else {
        expectTypeOf(error.type).toEqualTypeOf<'CANCELED'>()
        expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
      }
    }
    expect(metadata).toEqual({ errorCode: null, traceId: null })
  })
})
