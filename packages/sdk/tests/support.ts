// Shared support for the SDK's tests: the hoisted `httpClient` mock, `loadSdk()`, fixture builders and the SdkError assertion. Test-only: not published.
import type * as Sdk from '../src/mod.js'
import type { LegacyClient } from '../src/types.js'
import type { Mock } from 'vitest'

import * as LegacySdk from 'rango-sdk'
import { expect, vi } from 'vitest'

/*
 * One fake per method of the legacy seam, and each legacy client built, with its constructor arguments, in build order.
 * A plain const, not `vi.hoisted`: a module can't export a hoisted variable, and the mock below reads it only when a legacy client is built.
 */
const clients: unknown[] = []
const constructorArgs: unknown[][] = []
const methods = {
  getBestRoute: vi.fn(),
  getAllRoutes: vi.fn(),
  confirmRoute: vi.fn(),
  getBlockchains: vi.fn(),
} satisfies Record<keyof LegacyClient, Mock>
export const httpClient = { clients, constructorArgs, ...methods }

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    getBestRoute = httpClient.getBestRoute
    getAllRoutes = httpClient.getAllRoutes
    confirmRoute = httpClient.confirmRoute
    getBlockchains = httpClient.getBlockchains
    constructor(...args: unknown[]) {
      httpClient.clients.push(this)
      httpClient.constructorArgs.push(args)
    }
  },
}))

// Resets every fake and forgets the legacy clients built so far.
export function resetHttpClient(): void {
  httpClient.clients.length = 0
  httpClient.constructorArgs.length = 0
  httpClient.getBestRoute.mockReset()
  httpClient.getAllRoutes.mockReset()
  httpClient.confirmRoute.mockReset()
  httpClient.getBlockchains.mockReset()
}

// The constructor arguments of the legacy client each call of `method` was made on, in call order.
export function clientArgsOf(method: Mock): (unknown[] | undefined)[] {
  return method.mock.contexts.map(
    (client) => httpClient.constructorArgs[httpClient.clients.indexOf(client)],
  )
}

export async function loadSdk(): Promise<typeof Sdk> {
  return import('../src/mod.js')
}

export const ETH = { blockchain: 'ETH', symbol: 'ETH', address: null }
export const USDC = {
  blockchain: 'BSC',
  symbol: 'USDC',
  address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
}

export const DESTINATION = '0x000000000000000000000000000000000000dead'

export function swap(overrides: Partial<Sdk.SwapResult> = {}): Sdk.SwapResult {
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

export const validationStatus: Sdk.BlockchainValidationStatus[] = [
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

export function chain(
  name: string,
  addressPatterns: string[],
): Sdk.BlockchainMeta {
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

export const blockchains = [
  chain('ETH', ['^(0x)[0-9A-Fa-f]{40}$']),
  chain('BSC', ['^(0x)[0-9A-Fa-f]{40}$']),
  chain('ARBITRUM', ['^(0x)[0-9A-Fa-f]{40}$']),
]

// A client whose blockchain list, once fetched, holds these blockchains.
export async function createClient(
  chains: readonly Sdk.BlockchainMeta[] = blockchains,
): Promise<Sdk.RangoClient> {
  const { RangoClient } = await loadSdk()
  httpClient.getBlockchains.mockResolvedValue([...chains])
  return new RangoClient({ apiKey: 'test-key' })
}

export type QuoteOverrides = Partial<
  Pick<
    Sdk.Quote,
    'requestId' | 'outputAmount' | 'swaps' | 'requestAmount' | 'to'
  > & { routeId: string }
>

// A `getAllRoutes` response holding one Quote.
export function quotesResponse(
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
export async function cacheQuote(
  client: Sdk.RangoClient,
  overrides: QuoteOverrides = {},
  slippage: string | null = '1.5',
): Promise<Sdk.Quote> {
  httpClient.getAllRoutes.mockResolvedValueOnce(quotesResponse(overrides))
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

export const BAD_REQUEST = 400
export const UNAUTHORIZED = 401
export const TOO_MANY_REQUESTS = 429
export const SERVER_ERROR = 500

// What the legacy client rejects with for an HTTP error answer.
export function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with ${status}`), {
    response: { status, data },
  })
}

// Awaits a call that should reject, checks the rejection is an SdkError, and returns it.
export async function expectSdkError(promise: Promise<unknown>) {
  const { SdkError } = await loadSdk()
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(SdkError)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('name', 'SdkError')
  return error
}
