import type * as Sdk from '../../mod.js'

import * as LegacySdk from 'rango-sdk'
import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

import {
  BAD_REQUEST,
  blockchains,
  chain,
  createClient,
  DESTINATION,
  ETH,
  httpClient,
  httpError,
  loadSdk,
  expectSdkError as quoteError,
  resetHttpClient,
  SERVER_ERROR,
  swap,
  USDC,
  validationStatus,
} from '../../../tests/support.js'

const request: Sdk.QuoteRequest = {
  from: ETH,
  to: USDC,
  amount: '1',
  selectedWallets: {
    ETH: { address: '0xfrom', walletId: 'metamask' },
    BSC: { address: '0xto', walletId: 'trust' },
  },
  destination: DESTINATION,
  slippage: '1.5',
  swappers: ['Across'],
}
// What `getBestRoute` gets for `request`: the addresses, with no Wallet IDs.
const SENT_SELECTED_WALLETS = { ETH: '0xfrom', BSC: '0xto' }
const sentRequest = { ...request, selectedWallets: SENT_SELECTED_WALLETS }

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

describe('quote', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    httpClient.getBestRoute.mockResolvedValue(response())
  })

  test('sends the request with the affiliate fields as given and the signal', async () => {
    const client = await createClient()
    const controller = new AbortController()
    const withAffiliate: Sdk.QuoteRequest = {
      ...request,
      affiliateRef: 'REF',
      affiliatePercent: 0.2,
      affiliateWallets: { ETH: '0xaff' },
    }

    await client.quote(withAffiliate, { signal: controller.signal })

    expect(httpClient.getBestRoute.mock.lastCall).toEqual([
      {
        ...withAffiliate,
        selectedWallets: SENT_SELECTED_WALLETS,
        checkPrerequisites: true,
      },
      { signal: controller.signal },
    ])
  })

  test('sends no affiliate fields when the request has none', async () => {
    const client = await createClient()

    await client.quote(request)

    expect(httpClient.getBestRoute.mock.lastCall?.[0]).toEqual({
      ...sentRequest,
      checkPrerequisites: true,
    })
  })

  test('sends each request with its own affiliate', async () => {
    const client = await createClient()

    await client.quote({
      ...request,
      affiliateRef: 'OLD',
      affiliatePercent: 0.1,
    })
    await client.quote({ ...request, affiliateRef: 'NEW' })

    expect(httpClient.getBestRoute.mock.lastCall?.[0]).toEqual({
      ...sentRequest,
      affiliateRef: 'NEW',
      checkPrerequisites: true,
    })
  })

  test.each([true, false])(
    'sends checkPrerequisites: %s as given',
    async (checkPrerequisites) => {
      const client = await createClient()

      await client.quote({ ...request, checkPrerequisites })

      expect(httpClient.getBestRoute.mock.lastCall?.[0]).toEqual({
        ...sentRequest,
        checkPrerequisites,
      })
    },
  )

  test.each<[string, Sdk.QuoteRequest]>([
    ['leaves it out', request],
    ['sets it to undefined', { ...request, checkPrerequisites: undefined }],
  ])(
    'sends checkPrerequisites: true when the request %s',
    async (_, quoteRequest) => {
      const client = await createClient()

      await client.quote(quoteRequest)

      expect(httpClient.getBestRoute.mock.lastCall?.[0]).toEqual({
        ...sentRequest,
        checkPrerequisites: true,
      })
    },
  )

  test('takes the best-route request as it is, with a Wallet ID in each selected wallet', () => {
    expectTypeOf<
      Omit<Sdk.QuoteRequest, 'checkPrerequisites' | 'selectedWallets'>
    >().toEqualTypeOf<
      Omit<LegacySdk.BestRouteRequest, 'checkPrerequisites' | 'selectedWallets'>
    >()
    expectTypeOf<
      Sdk.QuoteRequest['selectedWallets']
    >().toEqualTypeOf<Sdk.SelectedWallets>()
    expectTypeOf<Sdk.SelectedWallets[string]>().toEqualTypeOf<{
      address: string
      walletId: string
    }>()
    expectTypeOf<Sdk.SelectedWallet>().toEqualTypeOf<
      Sdk.SelectedWallets[string]
    >()
    expectTypeOf<Sdk.QuoteRequest['checkPrerequisites']>().toEqualTypeOf<
      LegacySdk.BestRouteRequest['checkPrerequisites']
    >()
  })

  test('resolves to data (the response without its error fields and diagnosis messages, with selectedWallets and slippage merged in), no warnings and _response as received', async () => {
    const client = await createClient()
    const success = response({
      diagnosisMessages: ['Some swappers are down'],
      traceId: 12,
    })
    httpClient.getBestRoute.mockResolvedValue(success)

    const quoted = await client.quote(request)

    expect(quoted).toEqual({
      data: {
        requestId: 'request-1',
        requestAmount: '1',
        from: ETH,
        to: USDC,
        result: success.result,
        validationStatus,
        missingBlockchains: [],
        walletNotSupportingFromBlockchain: false,
        selectedWallets: request.selectedWallets,
        slippage: '1.5',
      },
      warnings: [],
      _response: success,
    })
    expect(quoted._response).toBe(success)
    expect(quoted).not.toHaveProperty('error')
    expect(quoted.data.selectedWallets).not.toBe(request.selectedWallets)
    expect(quoted.data.selectedWallets.ETH).not.toBe(
      request.selectedWallets.ETH,
    )
    expectTypeOf(quoted.data).toEqualTypeOf<Sdk.Route>()
  })

  test('leaves the slippage key out when the request has none', async () => {
    const client = await createClient()
    const { slippage: _slippage, ...withoutSlippage } = request

    const { data: route } = await client.quote(withoutSlippage)

    expect(route).not.toHaveProperty('slippage')
  })

  test('types the quote and confirm data as the same Route', () => {
    expectTypeOf<Sdk.QuoteResult['data']>().toEqualTypeOf<
      Sdk.ConfirmResult['data']
    >()
  })

  test('types the result with no error field and the legacy response as _response', () => {
    expectTypeOf<Sdk.QuoteResult>().not.toHaveProperty('error')
    expectTypeOf<
      Sdk.QuoteResult['_response']
    >().toEqualTypeOf<LegacySdk.BestRouteResponse>()
    expectTypeOf<Sdk.QuoteResult>().not.toExtend<Sdk.ConfirmResult>()
  })

  test('fills in only selectedWallets and slippage from the request when the response leaves fields out', async () => {
    const client = await createClient()
    const {
      from: _from,
      to: _to,
      requestAmount: _amount,
      ...partial
    } = response()
    httpClient.getBestRoute.mockResolvedValue(partial)

    const { data: route } = await client.quote(request)

    expect(route).not.toHaveProperty('from')
    expect(route).not.toHaveProperty('to')
    expect(route).not.toHaveProperty('requestAmount')
    expect(route).toHaveProperty('selectedWallets', request.selectedWallets)
    expect(route).toHaveProperty('slippage', request.slippage)
    expect(route).not.toHaveProperty('destination')
  })

  test('resolves with every warning that applies, including INSUFFICIENT_BALANCE', async () => {
    const client = await createClient()
    const shortOnFee = {
      asset: ETH,
      requiredAmount: { amount: '2000000000000000000', decimals: 18 },
      currentAmount: { amount: '1000000000000000000', decimals: 18 },
      ok: false,
      reason: 'FEE_AND_INPUT_ASSET' as const,
    }
    httpClient.getBestRoute.mockResolvedValue(
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
          reason: 'FEE_AND_INPUT_ASSET',
        },
      },
    ])
    expectTypeOf(warnings).toEqualTypeOf<Sdk.SdkWarning[]>()
  })

  test('raises HIGH_SLIPPAGE above the threshold', async () => {
    const client = await createClient()

    const atThreshold = await client.quote({ ...request, slippage: '5' })
    const above = await client.quote({ ...request, slippage: '6' })

    expect(atThreshold.warnings).toEqual([])
    expect(above.warnings).toEqual([
      {
        type: 'HIGH_SLIPPAGE',
        message: 'The slippage is above the high-slippage threshold.',
        metadata: { slippage: '6' },
      },
    ])
  })

  test('takes no per-call validation option', async () => {
    const client = await createClient()

    expectTypeOf(client.quote)
      .parameter(1)
      .toEqualTypeOf<Sdk.RequestOptions | undefined>()
  })

  test('takes the blockchains from the client, not the options', () => {
    const misuse = async (client: Sdk.RangoClient) => {
      // @ts-expect-error the client fetches the blockchains itself
      await client.quote(request, { meta: { blockchains } })
    }

    expectTypeOf(misuse).toBeFunction()
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
    httpClient.getBestRoute.mockResolvedValue(
      response({
        result: {
          outputAmount: '3000',
          resultType: LegacySdk.RoutingResultType.OK,
          swaps: [
            swap({ fee: [networkFee], estimatedTimeInSeconds: 600 }),
            swap({ fee: [networkFee], estimatedTimeInSeconds: 300 }),
          ],
        },
      }),
    )

    const { warnings } = await client.quote(request)

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

  test.each<[string, Record<string, unknown>, string, string]>([
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
    ['the amount is not a number', { amount: 'abc' }, 'amount', 'NOT_A_NUMBER'],
    ['the amount is empty', { amount: '' }, 'amount', 'NOT_A_NUMBER'],
    ['the amount is 0', { amount: '0' }, 'amount', 'NOT_POSITIVE'],
    ['the amount is negative', { amount: '-1' }, 'amount', 'NOT_POSITIVE'],
  ])(
    'throws INVALID_INPUT without sending a request when %s',
    async (_, overrides, field, reason) => {
      const client = await createClient()
      // Untyped callers can send anything; the checks still run.
      const error = await quoteError(client.quote({ ...request, ...overrides }))

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field, reason },
      })
      expect(httpClient.getBestRoute).not.toHaveBeenCalled()
    },
  )

  test.each([
    ['leaves the destination key out when the request has none', {}],
    [
      'leaves the destination key out when it is undefined',
      { destination: undefined },
    ],
    ['forwards an empty destination', { destination: '' }],
  ])('%s, without checking it', async (_, given) => {
    const { RangoClient } = await loadSdk()
    const client = new RangoClient({ apiKey: 'test-key' })
    const { destination: _destination, ...withoutDestination } = request
    const sent = { ...withoutDestination, ...given }

    await client.quote(sent)

    expect(httpClient.getBestRoute.mock.lastCall?.[0]).toStrictEqual({
      checkPrerequisites: true,
      ...sent,
      selectedWallets: SENT_SELECTED_WALLETS,
    })
    expect(httpClient.getBlockchains).not.toHaveBeenCalled()
    expect(client.cache.get('blockchains')).toBeUndefined()
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

      const error = await quoteError(client.quote({ ...request, destination }))

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field: 'destination', reason },
      })
      expect(httpClient.getBestRoute).not.toHaveBeenCalled()
    },
  )

  test('fetches the blockchain list once on a cold cache, with no signal, and caches it', async () => {
    const client = await createClient()

    expect(client.cache.get('blockchains')).toBeUndefined()
    await client.quote(request)

    expect(httpClient.getBlockchains.mock.calls).toStrictEqual([
      [{ signal: undefined }],
    ])
    expect(client.cache.get('blockchains')).toStrictEqual(blockchains)
    expect(httpClient.getBestRoute).toHaveBeenCalledOnce()
  })

  test("doesn't fetch the blockchain list again once it is cached", async () => {
    const client = await createClient()

    await client.quote(request)
    await client.quote(request)
    await quoteError(client.quote({ ...request, destination: '0x123' }))

    expect(httpClient.getBlockchains).toHaveBeenCalledOnce()
    expect(httpClient.getBestRoute).toHaveBeenCalledTimes(2)
  })

  test('keeps a cached empty blockchain list', async () => {
    const client = await createClient([])

    const first = await quoteError(client.quote(request))
    const second = await quoteError(client.quote(request))

    for (const error of [first, second]) {
      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field: 'destination', reason: 'NO_ADDRESS_PATTERNS' },
      })
    }
    expect(client.cache.get('blockchains')).toStrictEqual([])
    expect(httpClient.getBlockchains).toHaveBeenCalledOnce()
  })

  test('sends the signal with the blockchain list fetch', async () => {
    const client = await createClient()
    const controller = new AbortController()

    await client.quote(request, { signal: controller.signal })

    expect(httpClient.getBlockchains.mock.lastCall).toStrictEqual([
      { signal: controller.signal },
    ])
  })

  test('throws an SdkError typed by HTTP status when the blockchain list fetch fails, caching nothing, and fetches again on the next call', async () => {
    const client = await createClient()
    httpClient.getBlockchains.mockRejectedValueOnce(
      httpError(SERVER_ERROR, { error: 'Server is down' }),
    )

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'SERVER_ERROR',
      message: 'Server is down',
    })
    expect(client.cache.get('blockchains')).toBeUndefined()
    expect(httpClient.getBestRoute).not.toHaveBeenCalled()

    await client.quote(request)

    expect(httpClient.getBlockchains).toHaveBeenCalledTimes(2)
    expect(client.cache.get('blockchains')).toStrictEqual(blockchains)
    expect(httpClient.getBestRoute).toHaveBeenCalledOnce()
  })

  test('throws REQUEST_CANCELED when the signal aborts the blockchain list fetch, caching nothing', async () => {
    const client = await createClient()
    const controller = new AbortController()
    httpClient.getBlockchains.mockImplementationOnce(async () => {
      controller.abort()
      throw new TypeError('aborted')
    })

    const error = await quoteError(
      client.quote(request, { signal: controller.signal }),
    )

    expect(error).toHaveProperty('type', 'REQUEST_CANCELED')
    expect(client.cache.get('blockchains')).toBeUndefined()
    expect(httpClient.getBestRoute).not.toHaveBeenCalled()
  })

  test("two clients don't share a cached blockchain list", async () => {
    const first = await createClient()
    const second = await createClient()

    await first.quote(request)

    expect(first.cache.get('blockchains')).toBeDefined()
    expect(second.cache.get('blockchains')).toBeUndefined()
  })

  test('types the blockchains slot, and has no metadata slot', async () => {
    const client = await createClient()

    expectTypeOf(client.cache.get('blockchains')).toEqualTypeOf<
      readonly Sdk.BlockchainMeta[] | undefined
    >()
    // @ts-expect-error there is no metadata slot
    void client.cache.get('metadata')
    // @ts-expect-error there is no metadata() method
    void client.metadata
  })

  test("reads the destination blockchain from the request's `to`", async () => {
    const client = await createClient([
      chain('BSC', ['^(0x)[0-9A-Fa-f]{40}$']),
      chain('BNB', ['^bnb1']),
    ])

    const error = await quoteError(
      client.quote({ ...request, to: { ...USDC, blockchain: 'BNB' } }),
    )
    await client.quote(request)

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      metadata: { field: 'destination', reason: 'PATTERN_MISMATCH' },
    })
    expect(httpClient.getBestRoute).toHaveBeenCalledOnce()
  })

  test('sends a destination that matches any pattern, skipping a pattern that is not a valid regular expression', async () => {
    const client = await createClient([
      chain('BSC', ['^invalid($', '^bnb1', '^(0x)[0-9a-f]{40}$']),
    ])

    await client.quote(request)

    expect(httpClient.getBestRoute).toHaveBeenCalledOnce()
  })

  test.each<[string, Record<string, unknown>, string, string]>([
    ['to is the same asset as from', { to: { ...ETH } }, 'to', 'SAME_ASSET'],
    ['the amount is not a number', { amount: 'abc' }, 'amount', 'NOT_A_NUMBER'],
  ])(
    'checks the request before the destination when %s',
    async (_, overrides, field, reason) => {
      const client = await createClient()

      const error = await quoteError(
        client.quote({ ...request, ...overrides, destination: '0x123' }),
      )

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        metadata: { field, reason },
      })
      expect(httpClient.getBlockchains).not.toHaveBeenCalled()
    },
  )

  test.each([
    ['blockchain', { ...ETH, blockchain: 'ARBITRUM' }],
    ['symbol', { ...ETH, symbol: 'WETH' }],
    ['address', { ...ETH, address: '0x1' }],
  ])('sends a request whose assets differ only by %s', async (_, to) => {
    const client = await createClient()

    await client.quote({ ...request, from: ETH, to })

    expect(httpClient.getBestRoute).toHaveBeenCalledOnce()
  })

  test.each(['abc', '0', '-1', '100'])(
    'sends the slippage %j as it is',
    async (slippage) => {
      const client = await createClient()

      await client.quote({ ...request, slippage })

      expect(httpClient.getBestRoute).toHaveBeenCalledWith(
        expect.objectContaining({ slippage }),
        expect.anything(),
      )
    },
  )

  test('throws REQUEST_CANCELED when the signal aborts the request, even for an HTTP 400', async () => {
    const client = await createClient()
    const controller = new AbortController()
    const canceled = httpError(BAD_REQUEST, { error: 'canceled' })
    httpClient.getBestRoute.mockImplementation(async () => {
      controller.abort()
      throw canceled
    })

    const error = await quoteError(
      client.quote(request, { signal: controller.signal }),
    )

    expect(error).toMatchObject({
      type: 'REQUEST_CANCELED',
      cause: canceled,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws BAD_REQUEST with the body error message for an HTTP 400', async () => {
    const client = await createClient()
    const badRequest = httpError(BAD_REQUEST, {
      error: 'Amount is too small',
      errorCode: 1,
      traceId: 2,
    })
    httpClient.getBestRoute.mockRejectedValue(badRequest)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      message: 'Amount is too small',
      type: 'BAD_REQUEST',
      cause: badRequest,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws SERVER_ERROR with the fallback message for an HTTP 500 with no error', async () => {
    const client = await createClient()
    const serverError = httpError(SERVER_ERROR, { errorCode: 42, traceId: 7 })
    httpClient.getBestRoute.mockRejectedValue(serverError)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      message: 'The request failed.',
      type: 'SERVER_ERROR',
      cause: serverError,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED without metadata for a network failure', async () => {
    const client = await createClient()
    const networkError = new Error('Network Error')
    httpClient.getBestRoute.mockRejectedValue(networkError)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      cause: networkError,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws REQUEST_FAILED when the response has an error, before checking the result', async () => {
    const client = await createClient()
    const failed = response({
      result: null,
      error: 'Invalid asset',
      errorCode: 1001,
      traceId: 99,
    })
    httpClient.getBestRoute.mockResolvedValue(failed)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      message: 'Invalid asset',
      type: 'REQUEST_FAILED',
      cause: failed,
    })
    expect(error).not.toHaveProperty('metadata')
  })

  test('throws NO_RESULT with the first diagnosis message for a null result', async () => {
    const client = await createClient()
    const empty = response({
      result: null,
      diagnosisMessages: ['No liquidity', 'Other'],
    })
    httpClient.getBestRoute.mockResolvedValue(empty)

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({
      message: 'No result was found for this request.',
      type: 'NO_RESULT',
      metadata: { diagnosisMessage: 'No liquidity' },
    })
  })

  test('throws NO_RESULT for a result with no swaps', async () => {
    const client = await createClient()
    httpClient.getBestRoute.mockResolvedValue(
      response({
        result: {
          outputAmount: '0',
          resultType: LegacySdk.RoutingResultType.NO_ROUTE,
          swaps: [],
        },
      }),
    )

    const error = await quoteError(client.quote(request))

    expect(error).toMatchObject({ type: 'NO_RESULT', metadata: {} })
  })

  test('throws BRIDGE_LIMIT for a swap outside its limits', async () => {
    const client = await createClient()
    const tooLarge = swap({
      fromAmount: '10',
      recommendedSlippage: { error: true, slippage: '3' },
    })
    httpClient.getBestRoute.mockResolvedValue(
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
      type: 'BRIDGE_LIMIT',
      metadata: { swap: tooLarge, limit: 'MAX' },
    })
    expect(error).toHaveProperty('metadata', {
      swap: tooLarge,
      limit: 'MAX',
      limitValue: '10',
      exclusive: true,
    })
  })

  test('throws UNKNOWN_SLIPPAGE for a flagged swap, with or without a slippage', async () => {
    const client = await createClient()
    const flaggedResponse = response({
      result: {
        outputAmount: '3000',
        resultType: LegacySdk.RoutingResultType.OK,
        swaps: [
          swap(),
          swap({ recommendedSlippage: { error: true, slippage: '2.5' } }),
        ],
      },
    })
    httpClient.getBestRoute.mockResolvedValue(flaggedResponse)
    const { slippage: _, ...withoutSlippage } = request

    for (const sent of [request, withoutSlippage]) {
      const error = await quoteError(client.quote(sent))

      expect(error).toMatchObject({
        type: 'UNKNOWN_SLIPPAGE',
      })
      expect(error).not.toHaveProperty('metadata')
    }
  })

  test('throws REQUEST_FAILED with the original as cause for a TypeError inside the pipeline', async () => {
    const client = await createClient()
    httpClient.getBestRoute.mockResolvedValue(null)

    const error = await quoteError(client.quote(request))

    expect(error).toHaveProperty('type', 'REQUEST_FAILED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('throws REQUEST_CANCELED for a TypeError inside the pipeline when the signal was aborted', async () => {
    const client = await createClient()
    const controller = new AbortController()
    httpClient.getBestRoute.mockImplementation(async () => {
      controller.abort()
      return null
    })

    const error = await quoteError(
      client.quote(request, { signal: controller.signal }),
    )

    expect(error).toHaveProperty('type', 'REQUEST_CANCELED')
    expect(error).toHaveProperty('cause', expect.any(TypeError))
  })

  test('rejects with an SdkError raised inside the pipeline unchanged, even when the signal was aborted', async () => {
    const { SdkError } = await loadSdk()
    const client = await createClient()
    const controller = new AbortController()
    const raised = new SdkError('NO_RESULT', 'Raised inside', { metadata: {} })
    httpClient.getBestRoute.mockImplementation(async () => {
      controller.abort()
      throw raised
    })

    const error = await quoteError(
      client.quote(request, { signal: controller.signal }),
    )

    expect(error).toBe(raised)
  })

  test('rejects with the SdkError a result check throws, even when the signal was aborted', async () => {
    const client = await createClient()
    const controller = new AbortController()
    const empty = response({ result: null })
    httpClient.getBestRoute.mockImplementation(async () => {
      controller.abort()
      return empty
    })

    const error = await quoteError(
      client.quote(request, { signal: controller.signal }),
    )

    expect(error).toMatchObject({ type: 'NO_RESULT' })
  })

  test('narrows a caught error with instanceof SdkError, then metadata on type', async () => {
    const { SdkError } = await loadSdk()
    const client = await createClient()
    httpClient.getBestRoute.mockResolvedValue(
      response({ result: null, diagnosisMessages: ['No route'] }),
    )

    let diagnosisMessage: unknown = 'not set'
    try {
      await client.quote(request)
    } catch (error) {
      if (!(error instanceof SdkError)) {
        throw error
      }
      switch (error.type) {
        case 'INVALID_INPUT':
          expectTypeOf(error.metadata).toEqualTypeOf<Sdk.InvalidInputMetadata>()
          break
        case 'NO_RESULT':
          expectTypeOf(error.metadata).toEqualTypeOf<Sdk.NoResultMetadata>()
          diagnosisMessage = error.metadata.diagnosisMessage
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
        case 'CLIENT_PAUSED':
          expectTypeOf(error.metadata).toEqualTypeOf<undefined>()
      }
    }
    expect(diagnosisMessage).toBe('No route')
  })
})
