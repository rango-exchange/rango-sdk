import type * as Sdk from '../../mod.js'

import * as LegacySdk from 'rango-sdk'
import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

const legacy = vi.hoisted(() => ({
  confirmRoute: vi.fn(),
  getAllRoutes: vi.fn(),
  getBlockchains: vi.fn(),
}))

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    confirmRoute = legacy.confirmRoute
    getAllRoutes = legacy.getAllRoutes
    getBlockchains = legacy.getBlockchains
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

type QuoteOverrides = Partial<
  Pick<
    Sdk.Quote,
    'requestId' | 'outputAmount' | 'swaps' | 'requestAmount' | 'to'
  > & { routeId: string }
>

function quotesResponse(
  overrides: QuoteOverrides = {},
): LegacySdk.MultiRouteResponse {
  return {
    from: ETH,
    to: overrides.to ?? USDC,
    requestAmount: overrides.requestAmount ?? '1',
    routeId: overrides.routeId ?? 'route-1',
    results: [
      {
        requestId: overrides.requestId ?? 'request-1',
        outputAmount: overrides.outputAmount ?? '3000',
        resultType: LegacySdk.RoutingResultType.OK,
        swaps: overrides.swaps ?? [swap()],
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
  }
}

// Caches one Quote through `quotes()` and returns it; a `null` slippage requests it without one.
async function cacheQuote(
  client: Sdk.RangoClient,
  overrides: QuoteOverrides = {},
  slippage: string | null = '1.5',
): Promise<Sdk.Quote> {
  legacy.getAllRoutes.mockResolvedValueOnce(quotesResponse(overrides))
  const { data } = await client.quotes(
    ETH,
    USDC,
    '1',
    slippage === null ? {} : { req: { slippage } },
  )
  const cached = data.quotes[0]?.data
  if (!cached) {
    throw new Error('quotes() returned no Quote')
  }
  return cached
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

// A client whose blockchain list, once fetched, holds these blockchains.
async function createClient(
  chains: readonly Sdk.BlockchainMeta[] = blockchains,
): Promise<Sdk.RangoClient> {
  const { RangoClient } = await loadSdk()
  legacy.getBlockchains.mockResolvedValue([...chains])
  return new RangoClient({ apiKey: 'test-key' })
}

const SELECTED_WALLETS = { ETH: '0xfrom', BSC: '0xto' }

// Caches a Quote, then confirms it with the default wallets and destination.
async function confirmCached(
  client: Sdk.RangoClient,
  overrides: QuoteOverrides = {},
  options: { signal?: AbortSignal } = {},
): Promise<Sdk.ConfirmResult> {
  const { requestId } = await cacheQuote(client, overrides)
  return client.confirm(requestId, SELECTED_WALLETS, {
    req: { destination: DESTINATION },
    ...options,
  })
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
    legacy.getAllRoutes.mockReset()
    legacy.getBlockchains.mockReset()
    legacy.confirmRoute.mockReset()
    legacy.confirmRoute.mockResolvedValue(response())
  })

  test("sends exactly the cached Quote's request ID, the wallets and the destination, with the signal", async () => {
    const client = await createClient()
    const controller = new AbortController()
    await cacheQuote(client, { requestId: 'request-2' })

    await client.confirm('request-2', SELECTED_WALLETS, {
      req: { destination: DESTINATION },
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
    ['an unknown request ID', 'other', blockchains],
    [
      'an unknown request ID, before checking the destination',
      'other',
      [chain('BSC', ['^bnb1'])],
    ],
  ])(
    'throws INVALID_INPUT NOT_FOUND without sending a request for %s',
    async (_, requestId, chains) => {
      const client = await createClient(chains)
      await cacheQuote(client)

      const error = await confirmError(
        client.confirm(requestId, SELECTED_WALLETS, {
          req: { destination: DESTINATION },
        }),
      )

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field: 'requestId', reason: 'NOT_FOUND' },
      })
      expect(legacy.confirmRoute).not.toHaveBeenCalled()
    },
  )

  test('throws NOT_FOUND without sending a request before any quotes()', async () => {
    const client = await createClient()

    const error = await confirmError(
      client.confirm('request-1', SELECTED_WALLETS),
    )

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      metadata: { field: 'requestId', reason: 'NOT_FOUND' },
    })
    expect(legacy.confirmRoute).not.toHaveBeenCalled()
  })

  test('confirms a Quote from an earlier quotes() after a later one with another route ID', async () => {
    const client = await createClient()
    const { requestId } = await cacheQuote(client, {
      routeId: 'route-a',
      requestId: 'earlier',
    })
    await cacheQuote(client, { routeId: 'route-b', requestId: 'later' })

    await client.confirm(requestId, SELECTED_WALLETS)

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toMatchObject({
      requestId: 'earlier',
    })
  })

  test.each([
    [
      'whose route ID 10 later quotes() dropped',
      Array.from({ length: 10 }, (_, index) => `route-${index}`),
    ],
    ['whose route ID a later quotes() replaced', ['route-a']],
  ])(
    'throws NOT_FOUND without sending a request for a request ID %s',
    async (_, laterRouteIds) => {
      const client = await createClient()
      const { requestId } = await cacheQuote(client, {
        routeId: 'route-a',
        requestId: 'earlier',
      })
      for (const routeId of laterRouteIds) {
        await cacheQuote(client, { routeId, requestId: `later-${routeId}` })
      }

      const error = await confirmError(
        client.confirm(requestId, SELECTED_WALLETS),
      )

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field: 'requestId', reason: 'NOT_FOUND' },
      })
      expect(legacy.confirmRoute).not.toHaveBeenCalled()
    },
  )

  test('confirms the oldest of the last 10 route IDs', async () => {
    const client = await createClient()
    const { requestId } = await cacheQuote(client, {
      routeId: 'route-a',
      requestId: 'oldest',
    })
    const laterRouteIds = Array.from(
      { length: 9 },
      (_, index) => `route-${index}`,
    )
    for (const routeId of laterRouteIds) {
      await cacheQuote(client, { routeId, requestId: `later-${routeId}` })
    }

    await client.confirm(requestId, SELECTED_WALLETS)

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toMatchObject({
      requestId: 'oldest',
    })
  })

  test('throws NOT_FOUND for a request ID another client cached', async () => {
    const first = await createClient()
    const second = await createClient()
    const { requestId } = await cacheQuote(first)

    const error = await confirmError(
      second.confirm(requestId, SELECTED_WALLETS),
    )

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      metadata: { field: 'requestId', reason: 'NOT_FOUND' },
    })
    expect(legacy.confirmRoute).not.toHaveBeenCalled()
  })

  test('still confirms the cached Quote after an untyped caller tries to replace the quotes map through client.cache', async () => {
    const client = await createClient()
    const { requestId } = await cacheQuote(client)
    // What a JavaScript caller can reach, past the ReadonlyCache type.
    const set: unknown = Reflect.get(client.cache, 'set')
    if (typeof set === 'function') {
      Reflect.apply(set, client.cache, ['quotes', new Map()])
    }

    await client.confirm(requestId, SELECTED_WALLETS)

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toMatchObject({ requestId })
  })

  test('confirms the same request ID twice, keeping the Quote cached', async () => {
    const client = await createClient()
    const quote = await cacheQuote(client)

    const first = await client.confirm(quote.requestId, { ETH: '0xa' })
    const second = await client.confirm(quote.requestId, { ETH: '0xb' })

    expect(legacy.confirmRoute.mock.calls.map(([body]) => body)).toEqual([
      { requestId: 'request-1', selectedWallets: { ETH: '0xa' } },
      { requestId: 'request-1', selectedWallets: { ETH: '0xb' } },
    ])
    expect(first.data.selectedWallets).toEqual({ ETH: '0xa' })
    expect(second.data.selectedWallets).toEqual({ ETH: '0xb' })
    expect(
      client.cache.get('quotes')?.get('route-1')?.get(quote.requestId),
    ).toEqual(quote)
  })

  test('confirms the cached Quote as quotes() returned it after the app mutates the returned one, nested values included', async () => {
    const client = await createClient([
      chain('BSC', ['^(0x)[0-9A-Fa-f]{40}$']),
      chain('BNB', ['^bnb1']),
    ])
    // A `to` of its own, since the returned Quote shares it with the response.
    const quote = await cacheQuote(client, { to: { ...USDC } })

    quote.requestId = 'mutated'
    quote.slippage = '99'
    quote.to.blockchain = 'BNB'

    const confirmed = await client.confirm('request-1', SELECTED_WALLETS, {
      req: { destination: DESTINATION },
    })

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toStrictEqual({
      requestId: 'request-1',
      selectedWallets: SELECTED_WALLETS,
      destination: DESTINATION,
    })
    expect(confirmed.data.slippage).toBe('1.5')
  })

  test.each([
    ['leaves the destination key out when the options have none', {}, {}],
    [
      'leaves the destination key out when it is undefined',
      { destination: undefined },
      {},
    ],
    ['forwards an empty destination', { destination: '' }, { destination: '' }],
  ])('%s, without checking it', async (_, given, sent) => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    await cacheQuote(client)

    await client.confirm('request-1', {}, { req: given })

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toStrictEqual({
      requestId: 'request-1',
      selectedWallets: {},
      ...sent,
    })
    expect(legacy.getBlockchains).not.toHaveBeenCalled()
    expect(client.cache.get('blockchains')).toBeUndefined()
  })

  test('sends the request without options', async () => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    await cacheQuote(client)

    await client.confirm('request-1', SELECTED_WALLETS)

    expect(legacy.confirmRoute.mock.lastCall).toStrictEqual([
      { requestId: 'request-1', selectedWallets: SELECTED_WALLETS },
      { signal: undefined },
    ])
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
      const client = await createClient(chains)
      await cacheQuote(client)

      const error = await confirmError(
        client.confirm('request-1', SELECTED_WALLETS, {
          req: { destination },
        }),
      )

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field: 'destination', reason },
      })
      expect(legacy.confirmRoute).not.toHaveBeenCalled()
    },
  )

  test('fetches the blockchain list once on a cold cache, with no signal, and caches it', async () => {
    const client = await createClient()

    expect(client.cache.get('blockchains')).toBeUndefined()
    await confirmCached(client)

    expect(legacy.getBlockchains.mock.calls).toStrictEqual([
      [{ signal: undefined }],
    ])
    expect(client.cache.get('blockchains')).toStrictEqual(blockchains)
    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
  })

  test("doesn't fetch the blockchain list again once it is cached", async () => {
    const client = await createClient()

    await confirmCached(client)
    await confirmCached(client)

    expect(legacy.getBlockchains).toHaveBeenCalledOnce()
    expect(legacy.confirmRoute).toHaveBeenCalledTimes(2)
  })

  test('sends the signal with the blockchain list fetch', async () => {
    const client = await createClient()
    const controller = new AbortController()

    await confirmCached(client, {}, { signal: controller.signal })

    expect(legacy.getBlockchains.mock.lastCall).toStrictEqual([
      { signal: controller.signal },
    ])
  })

  test('throws an SdkError typed by HTTP status when the blockchain list fetch fails, caching nothing, and fetches again on the next call', async () => {
    const client = await createClient()
    legacy.getBlockchains.mockRejectedValueOnce(
      httpError(SERVER_ERROR, { error: 'Server is down' }),
    )

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      type: 'SERVER_ERROR',
      message: 'Server is down',
    })
    expect(client.cache.get('blockchains')).toBeUndefined()
    expect(legacy.confirmRoute).not.toHaveBeenCalled()

    await confirmCached(client)

    expect(legacy.getBlockchains).toHaveBeenCalledTimes(2)
    expect(client.cache.get('blockchains')).toStrictEqual(blockchains)
    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
  })

  test('throws REQUEST_CANCELED when the signal aborts the blockchain list fetch, caching nothing', async () => {
    const client = await createClient()
    const controller = new AbortController()
    legacy.getBlockchains.mockImplementationOnce(async () => {
      controller.abort()
      throw new TypeError('aborted')
    })

    const error = await confirmError(
      confirmCached(client, {}, { signal: controller.signal }),
    )

    expect(error).toHaveProperty('type', 'REQUEST_CANCELED')
    expect(client.cache.get('blockchains')).toBeUndefined()
    expect(legacy.confirmRoute).not.toHaveBeenCalled()
  })

  test('checks the request ID before fetching the blockchain list', async () => {
    const client = await createClient()

    const error = await confirmError(
      client.confirm('missing', SELECTED_WALLETS, {
        req: { destination: DESTINATION },
      }),
    )

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      metadata: { field: 'requestId', reason: 'NOT_FOUND' },
    })
    expect(legacy.getBlockchains).not.toHaveBeenCalled()
  })

  test('types the blockchains slot, and has no metadata slot', async () => {
    const client = await createClient()

    expectTypeOf(client.cache.get('blockchains')).toEqualTypeOf<
      readonly Sdk.BlockchainMeta[] | undefined
    >()
    // @ts-expect-error there is no metadata slot
    void client.cache.get('metadata')
  })

  test("reads the destination blockchain from the cached Quote's `to`", async () => {
    const client = await createClient([
      chain('BSC', ['^(0x)[0-9A-Fa-f]{40}$']),
      chain('BNB', ['^bnb1']),
    ])

    const error = await confirmError(
      confirmCached(client, {
        requestId: 'to-bnb',
        to: { ...USDC, blockchain: 'BNB' },
      }),
    )
    await confirmCached(client)

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      metadata: { field: 'destination', reason: 'PATTERN_MISMATCH' },
    })
    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
  })

  test('sends a destination that matches any pattern, skipping a pattern that is not a valid regular expression', async () => {
    const client = await createClient([
      chain('BSC', ['^invalid($', '^bnb1', '^(0x)[0-9a-f]{40}$']),
    ])

    await confirmCached(client)

    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
  })

  test.each(['abc', '0', '100'])(
    "doesn't check the cached Quote's slippage %j",
    async (slippage) => {
      const client = await createClient()
      await cacheQuote(client, {}, slippage)

      await client.confirm('request-1', SELECTED_WALLETS)

      expect(legacy.confirmRoute).toHaveBeenCalledOnce()
    },
  )

  test('confirms a Quote without a slippage and gives it no slippage warnings', async () => {
    const client = await createClient()
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
    await cacheQuote(client, {}, null)

    const { warnings } = await client.confirm('request-1', SELECTED_WALLETS)

    expect(legacy.confirmRoute).toHaveBeenCalledOnce()
    expect(warnings).toEqual([])
  })

  test('resolves to data (the confirm result without its diagnosis messages, with selectedWallets and slippage), no warnings and _response as received', async () => {
    const client = await createClient()
    const confirmedResult = result({
      diagnosisMessages: ['Some swappers are down'],
    })
    const confirmResponse = response({ result: confirmedResult, traceId: 12 })
    legacy.confirmRoute.mockResolvedValue(confirmResponse)

    const confirmed = await confirmCached(client)

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
    const client = await createClient()
    const {
      from: _from,
      to: _to,
      requestAmount: _amount,
      ...partial
    } = result()
    legacy.confirmRoute.mockResolvedValue(
      response({ result: partial as ConfirmResult }),
    )

    const { data: route } = await confirmCached(client)

    expect(route).not.toHaveProperty('from')
    expect(route).not.toHaveProperty('to')
    expect(route).not.toHaveProperty('requestAmount')
    expect(route).not.toHaveProperty('destination')
  })

  test('carries a copy of selectedWallets and the cached Quote slippage, without the destination', async () => {
    const client = await createClient()
    const selectedWallets = { ETH: '0xfrom', BSC: '0xto', SOLANA: 'sol' }
    await cacheQuote(client, {}, '2')

    const confirmed = await client.confirm('request-1', selectedWallets, {
      req: { destination: DESTINATION },
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

  test('has no slippage key when the cached Quote has none', async () => {
    const client = await createClient()
    await cacheQuote(client, {}, null)

    const confirmed = await client.confirm('request-1', SELECTED_WALLETS)

    expect(confirmed.data).not.toHaveProperty('slippage')
    expect(confirmed.data.selectedWallets).toEqual(SELECTED_WALLETS)
  })

  test('confirms a Quote from a quotes() result by its request ID', async () => {
    const client = await createClient()
    legacy.getAllRoutes.mockResolvedValue(quotesResponse())
    const { data } = await client.quotes(ETH, USDC, '1', {
      req: { slippage: '1.5' },
    })
    const chosen = data.quotes.find((entry) => !entry.error)
    if (!chosen) {
      throw new Error('quotes() returned no usable Quote')
    }

    const confirmed = await client.confirm(
      chosen.data.requestId,
      SELECTED_WALLETS,
    )

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toStrictEqual({
      requestId: 'request-1',
      selectedWallets: SELECTED_WALLETS,
    })
    expect(confirmed.data.slippage).toBe('1.5')
  })

  test('resolves to plain JSON that survives a round-trip unchanged', async () => {
    const client = await createClient()

    const confirmed = await confirmCached(client)

    expect(JSON.parse(JSON.stringify(confirmed))).toStrictEqual(confirmed)
  })

  test('tells a confirm() result apart from a quote() result by type', () => {
    expectTypeOf<Sdk.QuoteResult>().not.toExtend<Sdk.ConfirmResult>()
  })

  test('takes the request ID and the wallets as arguments, and only req and signal as options', async () => {
    const client = await createClient()

    expectTypeOf(client.confirm).parameters.toEqualTypeOf<
      [
        string,
        LegacySdk.ConfirmRouteRequest['selectedWallets'],
        ({ req?: Sdk.ConfirmReq; signal?: AbortSignal } | undefined)?,
      ]
    >()
    expectTypeOf<Sdk.ConfirmReq>().toEqualTypeOf<{ destination?: string }>()
  })

  test('rejects a Quote, a one-object request, a flat destination and any meta in the options', () => {
    const quote = quotesResponse().results[0]
    const misuse = async (client: Sdk.RangoClient) => {
      // @ts-expect-error the Quote is read from the cache by its request ID
      await client.confirm(quote, SELECTED_WALLETS)
      // @ts-expect-error the one-object call is replaced
      await client.confirm({ requestId: 'request-1', selectedWallets: {} })
      await client.confirm(
        'request-1',
        SELECTED_WALLETS,
        // @ts-expect-error the destination is passed in req
        { destination: DESTINATION },
      )
      await client.confirm(
        'request-1',
        SELECTED_WALLETS,
        // @ts-expect-error the client fetches the blockchains itself
        { meta: { blockchains } },
      )
      // @ts-expect-error the wallets are required
      await client.confirm('request-1')
    }

    expectTypeOf(misuse).toBeFunction()
  })

  test('exports ConfirmReq and SelectedWallets, and not ConfirmRequest, ConfirmQuote or ConfirmRouteRequest', () => {
    expectTypeOf<Sdk.ConfirmReq>().toHaveProperty('destination')
    expectTypeOf<Sdk.SelectedWallets>().toEqualTypeOf<
      LegacySdk.ConfirmRouteRequest['selectedWallets']
    >()
    // @ts-expect-error ConfirmRequest is not exported
    expectTypeOf<Sdk.ConfirmRequest>().not.toBeNever()
    // @ts-expect-error ConfirmQuote is not exported
    expectTypeOf<Sdk.ConfirmQuote>().not.toBeNever()
    // @ts-expect-error ConfirmRouteRequest is not exported
    expectTypeOf<Sdk.ConfirmRouteRequest>().not.toBeNever()
  })

  test('sends the request for a Quote whose entry has an error, without checking it', async () => {
    const client = await createClient()
    legacy.getAllRoutes.mockResolvedValue(
      quotesResponse({ swaps: [swap({ fromAmountMinValue: '2' })] }),
    )
    const { data } = await client.quotes(ETH, USDC, '1')
    expect(data.quotes[0]?.error).toMatchObject({ type: 'BRIDGE_LIMIT' })

    await client.confirm('request-1', SELECTED_WALLETS, {
      req: { destination: DESTINATION },
    })

    expect(legacy.confirmRoute.mock.lastCall?.[0]).toStrictEqual({
      requestId: 'request-1',
      selectedWallets: SELECTED_WALLETS,
      destination: DESTINATION,
    })
  })

  test('raises EXCESSIVE_OUTPUT_AMOUNT_CHANGE against the cached Quote', async () => {
    const client = await createClient()
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

    const confirmed = await confirmCached(client)

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
      const client = await createClient()
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

      const { warnings } = await confirmCached(client, {
        requestAmount: quoteAmount,
      })

      expect(
        warnings.some(({ type }) => type === 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE'),
      ).toBe(raised)
    },
  )

  test('does not raise EXCESSIVE_OUTPUT_AMOUNT_CHANGE for a drop smaller than 1%', async () => {
    const client = await createClient()
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

    const { warnings } = await confirmCached(client)

    expect(warnings).toEqual([])
  })

  test('raises HIGH_FEE and LONG_DURATION at the thresholds', async () => {
    const client = await createClient()
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

    const { warnings } = await confirmCached(client)

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

  test('resolves with the quote() warnings, including INSUFFICIENT_BALANCE', async () => {
    const client = await createClient()
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
    await cacheQuote(client, {}, '6')

    const { warnings } = await client.confirm('request-1', SELECTED_WALLETS)

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
    const client = await createClient()
    const controller = new AbortController()
    const canceled = new Error('canceled')
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      throw canceled
    })

    const error = await confirmError(
      confirmCached(client, {}, { signal: controller.signal }),
    )

    expect(error).toMatchObject({
      type: 'REQUEST_CANCELED',
      cause: canceled,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws BAD_REQUEST with the body error message for an HTTP 400', async () => {
    const client = await createClient()
    const badRequest = httpError(BAD_REQUEST, { error: 'Route expired' })
    legacy.confirmRoute.mockRejectedValue(badRequest)

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      message: 'Route expired',
      type: 'BAD_REQUEST',
      cause: badRequest,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws SERVER_ERROR with the fallback message for an HTTP 500 with no error', async () => {
    const client = await createClient()
    const serverError = httpError(SERVER_ERROR, { errorCode: 42, traceId: 7 })
    legacy.confirmRoute.mockRejectedValue(serverError)

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      message: 'The request failed.',
      type: 'SERVER_ERROR',
      cause: serverError,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED when the response has an error', async () => {
    const client = await createClient()
    const failed = response({
      ok: false,
      result: null,
      error: 'Invalid request ID',
      errorCode: '1001',
      traceId: 99,
    })
    legacy.confirmRoute.mockResolvedValue(failed)

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      message: 'Invalid request ID',
      type: 'REQUEST_FAILED',
      cause: failed,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED for ok: false with no error message', async () => {
    const client = await createClient()
    const failed = response({ ok: false })
    legacy.confirmRoute.mockResolvedValue(failed)

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      cause: failed,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws NO_RESULT when the response has no result', async () => {
    const client = await createClient()
    const empty = response({ result: null })
    legacy.confirmRoute.mockResolvedValue(empty)

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      message: 'No result was found for this request.',
      type: 'NO_RESULT',
      metadata: {},
    })
  })

  test('throws NO_RESULT with the first diagnosis message for a null routing result', async () => {
    const client = await createClient()
    const empty = response({
      result: result({ result: null, diagnosisMessages: ['No liquidity'] }),
    })
    legacy.confirmRoute.mockResolvedValue(empty)

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      type: 'NO_RESULT',
      metadata: { diagnosisMessage: 'No liquidity' },
    })
  })

  test('throws BRIDGE_LIMIT for a swap outside its limits', async () => {
    const client = await createClient()
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

    const error = await confirmError(confirmCached(client))

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
    const client = await createClient()
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

    const error = await confirmError(confirmCached(client))

    expect(error).toMatchObject({
      type: 'UNKNOWN_SLIPPAGE',
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED with the original as cause for a TypeError inside the pipeline', async () => {
    const client = await createClient()
    legacy.confirmRoute.mockResolvedValue(null)

    const error = await confirmError(confirmCached(client))

    expect(error).toHaveProperty('type', 'REQUEST_FAILED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('throws REQUEST_CANCELED for a TypeError inside the pipeline when the signal was aborted', async () => {
    const client = await createClient()
    const controller = new AbortController()
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      return null
    })

    const error = await confirmError(
      confirmCached(client, {}, { signal: controller.signal }),
    )

    expect(error).toHaveProperty('type', 'REQUEST_CANCELED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('rejects with an SdkError raised inside the pipeline unchanged, even when the signal was aborted', async () => {
    const { SdkError } = await loadSdk()
    const client = await createClient()
    const controller = new AbortController()
    const raised = new SdkError('NO_RESULT', 'Raised inside', { metadata: {} })
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      throw raised
    })

    const error = await confirmError(
      confirmCached(client, {}, { signal: controller.signal }),
    )

    expect(error).toBe(raised)
  })

  test('rejects with the SdkError a result check throws, even when the signal was aborted', async () => {
    const client = await createClient()
    const controller = new AbortController()
    const empty = response({ result: null })
    legacy.confirmRoute.mockImplementation(async () => {
      controller.abort()
      return empty
    })

    const error = await confirmError(
      confirmCached(client, {}, { signal: controller.signal }),
    )

    expect(error).toMatchObject({ type: 'NO_RESULT' })
  })

  test('narrows a caught error with instanceof, then metadata on type', async () => {
    const { SdkError } = await loadSdk()
    const client = await createClient()
    legacy.confirmRoute.mockResolvedValue(response({ result: null }))

    let type: unknown
    try {
      await confirmCached(client)
    } catch (error) {
      if (!(error instanceof SdkError)) {
        throw error
      }
      type = error.type
      switch (error.type) {
        case 'INVALID_INPUT':
          expectTypeOf(error.metadata).toEqualTypeOf<Sdk.InvalidInputMetadata>()
          expectTypeOf(error.metadata.field).toEqualTypeOf<
            'requestId' | 'to' | 'amount' | 'destination'
          >()
          if (error.metadata.field === 'requestId') {
            expectTypeOf(error.metadata.reason).toEqualTypeOf<'NOT_FOUND'>()
          }
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
})
