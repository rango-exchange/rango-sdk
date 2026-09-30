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

const result: LegacySdk.MultiRouteSimulationResult = {
  requestId: 'request-1',
  outputAmount: '3000',
  resultType: LegacySdk.RoutingResultType.OK,
  swaps: [],
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
        swaps: [],
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
    const baseSwap = {
      fromAmount: '1',
      fromAmountMinValue: '0.1',
      fromAmountMaxValue: '10',
      fromAmountRestrictionType: 'INCLUSIVE',
      recommendedSlippage: { error: false, slippage: '1' },
    } as LegacySdk.SwapResult
    const tooSmall = { ...baseSwap, fromAmountMinValue: '2' }
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

  test('resolves to an empty list when no route exists', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.getAllRoutes.mockResolvedValue(
      response({ results: [], diagnosisMessages: ['No route'] }),
    )

    await expect(client.quotes(request)).resolves.toEqual([])
  })

  test('throws CANCELED when the signal aborts the request', async () => {
    const { RangoClient, QuotesError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const controller = new AbortController()
    const canceled = new Error('canceled')
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

  test('throws REQUEST_FAILED for a transport failure, keeping the cause', async () => {
    const { RangoClient, QuotesError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const httpError = Object.assign(new Error('Request failed with 500'), {
      response: { status: 500, data: { errorCode: 42, traceId: 7 } },
    })
    legacy.getAllRoutes.mockRejectedValue(httpError)

    const error = await client.quotes(request).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(QuotesError)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      metadata: { errorCode: 42, traceId: 7 },
      cause: httpError,
    })
  })

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
      } else {
        expectTypeOf(error.type).toEqualTypeOf<'CANCELED'>()
        expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
      }
    }
    expect(metadata).toEqual({ errorCode: null, traceId: null })
  })
})
