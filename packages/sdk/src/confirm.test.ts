import type * as Sdk from './mod.js'

import * as LegacySdk from 'rango-sdk'
import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

const legacy = vi.hoisted(() => ({ confirmRoute: vi.fn() }))

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    confirmRoute = legacy.confirmRoute
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

function quote(overrides: Partial<Sdk.Quote> = {}): Sdk.Quote {
  return {
    requestId: 'request-1',
    outputAmount: '3000',
    resultType: LegacySdk.RoutingResultType.OK,
    swaps: [swap()],
    scores: [],
    tags: [],
    missingBlockchains: [],
    from: ETH,
    to: USDC,
    requestAmount: '1',
    slippage: '1.5',
    routingOptions: { swappers: ['Across'] },
    warnings: [],
    error: null,
    ...overrides,
  }
}

const wallets: Sdk.ConfirmRequest = {
  selectedWallets: { ETH: '0xfrom', BSC: '0xto' },
  destination: '0xdestination',
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

type ConfirmResult = NonNullable<LegacySdk.ConfirmRouteResponse['result']>

function result(overrides: Partial<ConfirmResult> = {}): ConfirmResult {
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
    ...overrides,
  }
}

function response(
  overrides: Partial<LegacySdk.ConfirmRouteResponse> = {},
): LegacySdk.ConfirmRouteResponse {
  return {
    ok: true,
    result: result(),
    error: null,
    errorCode: null,
    traceId: null,
    ...overrides,
  }
}

const BAD_REQUEST = 400
const SERVER_ERROR = 500

function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with ${status}`), {
    response: { status, data },
  })
}

async function confirmError(promise: Promise<unknown>) {
  const { ConfirmError } = await loadSdk()
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ConfirmError)
  expect(error).toBeInstanceOf(Error)
  return error
}

describe('confirm', () => {
  beforeEach(() => {
    vi.resetModules()
    legacy.confirmRoute.mockReset()
    legacy.confirmRoute.mockResolvedValue(response())
  })

  test("sends the Quote's request ID, the wallets, the destination and the signal, with no affiliate", async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      affiliate: { ref: 'REF', percent: 0.2 },
    })
    const controller = new AbortController()

    await client.confirm(quote(), wallets, { signal: controller.signal })

    expect(legacy.confirmRoute.mock.lastCall).toEqual([
      {
        requestId: 'request-1',
        selectedWallets: { ETH: '0xfrom', BSC: '0xto' },
        destination: '0xdestination',
      },
      { signal: controller.signal },
    ])
  })

  test('leaves the destination out when none is given', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })

    await client.confirm(quote(), { selectedWallets: { ETH: '0xfrom' } })

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toEqual({
      requestId: 'request-1',
      selectedWallets: { ETH: '0xfrom' },
    })
  })

  test('resolves to the Route with its request context and no warnings', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })

    const confirmed = await client.confirm(quote(), wallets)

    expect(confirmed).toEqual({
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
    expectTypeOf(confirmed).toEqualTypeOf<Sdk.ConfirmResult>()
  })

  test('throws the Quote error as a ConfirmError without sending a request', async () => {
    const { RangoClient, QuoteError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const metadata = {
      recommendedSlippages: [{ swapIndex: 0, slippage: '3' }],
      minRequiredSlippage: '3',
    }
    const quoteError = new QuoteError('Slippage too low', {
      type: 'SLIPPAGE_TOO_LOW',
      metadata,
    })

    const error = await confirmError(
      client.confirm(quote({ error: quoteError }), wallets),
    )

    expect(error).toMatchObject({
      type: 'SLIPPAGE_TOO_LOW',
      metadata,
      cause: quoteError,
    })
    expect(legacy.confirmRoute).not.toHaveBeenCalled()
  })

  test('raises EXCESSIVE_OUTPUT_CHANGE against the passed Quote', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
          result: {
            outputAmount: '2940',
            resultType: LegacySdk.RoutingResultType.OK,
            swaps: [swap({ toAmount: '2940' })],
          },
        }),
      }),
    )

    const { warnings } = await client.confirm(quote(), wallets)

    expect(warnings).toEqual([
      {
        kind: 'EXCESSIVE_OUTPUT_CHANGE',
        usdValueChange: -60,
        percentageChange: -2,
      },
    ])
  })

  test('does not raise EXCESSIVE_OUTPUT_CHANGE when no threshold entry matches', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      validation: { excessiveOutputChange: [{ threshold: -5, minInput: 0 }] },
    })
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
          result: {
            outputAmount: '2940',
            resultType: LegacySdk.RoutingResultType.OK,
            swaps: [swap({ toAmount: '2940' })],
          },
        }),
      }),
    )

    const { warnings } = await client.confirm(quote(), wallets)

    expect(warnings).toEqual([])
  })

  test('resolves with the quote() warnings, including INSUFFICIENT_BALANCE', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const shortOnFee = {
      asset: ETH,
      requiredAmount: { amount: '2000000000000000000', decimals: 18 },
      currentAmount: { amount: '1000000000000000000', decimals: 18 },
      ok: false,
      reason: 'FEE' as const,
    }
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
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
      }),
    )

    const { warnings } = await client.confirm(quote({ slippage: '6' }), wallets)

    expect(warnings).toEqual([
      { kind: 'HIGH_SLIPPAGE', slippage: '6' },
      {
        kind: 'INSUFFICIENT_BALANCE',
        blockchain: 'ETH',
        address: '0xfrom',
        asset: ETH,
        required: shortOnFee.requiredAmount,
        current: shortOnFee.currentAmount,
        reason: 'FEE',
      },
    ])
    expectTypeOf(warnings).toEqualTypeOf<Sdk.ConfirmWarning[]>()
  })

  test('throws CANCELED when the signal aborts the request', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const controller = new AbortController()
    const canceled = new Error('canceled')
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      throw canceled
    })

    const error = await confirmError(
      client.confirm(quote(), wallets, { signal: controller.signal }),
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
    const badRequest = httpError(BAD_REQUEST, { error: 'Route expired' })
    legacy.confirmRoute.mockRejectedValue(badRequest)

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({
      type: 'NO_ROUTE',
      metadata: { diagnosisMessage: 'Route expired' },
      cause: badRequest,
    })
  })

  test('throws REQUEST_FAILED for another HTTP failure', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const serverError = httpError(SERVER_ERROR, { errorCode: 42, traceId: 7 })
    legacy.confirmRoute.mockRejectedValue(serverError)

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      metadata: { errorCode: 42, traceId: 7 },
      cause: serverError,
    })
  })

  test('throws REQUEST_FAILED when the response has an error', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const failed = response({
      ok: false,
      result: null,
      error: 'Invalid request ID',
      errorCode: '1001',
      traceId: 99,
    })
    legacy.confirmRoute.mockResolvedValue(failed)

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({
      message: 'Invalid request ID',
      type: 'REQUEST_FAILED',
      metadata: { errorCode: 1001, traceId: 99 },
      cause: failed,
    })
  })

  test('throws REQUEST_FAILED for ok: false with no error message', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const failed = response({ ok: false })
    legacy.confirmRoute.mockResolvedValue(failed)

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      metadata: { errorCode: null, traceId: null },
      cause: failed,
    })
  })

  test('throws NO_ROUTE when the response has no result', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const empty = response({ result: null })
    legacy.confirmRoute.mockResolvedValue(empty)

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({ type: 'NO_ROUTE', cause: empty })
  })

  test('throws NO_ROUTE with the first diagnosis message for a null routing result', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const empty = response({
      result: result({ result: null, diagnosisMessages: ['No liquidity'] }),
    })
    legacy.confirmRoute.mockResolvedValue(empty)

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({
      type: 'NO_ROUTE',
      metadata: { diagnosisMessage: 'No liquidity' },
      cause: empty,
    })
  })

  test('throws AMOUNT_OUT_OF_RANGE for a swap outside its limits', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const tooSmall = swap({ fromAmount: '0.1' })
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
          result: {
            outputAmount: '3000',
            resultType: LegacySdk.RoutingResultType.OK,
            swaps: [tooSmall],
          },
        }),
      }),
    )

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({
      type: 'AMOUNT_OUT_OF_RANGE',
      metadata: {
        swapIndex: 0,
        swap: tooSmall,
        min: '0.1',
        max: '10',
        restrictionType: 'EXCLUSIVE',
      },
    })
  })

  test('throws SLIPPAGE_TOO_LOW for a swap whose recommended slippage has an error', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
          result: {
            outputAmount: '3000',
            resultType: LegacySdk.RoutingResultType.OK,
            swaps: [
              swap({ recommendedSlippage: { error: true, slippage: '2.5' } }),
            ],
          },
        }),
      }),
    )

    const error = await confirmError(client.confirm(quote(), wallets))

    expect(error).toMatchObject({
      type: 'SLIPPAGE_TOO_LOW',
      metadata: {
        recommendedSlippages: [{ swapIndex: 0, slippage: '2.5' }],
        minRequiredSlippage: '2.5',
      },
    })
  })

  test('narrows a caught error with instanceof, then metadata on type', async () => {
    const { RangoClient, ConfirmError, QuoteError } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    legacy.confirmRoute.mockResolvedValue(response({ result: null }))

    let type: unknown
    try {
      await client.confirm(quote(), wallets)
    } catch (error) {
      expect(error).not.toBeInstanceOf(QuoteError)
      if (!(error instanceof ConfirmError)) {
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
