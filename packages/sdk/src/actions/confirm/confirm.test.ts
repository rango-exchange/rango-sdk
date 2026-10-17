import type * as Sdk from '../../mod.js'

import * as LegacySdk from 'rango-sdk'
import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

const legacy = vi.hoisted(() => ({
  confirmRoute: vi.fn(),
  getAllRoutes: vi.fn(),
}))

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    confirmRoute = legacy.confirmRoute
    getAllRoutes = legacy.getAllRoutes
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

function quote(overrides: Partial<Sdk.ConfirmQuote> = {}): Sdk.ConfirmQuote {
  return {
    requestId: 'request-1',
    outputAmount: '3000',
    swaps: [swap()],
    requestAmount: '1',
    to: USDC,
    slippage: '1.5',
    ...overrides,
  }
}

const DESTINATION = '0x000000000000000000000000000000000000dead'

function chain(name: string, addressPatterns: string[]): Sdk.BlockchainMeta {
  return {
    type: LegacySdk.TransactionType.TRANSFER,
    name,
    shortName: name,
    displayName: name,
    defaultDecimals: 18,
    feeAssets: [],
    addressPatterns,
    logo: '',
    color: '',
    sort: 0,
    enabled: true,
    chainId: null,
    info: {
      infoType: 'TransferMetaInfo',
      blockExplorerUrls: [],
      addressUrl: '',
      transactionUrl: '',
      tokenUrl: null,
    },
  }
}

const blockchains = [
  chain('ETH', ['^(0x)[0-9A-Fa-f]{40}$']),
  chain('BSC', ['^(0x)[0-9A-Fa-f]{40}$']),
]

const SELECTED_WALLETS = { ETH: '0xfrom', BSC: '0xto' }

function request(overrides: Partial<Sdk.ConfirmQuote> = {}) {
  return {
    quote: quote(overrides),
    selectedWallets: SELECTED_WALLETS,
    destination: DESTINATION,
  } satisfies Sdk.ConfirmRequest
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
  const { SdkError } = await loadSdk()
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(SdkError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'SdkError')
  return error
}

describe('confirm', () => {
  beforeEach(() => {
    vi.resetModules()
    legacy.confirmRoute.mockReset()
    legacy.confirmRoute.mockResolvedValue(response())
  })

  test("sends exactly the Quote's request ID, the wallets and the destination, with the signal", async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const controller = new AbortController()

    await client.confirm(request({ requestId: 'request-2' }), {
      signal: controller.signal,
    })

    expect(legacy.confirmRoute.mock.lastCall).toStrictEqual([
      {
        requestId: 'request-2',
        selectedWallets: SELECTED_WALLETS,
        destination: DESTINATION,
      },
      { signal: controller.signal },
    ])
  })

  test.each([
    ['leaves the destination key out when the request has none', {}, {}],
    [
      'leaves the destination key out when it is undefined',
      { destination: undefined },
      {},
    ],
    ['forwards an empty destination', { destination: '' }, { destination: '' }],
  ])('%s, without checking it', async (_, given, sent) => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains: [] },
    })

    await client.confirm({ quote: quote(), selectedWallets: {}, ...given })

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toStrictEqual({
      requestId: 'request-1',
      selectedWallets: {},
      ...sent,
    })
  })

  test.each([
    [
      "doesn't match the destination blockchain's patterns",
      '0x123',
      blockchains,
      'PATTERN_MISMATCH',
    ],
    [
      'only matches the patterns of another blockchain',
      DESTINATION,
      [chain('ETH', ['^(0x)[0-9A-Fa-f]{40}$']), chain('BSC', ['^bnb1'])],
      'PATTERN_MISMATCH',
    ],
    [
      'has a blockchain missing from blockchains',
      DESTINATION,
      [chain('ETH', ['^(0x)[0-9A-Fa-f]{40}$'])],
      'NO_ADDRESS_PATTERNS',
    ],
    [
      'has a blockchain with no address patterns',
      DESTINATION,
      [chain('BSC', [])],
      'NO_ADDRESS_PATTERNS',
    ],
    ['is only whitespace', ' ', blockchains, 'PATTERN_MISMATCH'],
  ])(
    'throws INVALID_INPUT without sending a request when the destination %s',
    async (_, destination, chains, reason) => {
      const { RangoClient } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
        meta: { blockchains: chains },
      })

      const error = await confirmError(
        client.confirm({ ...request(), destination }),
      )

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field: 'destination', reason },
      })
      expect(legacy.confirmRoute).not.toHaveBeenCalled()
    },
  )

  test("reads the destination blockchain from the Quote's `to`", async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: {
        blockchains: [
          chain('BSC', ['^(0x)[0-9A-Fa-f]{40}$']),
          chain('BNB', ['^bnb1']),
        ],
      },
    })

    const error = await confirmError(
      client.confirm(request({ to: { ...USDC, blockchain: 'BNB' } })),
    )
    await client.confirm(request())

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      metadata: { field: 'destination', reason: 'PATTERN_MISMATCH' },
    })
    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
  })

  test('sends a destination that matches any pattern, skipping a pattern that is not a valid regular expression', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: {
        blockchains: [
          chain('BSC', ['^invalid($', '^bnb1', '^(0x)[0-9a-f]{40}$']),
        ],
      },
    })

    await client.confirm(request())

    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
  })

  test.each(['abc', '0', '100'])(
    "doesn't check the Quote's slippage %j",
    async (slippage) => {
      const { RangoClient } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
        meta: { blockchains },
      })

      await client.confirm(request({ slippage }))

      expect(legacy.confirmRoute).toHaveBeenCalledOnce()
    },
  )

  test('accepts a Quote without a slippage and gives it no slippage warnings', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
          result: {
            outputAmount: '3000',
            resultType: LegacySdk.RoutingResultType.OK,
            swaps: [
              swap({ recommendedSlippage: { error: false, slippage: '2.5' } }),
            ],
          },
        }),
      }),
    )
    const { slippage: _, ...withoutSlippage } = quote()

    const { warnings } = await client.confirm({
      ...request(),
      quote: withoutSlippage,
    })

    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
    expect(warnings).toEqual([])
  })

  test('resolves to data (the confirm result without its diagnosis messages, with selectedWallets and slippage), no warnings and _response as received', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const confirmedResult = result({
      diagnosisMessages: ['Some swappers are down'],
    })
    const confirmResponse = response({ result: confirmedResult, traceId: 12 })
    legacy.confirmRoute.mockResolvedValue(confirmResponse)

    const confirmed = await client.confirm(request())

    expect(confirmed).toEqual({
      data: {
        requestId: 'request-1',
        requestAmount: '1',
        from: ETH,
        to: USDC,
        result: confirmedResult.result,
        validationStatus,
        missingBlockchains: [],
        walletNotSupportingFromBlockchain: false,
        selectedWallets: SELECTED_WALLETS,
        slippage: '1.5',
      },
      warnings: [],
      _response: confirmResponse,
    })
    expect(confirmed._response).toBe(confirmResponse)
    expect(confirmed).not.toHaveProperty('error')
    expectTypeOf(confirmed).toEqualTypeOf<Sdk.ConfirmResult>()
    expectTypeOf(confirmed.data).toEqualTypeOf<Sdk.Route>()
    expectTypeOf(confirmed.data).toExtend<Sdk.RouteResponse>()
  })

  test('types the result with no error field and the legacy confirm response as _response', () => {
    expectTypeOf<Sdk.ConfirmResult>().not.toHaveProperty('error')
    expectTypeOf<
      Sdk.ConfirmResult['_response']
    >().toEqualTypeOf<LegacySdk.ConfirmRouteResponse>()
  })

  test('fills nothing in from the request or the Quote when the result leaves fields out', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const {
      from: _from,
      to: _to,
      requestAmount: _amount,
      ...partial
    } = result()
    legacy.confirmRoute.mockResolvedValue(
      response({ result: partial as ConfirmResult }),
    )

    const { data: route } = await client.confirm(request())

    expect(route).not.toHaveProperty('from')
    expect(route).not.toHaveProperty('to')
    expect(route).not.toHaveProperty('requestAmount')
    expect(route).not.toHaveProperty('destination')
  })

  test('carries a copy of selectedWallets and the Quote slippage, without the destination', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const selectedWallets = { ETH: '0xfrom', BSC: '0xto', SOLANA: 'sol' }

    const confirmed = await client.confirm({
      ...request({ slippage: '2' }),
      selectedWallets,
    })

    expect(confirmed.data.selectedWallets).not.toBe(selectedWallets)
    expect(confirmed.data.selectedWallets).toEqual({
      ETH: '0xfrom',
      BSC: '0xto',
      SOLANA: 'sol',
    })

    selectedWallets.ETH = '0xchanged'
    Object.assign(selectedWallets, { POLYGON: '0xadded' })
    expect(confirmed.data.selectedWallets).toEqual({
      ETH: '0xfrom',
      BSC: '0xto',
      SOLANA: 'sol',
    })
    expect(confirmed.data.slippage).toBe('2')
    expect(confirmed.data).not.toHaveProperty('destination')
    expect(confirmed).not.toHaveProperty('selectedWallets')
    expect(confirmed).not.toHaveProperty('slippage')
  })

  test('has no slippage key when the Quote has none', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const { slippage: _, ...withoutSlippage } = quote()

    const confirmed = await client.confirm({
      ...request(),
      quote: withoutSlippage,
    })

    expect(confirmed.data).not.toHaveProperty('slippage')
    expect(confirmed.data.selectedWallets).toEqual(SELECTED_WALLETS)
  })

  test('confirms a Quote taken from a quotes() result as it is', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    legacy.getAllRoutes.mockResolvedValue({
      from: ETH,
      to: USDC,
      requestAmount: '1',
      routeId: 'route-1',
      results: [
        {
          requestId: 'request-1',
          outputAmount: '3000',
          resultType: LegacySdk.RoutingResultType.OK,
          swaps: [swap()],
          scores: [],
          tags: [],
          missingBlockchains: [],
          walletNotSupportingFromBlockchain: false,
        },
      ],
      diagnosisMessages: [],
      error: null,
      errorCode: null,
      traceId: null,
    } satisfies LegacySdk.MultiRouteResponse)
    const { data } = await client.quotes({
      from: ETH,
      to: USDC,
      amount: '1',
      slippage: '1.5',
    })
    const chosen = data.quotes.find((entry) => !entry.error)
    if (!chosen) {
      throw new Error('quotes() returned no usable Quote')
    }

    const confirmed = await client.confirm({
      quote: chosen.data,
      selectedWallets: SELECTED_WALLETS,
    })

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toStrictEqual({
      requestId: 'request-1',
      selectedWallets: SELECTED_WALLETS,
    })
    expect(confirmed.data.slippage).toBe('1.5')
  })

  test('resolves to plain JSON that survives a round-trip unchanged', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })

    const confirmed = await client.confirm(request())

    expect(JSON.parse(JSON.stringify(confirmed))).toStrictEqual(confirmed)
  })

  test('tells a confirm() result apart from a quote() result by type', () => {
    expectTypeOf<Sdk.QuoteResult>().not.toExtend<Sdk.ConfirmResult>()
    expectTypeOf<Sdk.Quote>().toExtend<Sdk.ConfirmQuote>()
  })

  test('requires the Quote in the request', () => {
    expectTypeOf<Sdk.ConfirmRequest>().toEqualTypeOf<
      Omit<LegacySdk.ConfirmRouteRequest, 'requestId'> & {
        quote: Sdk.ConfirmQuote
      }
    >()
    expectTypeOf<Sdk.ConfirmRequest>().not.toHaveProperty('requestId')
    expectTypeOf<{
      selectedWallets: Record<string, string>
    }>().not.toExtend<Sdk.ConfirmRequest>()
  })

  test('rejects a requestId in the request, any meta in the options, and a missing Quote', () => {
    const selectedWallets = SELECTED_WALLETS
    const misuse = async (client: Sdk.RangoClient) => {
      await client.confirm(
        // @ts-expect-error the request ID is read from the Quote
        { quote: quote(), selectedWallets, requestId: 'request-1' },
      )
      await client.confirm(
        { quote: quote(), selectedWallets },
        // @ts-expect-error the Quote is passed in the request
        { meta: { quote: quote() } },
      )
      await client.confirm(
        { quote: quote(), selectedWallets },
        // @ts-expect-error the blockchains are set on the client
        { meta: { blockchains } },
      )
      // @ts-expect-error the request needs the Quote
      await client.confirm({ selectedWallets })
    }

    expectTypeOf(misuse).toBeFunction()
  })

  test('exports ConfirmRequest and not ConfirmRouteRequest', () => {
    expectTypeOf<Sdk.ConfirmRequest>().toHaveProperty('quote')
    // @ts-expect-error ConfirmRouteRequest is not exported
    expectTypeOf<Sdk.ConfirmRouteRequest>().not.toBeNever()
  })

  test('sends the request for a Quote whose entry has an error, without checking it', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const entry = {
      data: quote(),
      warnings: [],
      error: new SdkError('BRIDGE_LIMIT', 'Amount out of range', {
        metadata: {
          swap: swap({ fromAmountMinValue: '2' }),
          limit: 'MIN',
          limitValue: '2',
          exclusive: true,
        },
      }),
    }

    await client.confirm({ ...request(), quote: entry.data })

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toStrictEqual({
      requestId: 'request-1',
      selectedWallets: SELECTED_WALLETS,
      destination: DESTINATION,
    })
  })

  test('raises EXCESSIVE_OUTPUT_AMOUNT_CHANGE against the passed Quote', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
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

    const confirmed = await client.confirm(request())

    expect(confirmed.warnings).toEqual([
      {
        type: 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE',
        message:
          'The confirmed output is worth much less than the quoted output.',
        metadata: { usdValueChange: -60, percentageChange: -2 },
      },
    ])
    expect(JSON.parse(JSON.stringify(confirmed))).toStrictEqual(confirmed)
  })

  test.each([
    { name: 'the Quote', quoteAmount: '1', routeAmount: '0.1', raised: true },
    {
      name: 'not the Route',
      quoteAmount: '0.1',
      routeAmount: '1',
      raised: false,
    },
  ])(
    'takes the input value of EXCESSIVE_OUTPUT_AMOUNT_CHANGE from $name',
    async ({ quoteAmount, routeAmount, raised }) => {
      const { RangoClient } = await loadSdk()
      const client = new RangoClient({
        apiKey: 'test-key',
        meta: { blockchains },
      })
      legacy.confirmRoute.mockResolvedValue(
        response({
          result: result({
            requestAmount: routeAmount,
            result: {
              outputAmount: '2940',
              resultType: LegacySdk.RoutingResultType.OK,
              swaps: [swap({ toAmount: '2940' })],
            },
          }),
        }),
      )

      const { warnings } = await client.confirm(
        request({ requestAmount: quoteAmount }),
      )

      expect(
        warnings.some(({ type }) => type === 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE'),
      ).toBe(raised)
    },
  )

  test('does not raise EXCESSIVE_OUTPUT_AMOUNT_CHANGE for a drop smaller than 1%', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
          result: {
            outputAmount: '2973',
            resultType: LegacySdk.RoutingResultType.OK,
            swaps: [swap({ toAmount: '2973' })],
          },
        }),
      }),
    )

    const { warnings } = await client.confirm(request())

    expect(warnings).toEqual([])
  })

  test('raises HIGH_FEE and LONG_DURATION at the thresholds', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const networkFee: Sdk.SwapResult['fee'][number] = {
      name: 'Network Fee',
      expenseType: 'FROM_SOURCE_WALLET',
      asset: ETH,
      amount: '5',
      price: 3,
      meta: null,
    }
    legacy.confirmRoute.mockResolvedValue(
      response({
        result: result({
          result: {
            outputAmount: '3000',
            resultType: LegacySdk.RoutingResultType.OK,
            swaps: [
              swap({ fee: [networkFee], estimatedTimeInSeconds: 600 }),
              swap({ fee: [networkFee], estimatedTimeInSeconds: 300 }),
            ],
          },
        }),
      }),
    )

    const { warnings } = await client.confirm(request())

    expect(warnings).toEqual([
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

  test('takes no per-call validation option', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })

    expectTypeOf(client.confirm)
      .parameter(1)
      .toEqualTypeOf<Sdk.RequestOptions | undefined>()
  })

  test('resolves with the quote() warnings, including INSUFFICIENT_BALANCE', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
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

    const { warnings } = await client.confirm(request({ slippage: '6' }))

    expect(warnings).toEqual([
      {
        type: 'HIGH_SLIPPAGE',
        message: 'The slippage is above the high-slippage threshold.',
        metadata: { slippage: '6' },
      },
      {
        type: 'INSUFFICIENT_BALANCE',
        message: "A wallet doesn't hold enough of an asset.",
        metadata: {
          blockchain: 'ETH',
          address: '0xfrom',
          asset: ETH,
          required: shortOnFee.requiredAmount,
          current: shortOnFee.currentAmount,
          reason: 'FEE',
        },
      },
    ])
    expectTypeOf(warnings).toEqualTypeOf<Sdk.SdkWarning[]>()
  })

  test('throws REQUEST_CANCELED when the signal aborts the request', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const controller = new AbortController()
    const canceled = new Error('canceled')
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      throw canceled
    })

    const error = await confirmError(
      client.confirm(request(), { signal: controller.signal }),
    )

    expect(error).toMatchObject({
      type: 'REQUEST_CANCELED',
      cause: canceled,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws BAD_REQUEST with the body error message for an HTTP 400', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const badRequest = httpError(BAD_REQUEST, { error: 'Route expired' })
    legacy.confirmRoute.mockRejectedValue(badRequest)

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      message: 'Route expired',
      type: 'BAD_REQUEST',
      cause: badRequest,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws SERVER_ERROR with the fallback message for an HTTP 500 with no error', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const serverError = httpError(SERVER_ERROR, { errorCode: 42, traceId: 7 })
    legacy.confirmRoute.mockRejectedValue(serverError)

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      message: 'The request failed.',
      type: 'SERVER_ERROR',
      cause: serverError,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED when the response has an error', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const failed = response({
      ok: false,
      result: null,
      error: 'Invalid request ID',
      errorCode: '1001',
      traceId: 99,
    })
    legacy.confirmRoute.mockResolvedValue(failed)

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      message: 'Invalid request ID',
      type: 'REQUEST_FAILED',
      cause: failed,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED for ok: false with no error message', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const failed = response({ ok: false })
    legacy.confirmRoute.mockResolvedValue(failed)

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      cause: failed,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws NO_RESULT when the response has no result', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const empty = response({ result: null })
    legacy.confirmRoute.mockResolvedValue(empty)

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      message: 'No result was found for this request.',
      type: 'NO_RESULT',
      metadata: {},
    })
  })

  test('throws NO_RESULT with the first diagnosis message for a null routing result', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const empty = response({
      result: result({ result: null, diagnosisMessages: ['No liquidity'] }),
    })
    legacy.confirmRoute.mockResolvedValue(empty)

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      type: 'NO_RESULT',
      metadata: { diagnosisMessage: 'No liquidity' },
    })
  })

  test('throws BRIDGE_LIMIT for a swap outside its limits', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
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

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      type: 'BRIDGE_LIMIT',
      metadata: { swap: tooSmall, limit: 'MIN' },
    })
    expect(error).toHaveProperty('metadata', {
      swap: tooSmall,
      limit: 'MIN',
      limitValue: '0.1',
      exclusive: true,
    })
  })

  test('throws UNKNOWN_SLIPPAGE for a flagged swap', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const flagged = response({
      result: result({
        result: {
          outputAmount: '3000',
          resultType: LegacySdk.RoutingResultType.OK,
          swaps: [
            swap({ recommendedSlippage: { error: true, slippage: '2.5' } }),
          ],
        },
      }),
    })
    legacy.confirmRoute.mockResolvedValue(flagged)

    const error = await confirmError(client.confirm(request()))

    expect(error).toMatchObject({
      type: 'UNKNOWN_SLIPPAGE',
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED with the original as cause for a TypeError inside the pipeline', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    legacy.confirmRoute.mockResolvedValue(null)

    const error = await confirmError(client.confirm(request()))

    expect(error).toHaveProperty('type', 'REQUEST_FAILED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('throws REQUEST_CANCELED for a TypeError inside the pipeline when the signal was aborted', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const controller = new AbortController()
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      return null
    })

    const error = await confirmError(
      client.confirm(request(), { signal: controller.signal }),
    )

    expect(error).toHaveProperty('type', 'REQUEST_CANCELED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('rejects with an SdkError raised inside the pipeline unchanged, even when the signal was aborted', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const controller = new AbortController()
    const raised = new SdkError('NO_RESULT', 'Raised inside', { metadata: {} })
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      throw raised
    })

    const error = await confirmError(
      client.confirm(request(), { signal: controller.signal }),
    )

    expect(error).toBe(raised)
  })

  test('rejects with the SdkError a result check throws, even when the signal was aborted', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    const controller = new AbortController()
    const empty = response({ result: null })
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      return empty
    })

    const error = await confirmError(
      client.confirm(request(), { signal: controller.signal }),
    )

    expect(error).toMatchObject({ type: 'NO_RESULT' })
  })

  test('narrows a caught error with instanceof, then metadata on type', async () => {
    const { RangoClient, SdkError } = await loadSdk()
    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains },
    })
    legacy.confirmRoute.mockResolvedValue(response({ result: null }))

    let type: unknown
    try {
      await client.confirm(request())
    } catch (error) {
      if (!(error instanceof SdkError)) {
        throw error
      }
      type = error.type
      switch (error.type) {
        case 'INVALID_INPUT':
          expectTypeOf(error.metadata).toEqualTypeOf<Sdk.InvalidInputMetadata>()
          expectTypeOf(error.metadata.field).toEqualTypeOf<
            'to' | 'amount' | 'destination'
          >()
          if (error.metadata.field === 'destination') {
            expectTypeOf(error.metadata.reason).toEqualTypeOf<
              'NO_ADDRESS_PATTERNS' | 'PATTERN_MISMATCH'
            >()
          }
          break
        case 'NO_RESULT':
          expectTypeOf(error.metadata).toEqualTypeOf<Sdk.NoResultMetadata>()
          break
        case 'BRIDGE_LIMIT':
          expectTypeOf(error.metadata).toEqualTypeOf<Sdk.BridgeLimitMetadata>()
          break
        case 'REQUEST_FAILED':
          expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
          break
        case 'REQUEST_CANCELED':
        case 'BAD_REQUEST':
        case 'UNAUTHORIZED':
        case 'FORBIDDEN':
        case 'NOT_FOUND':
        case 'TOO_MANY_REQUESTS':
        case 'SERVER_ERROR':
        case 'UNKNOWN_SLIPPAGE':
          expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
      }
    }
    expect(type).toBe('NO_RESULT')
  })

  test('has no error field on ConfirmQuote', () => {
    expectTypeOf<Sdk.ConfirmQuote>().not.toHaveProperty('error')
  })
})
