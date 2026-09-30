import type * as Sdk from './mod.js'

import * as LegacySdk from 'rango-sdk'
import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

const legacy = vi.hoisted(() => ({ getBestRoute: vi.fn() }))

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    getBestRoute = legacy.getBestRoute
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

const request: Sdk.QuoteRequest = {
  from: ETH,
  to: USDC,
  amount: '1',
  selectedWallets: { ETH: '0xfrom', BSC: '0xto' },
  destination: '0xdestination',
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
    fromAmountRestrictionType: 'EXCLUSIVE',
    routes: null,
    internalSwaps: null,
    fee: [],
    estimatedTimeInSeconds: 60,
    timeStat: null,
    includesDestinationTx: false,
    maxRequiredSign: 1,
    recommendedSlippage: { error: false, slippage: '0.5' },
    warnings: [],
    ...overrides,
  }
}

const validationStatus: Sdk.BlockchainValidationStatus[] = [
  {
    blockchain: 'ETH',
    wallets: [
      {
        address: '0xfrom',
        addressIsValid: true,
        requiredAssets: [],
        validResult: true,
      },
    ],
  },
]

function response(overrides: Partial<LegacySdk.BestRouteResponse> = {}) {
  return {
    requestId: 'request-1',
    requestAmount: '1',
    from: ETH,
    to: USDC,
    result: {
      outputAmount: '3000',
      resultType: LegacySdk.RoutingResultType.OK,
      swaps: [swap()],
    },
    validationStatus,
    diagnosisMessages: [],
    missingBlockchains: [],
    walletNotSupportingFromBlockchain: false,
    error: null,
    errorCode: null,
    traceId: null,
    ...overrides,
  } satisfies LegacySdk.BestRouteResponse
}

const BAD_REQUEST = 400
const SERVER_ERROR = 500

function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with ${status}`), {
    response: { status, data },
  })
}

async function quoteError(promise: Promise<unknown>) {
  const { QuoteError } = await loadSdk()
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(QuoteError)
  expect(error).toBeInstanceOf(Error)
  return error
}

describe('quote', () => {
  beforeEach(() => {
    vi.resetModules()
    legacy.getBestRoute.mockReset()
    legacy.getBestRoute.mockResolvedValue(response())
  })

  test('sends the request with checkPrerequisites, the affiliate from the config and the signal', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      affiliate: { ref: 'REF', percent: 0.2, wallets: { ETH: '0xaff' } },
    })
    const controller = new AbortController()

    await client.quote(request, { signal: controller.signal })

    expect(legacy.getBestRoute.mock.lastCall).toEqual([
      {
        ...request,
        checkPrerequisites: true,
        affiliateRef: 'REF',
        affiliatePercent: 0.2,
        affiliateWallets: { ETH: '0xaff' },
      },
      { signal: controller.signal },
    ])
  })

  test('sends the new affiliate on the next call after setAffiliate', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      affiliate: { ref: 'OLD', percent: 0.1 },
    })

    await client.quote(request)
    client.setAffiliate({ ref: 'NEW' })
    await client.quote(request)

    expect(legacy.getBestRoute.mock.lastCall?.[0]).toEqual({
      ...request,
      checkPrerequisites: true,
      affiliateRef: 'NEW',
    })
  })

  test('resolves to the Route with its request context and no warnings', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })

    await expect(client.quote(request)).resolves.toEqual({
      route: {
        requestId: 'request-1',
        from: ETH,
        to: USDC,
        requestAmount: '1',
        outputAmount: '3000',
        resultType: 'OK',
        swaps: [swap()],
        validationStatus,
        selectedWallets: { ETH: '0xfrom', BSC: '0xto' },
        destination: '0xdestination',
        slippage: '1.5',
      },
      warnings: [],
    })
  })

  test('resolves with every warning that applies, including INSUFFICIENT_BALANCE', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const shortOnFee = {
      asset: ETH,
      requiredAmount: { amount: '2000000000000000000', decimals: 18 },
      currentAmount: { amount: '1000000000000000000', decimals: 18 },
      ok: false,
      reason: 'FEE_AND_INPUT_ASSET' as const,
    }
    legacy.getBestRoute.mockResolvedValue(
      response({
        result: {
          outputAmount: '2400',
          resultType: LegacySdk.RoutingResultType.OK,
          swaps: [swap({ toAmount: '2400' })],
        },
        validationStatus: [
          {
            blockchain: 'ETH',
            wallets: [
              {
                address: '0xfrom',
                addressIsValid: true,
                requiredAssets: [shortOnFee],
                validResult: true,
              },
            ],
          },
        ],
      }),
    )

    const { warnings } = await client.quote({ ...request, slippage: '6' })

    expect(warnings).toEqual([
      {
        kind: 'HIGH_VALUE_LOSS',
        usdIn: 3000,
        usdOut: 2400,
        priceImpact: -20,
        totalFee: 0,
        level: 'high',
      },
      { kind: 'HIGH_SLIPPAGE', slippage: '6' },
      {
        kind: 'INSUFFICIENT_BALANCE',
        blockchain: 'ETH',
        address: '0xfrom',
        asset: ETH,
        required: shortOnFee.requiredAmount,
        current: shortOnFee.currentAmount,
        reason: 'FEE_AND_INPUT_ASSET',
      },
    ])
    expectTypeOf(warnings).toEqualTypeOf<Sdk.RouteWarning[]>()
  })

  test('uses the client validation thresholds, overridden per call', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      validation: { highSlippage: 10 },
    })

    const withClientConfig = await client.quote({ ...request, slippage: '6' })
    const withOverride = await client.quote(
      { ...request, slippage: '6' },
      { validation: { highSlippage: 2 } },
    )

    expect(withClientConfig.warnings).toEqual([])
    expect(withOverride.warnings).toEqual([
      { kind: 'HIGH_SLIPPAGE', slippage: '6' },
    ])
  })

  test('throws CANCELED when the signal aborts the request, even for an HTTP 400', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const controller = new AbortController()
    const canceled = httpError(BAD_REQUEST, { error: 'canceled' })
    legacy.getBestRoute.mockImplementation(async () => {
      controller.abort()
      throw canceled
    })

    const error = await quoteError(
      client.quote(request, { signal: controller.signal }),
    )

    expect(error).toMatchObject({
      type: 'CANCELED',
      metadata: undefined,
      cause: canceled,
    })
  })

  test('throws NO_ROUTE with the body error message for an HTTP 400', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const badRequest = httpError(BAD_REQUEST, {
      error: 'Amount is too small',
      errorCode: 1,
      traceId: 2,
    })
    legacy.getBestRoute.mockRejectedValue(badRequest)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'NO_ROUTE',
      metadata: { diagnosisMessage: 'Amount is too small' },
      cause: badRequest,
    })
  })

  test('throws REQUEST_FAILED for another HTTP failure', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const serverError = httpError(SERVER_ERROR, { errorCode: 42, traceId: 7 })
    legacy.getBestRoute.mockRejectedValue(serverError)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      metadata: { errorCode: 42, traceId: 7 },
      cause: serverError,
    })
  })

  test('throws REQUEST_FAILED with null metadata for a network failure', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const networkError = new Error('Network Error')
    legacy.getBestRoute.mockRejectedValue(networkError)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      metadata: { errorCode: null, traceId: null },
      cause: networkError,
    })
  })

  test('throws REQUEST_FAILED when the response has an error, before checking the result', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const failed = response({
      result: null,
      error: 'Invalid asset',
      errorCode: 1001,
      traceId: 99,
    })
    legacy.getBestRoute.mockResolvedValue(failed)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      message: 'Invalid asset',
      type: 'REQUEST_FAILED',
      metadata: { errorCode: 1001, traceId: 99 },
      cause: failed,
    })
  })

  test('throws NO_ROUTE with the first diagnosis message for a null result', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const empty = response({
      result: null,
      diagnosisMessages: ['No liquidity', 'Other'],
    })
    legacy.getBestRoute.mockResolvedValue(empty)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'NO_ROUTE',
      metadata: { diagnosisMessage: 'No liquidity' },
      cause: empty,
    })
  })

  test('throws NO_ROUTE for a result with no swaps', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.getBestRoute.mockResolvedValue(
      response({
        result: {
          outputAmount: '0',
          resultType: LegacySdk.RoutingResultType.NO_ROUTE,
          swaps: [],
        },
      }),
    )

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({ type: 'NO_ROUTE', metadata: {} })
  })

  test('throws AMOUNT_OUT_OF_RANGE for a swap outside its limits, before checking slippage', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const tooLarge = swap({
      fromAmount: '10',
      recommendedSlippage: { error: true, slippage: '3' },
    })
    legacy.getBestRoute.mockResolvedValue(
      response({
        result: {
          outputAmount: '3000',
          resultType: LegacySdk.RoutingResultType.OK,
          swaps: [swap(), tooLarge],
        },
      }),
    )

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'AMOUNT_OUT_OF_RANGE',
      metadata: {
        swapIndex: 1,
        swap: tooLarge,
        min: '0.1',
        max: '10',
        restrictionType: 'EXCLUSIVE',
      },
    })
  })

  test('throws SLIPPAGE_TOO_LOW for a swap whose recommended slippage has an error', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.getBestRoute.mockResolvedValue(
      response({
        result: {
          outputAmount: '3000',
          resultType: LegacySdk.RoutingResultType.OK,
          swaps: [
            swap(),
            swap({ recommendedSlippage: { error: true, slippage: '2.5' } }),
          ],
        },
      }),
    )

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'SLIPPAGE_TOO_LOW',
      metadata: {
        recommendedSlippages: [{ swapIndex: 1, slippage: '2.5' }],
        minRequiredSlippage: '2.5',
      },
    })
  })

  test('narrows a caught error with instanceof, then metadata on type', async () => {
    const { RangoClient, QuoteError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.getBestRoute.mockResolvedValue(response({ result: null }))

    let type: unknown
    try {
      await client.quote(request)
    } catch (error) {
      if (!(error instanceof QuoteError)) {
        throw error
      }
      type = error.type
      switch (error.type) {
        case 'NO_ROUTE':
          expectTypeOf(error.metadata).toEqualTypeOf<Sdk.NoRouteMetadata>()
          break
        case 'AMOUNT_OUT_OF_RANGE':
          expectTypeOf(
            error.metadata,
          ).toEqualTypeOf<Sdk.AmountOutOfRangeMetadata>()
          break
        case 'SLIPPAGE_TOO_LOW':
          expectTypeOf(
            error.metadata,
          ).toEqualTypeOf<Sdk.SlippageTooLowMetadata>()
          break
        case 'REQUEST_FAILED':
          expectTypeOf(
            error.metadata,
          ).toEqualTypeOf<Sdk.RequestFailedMetadata>()
          break
        case 'CANCELED':
          expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
      }
    }
    expect(type).toBe('NO_ROUTE')
  })
})
