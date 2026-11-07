// Shared support for the SDK's tests: the hoisted `httpClient` mock, `loadSdk()`, fixture builders and the SdkError assertion. Test-only: not published.
import type * as Sdk from '../src/mod.js'
import type { LegacyClient } from '../src/types.js'
import type { Mock } from 'vitest'

import * as LegacySdk from 'rango-sdk'
import { SignerError, SignerErrorCode } from 'rango-types'
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
  createTransaction: vi.fn(),
  checkStatus: vi.fn(),
  reportFailure: vi.fn(),
} satisfies Record<keyof LegacyClient, Mock>
export const httpClient = { clients, constructorArgs, ...methods }

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    getBestRoute = httpClient.getBestRoute
    getAllRoutes = httpClient.getAllRoutes
    confirmRoute = httpClient.confirmRoute
    getBlockchains = httpClient.getBlockchains
    createTransaction = httpClient.createTransaction
    checkStatus = httpClient.checkStatus
    reportFailure = httpClient.reportFailure
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
  httpClient.createTransaction.mockReset()
  httpClient.checkStatus.mockReset()
  httpClient.reportFailure.mockReset()
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

// The execution harness: an EVM chain, scripted transactions and status answers, a recording port and emitter.

export function evmChain(name: string, chainId: string): Sdk.BlockchainMeta {
  return {
    ...chain(name, ['^(0x)[0-9A-Fa-f]{40}$']),
    type: LegacySdk.TransactionType.EVM,
    chainId,
    info: {
      infoType: 'EvmMetaInfo',
      chainName: name,
      nativeCurrency: { name, symbol: name, decimals: 18 },
      rpcUrls: [],
      enableGasV2: false,
      blockExplorerUrls: [],
      addressUrl: '',
      transactionUrl: '',
      tokenUrl: null,
    },
  }
}

export function evmTx(
  overrides: Partial<LegacySdk.EvmTransaction> = {},
): LegacySdk.EvmTransaction {
  return {
    type: LegacySdk.TransactionType.EVM,
    blockChain: 'ETH',
    prerequisites: [],
    isApprovalTx: false,
    from: '0xfrom',
    to: '0xcontract',
    data: '0xdata',
    value: null,
    nonce: null,
    gasLimit: null,
    gasPrice: null,
    maxPriorityFeePerGas: null,
    maxFeePerGas: null,
    ...overrides,
  }
}

// A `/tx/create` answer holding this transaction.
export function createTxResponse(
  transaction: LegacySdk.Transaction = evmTx(),
): LegacySdk.CreateTransactionResponse {
  return { ok: true, error: null, transaction }
}

// A `checkStatus` answer, `running` with nothing set unless overridden.
export function statusResponse(
  overrides: Partial<LegacySdk.TransactionStatusResponse> = {},
): LegacySdk.TransactionStatusResponse {
  return {
    status: LegacySdk.TransactionStatus.RUNNING,
    timestamp: null,
    extraMessage: null,
    outputAmount: null,
    outputToken: null,
    outputType: null,
    newTx: null,
    diagnosisUrl: null,
    explorerUrl: null,
    referrals: null,
    steps: null,
    bridgeExtra: null,
    error: null,
    errorCode: null,
    traceId: null,
    ...overrides,
  }
}

export type EvmApprove = Extract<
  Sdk.TransactionPrerequisite,
  { type: 'EVM_APPROVE' }
>

// An EVM approve of USDT on ETH from the selected wallet, for 1000000.
export function evmApprove(overrides: Partial<EvmApprove> = {}): EvmApprove {
  return {
    type: 'EVM_APPROVE',
    blockChain: 'ETH',
    wallet: '0xfrom',
    token: '0xtoken',
    spender: '0xspender',
    amount: '1000000',
    ...overrides,
  }
}

// An allowance far above any approve amount.
export const UNLIMITED = '1000000000000000000000000000000000000000'

// A scripted answer that rejects with `reason`, for a rejection that is not an Error.
export class Rejection {
  constructor(readonly reason: unknown) {}
}

// Answers each call with the next of `answers`, then the last one: an Error or a `Rejection` rejects.
function scripted<T>(
  answers: readonly (T | Error | Rejection)[],
): () => Promise<T> {
  const queue = [...answers]
  return async () => {
    const answer = queue.length > 1 ? queue.shift() : queue[0]
    if (answer === undefined) {
      throw new Error('No scripted answer')
    }
    if (answer instanceof Error) {
      throw answer
    }
    if (answer instanceof Rejection) {
      throw answer.reason
    }
    return answer
  }
}

// What a Prerequisite is for: an approve's token, or a trustline's currency or asset code.
function assetOf(prerequisite: Sdk.TransactionPrerequisite): string {
  switch (prerequisite.type) {
    case 'XRPL_CHANGE_TRUSTLINE':
      return prerequisite.currency
    case 'STELLAR_CHANGE_TRUSTLINE':
      return prerequisite.code
    case 'EVM_APPROVE':
    case 'TRON_APPROVE':
      return prerequisite.token
  }
}

// A readable name for a signed transaction: an XRPL one by its `TransactionType`, a Stellar one by its first operation.
function txOf(tx: LegacySdk.Transaction): string {
  if (tx.type === LegacySdk.TransactionType.XRPL) {
    return `sign:${tx.data.TransactionType}`
  }
  if (tx.type === LegacySdk.TransactionType.STELLAR) {
    return `sign:${tx.data.operationsXdrBase64[0] ?? ''}`
  }
  if ('to' in tx) {
    return `sign:${tx.to}`
  }
  return 'txID' in tx ? `sign:${tx.txID}` : 'sign'
}

/*
 * A readable name for a namespace request: the token or trustline asset read or built for, the transaction signed
 * (`txOf`), or the hash whose info is read (`info:`).
 */
export function callOf(request: NamespaceRequest): string {
  switch (request[1]) {
    case 'sign':
      return txOf(request[2].tx)
    case 'getAllowance':
    case 'getTrustline':
      return `read:${assetOf(request[2].prerequisite)}`
    case 'buildTransaction':
      return `build:${assetOf(request[2].prerequisite)}`
    case 'getTransactionInfo':
      return `info:${request[2].hash}`
    case 'getAccount':
    case 'getChainId':
    case 'switchChain':
    case 'wait':
    case 'signTypedData':
      return request[1]
  }
}

// The `sign` requests, in call order.
export function signsOf(
  requests: NamespaceRequest[],
): Extract<NamespaceRequest, [Namespace, 'sign', unknown]>[2][] {
  return requests.flatMap((request) =>
    request[1] === 'sign' ? [request[2]] : [],
  )
}

/*
 * What a signer rejects with: a real `SignerError` with `code`, its default message, `detail` as its root, so
 * `getErrorDetail()` answers it (but for `REJECTED_BY_USER`, which drops it), and `cause`.
 */
export function signerError(
  code: SignerErrorCode,
  detail = 'Wallet said no',
  cause?: unknown,
): SignerError {
  return new SignerError(code, undefined, detail, undefined, cause)
}

/*
 * What a Prerequisite's read or build rejects with, and the failure stored for it: whatever it is, it fails
 * `CLIENT_UNEXPECTED_BEHAVIOUR` with the path's `fixed` message and no detail, reported.
 */
export function portRejections(
  fixed: string,
): [string, Error | Rejection, PrerequisiteFailure][] {
  const failure: PrerequisiteFailure = {
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message: fixed,
    detail: null,
  }
  return [
    ['a SignerError', signerError(SignerErrorCode.SIGN_TX_ERROR), failure],
    ['a plain Error', new Error('RPC down'), failure],
    ['null', new Rejection(null), failure],
  ]
}

// A recorded event that carries a `HistoryItem`: every one but `loaded`.
export type RecordedEvent =
  | ['routeEvent', Sdk.ExecutionEvents['routeEvent']]
  | ['stepEvent', Sdk.ExecutionEvents['stepEvent']]
  | ['changed', Sdk.ExecutionEvents['changed']]

/*
 * An emitter that records every event, copied when emitted, so each keeps the `HistoryItem` it was sent with.
 * `events` holds the events with a `HistoryItem`; `all` holds every event in order, `loaded` included.
 */
export function recordingEmitter() {
  const events: RecordedEvent[] = []
  const all: (RecordedEvent | ['loaded', undefined])[] = []
  const record = (event: RecordedEvent): void => {
    events.push(event)
    all.push(event)
  }
  const sinks: {
    [K in keyof Sdk.ExecutionEvents]: (event: Sdk.ExecutionEvents[K]) => void
  } = {
    routeEvent: (event) => record(['routeEvent', event]),
    stepEvent: (event) => record(['stepEvent', event]),
    changed: (event) => record(['changed', event]),
    loaded: (event) => all.push(['loaded', event]),
  }
  const emitter: Sdk.Emitter<Sdk.ExecutionEvents> = {
    emit(type, event) {
      sinks[type](structuredClone(event))
    },
  }
  return { emitter, events, all }
}

const SETTLE_ROUNDS = 50

// Lets IndexedDB and the queue run every pending step, without moving the fake clock.
export async function settle(rounds = SETTLE_ROUNDS): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
  }
}

// Moves the fake clock and runs every step it releases.
export async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

export const evmBlockchains = [evmChain('ETH', '0x1'), evmChain('BSC', '0x38')]

// The ETH chain description an EVM switch carries, from the default Blockchain list.
export const DEFAULT_ETH_CHAIN_DESCRIPTION: Sdk.EvmChainDescription = {
  chainName: 'ETH',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: [],
  blockExplorerUrls: [],
}
// What a Blockchain list may describe beyond the default ETH.
export const MAINNET_ETH_CHAIN_DESCRIPTION = {
  chainName: 'Ethereum Mainnet',
  rpcUrls: ['https://rpc.example'],
  blockExplorerUrls: ['https://explorer.example'],
}

// `meta` with an explorer: this `info.transactionUrl`, the template a stored hash's link is built from.
export function linkedChain(
  meta: Sdk.BlockchainMeta,
  transactionUrl: string,
): Sdk.BlockchainMeta {
  const linked = structuredClone(meta)
  if (linked.info !== null) {
    linked.info.transactionUrl = transactionUrl
  }
  return linked
}

// `meta` whose EVM chain info holds this `description`, the chain an EVM switch describes.
export function describedChain(
  meta: Sdk.BlockchainMeta,
  description: Partial<Sdk.EvmChainDescription>,
): Sdk.BlockchainMeta {
  const described = structuredClone(meta)
  if (described.type === LegacySdk.TransactionType.EVM) {
    described.info = { ...described.info, ...description }
  }
  return described
}

// A promise that never settles: a port or legacy call left hanging, so its client writes nothing more.
export async function hang<T>(): Promise<T> {
  return new Promise<T>(() => undefined)
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Resolves an IndexedDB request.
export async function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Opens a factory's `queues-manager` database as core creates it.
export async function openQueues(on: IDBFactory): Promise<IDBDatabase> {
  const request = on.open('queues-manager', 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore('queues', { keyPath: 'id' })
  }
  return done(request)
}

// A page reload: a fresh module graph and `httpClient` mock on this database, so the next client loads what the last stored.
export function reloadOn(on: IDBFactory): void {
  vi.resetModules()
  resetHttpClient()
  globalThis.indexedDB = on
}

/*
 * The client built again after a reload, with a recording port and emitter, resumed as an app does at mount, so
 * every `RUNNING` Execution resumes; then every pending step runs.
 */
export async function resumeExecutions(
  port: ReturnType<typeof recordingNamespaces> = recordingNamespaces(),
  chains: readonly Sdk.BlockchainMeta[] = evmBlockchains,
) {
  const execution = await createExecutionClient(port, chains)
  await execution.client.resume()
  await settle()
  return execution
}

// Core's paused Manager syncs storage on `window.setInterval`, which Node lacks: this `window` uses the global timer.
export function stubWindow(): void {
  vi.stubGlobal('window', {
    setInterval: (handler: () => void, ms: number) => setInterval(handler, ms),
  })
}

// The TRON mainnet chain ID, as the Blockchain list writes it.
export const TRON_CHAIN_ID = '0x2b6653dc'

export function tronChain(chainId = TRON_CHAIN_ID): Sdk.BlockchainMeta {
  return {
    ...chain('TRON', ['^T[1-9A-HJ-NP-Za-km-z]{33}$']),
    type: LegacySdk.TransactionType.TRON,
    chainId,
    info: {
      infoType: 'EvmMetaInfo',
      chainName: 'TRON',
      nativeCurrency: { name: 'TRX', symbol: 'TRX', decimals: 6 },
      rpcUrls: [],
      enableGasV2: false,
      blockExplorerUrls: [],
      addressUrl: '',
      transactionUrl: '',
      tokenUrl: null,
    },
  }
}

// A TRON transaction from the selected TRON wallet, its ID `main-tx` unless overridden.
export function tronTx(
  overrides: Partial<LegacySdk.TronTransaction> = {},
): LegacySdk.TronTransaction {
  return {
    type: LegacySdk.TransactionType.TRON,
    blockChain: 'TRON',
    prerequisites: [],
    isApprovalTx: false,
    raw_data: null,
    raw_data_hex: '0a02',
    txID: 'main-tx',
    visible: false,
    __payload__: {},
    ...overrides,
  }
}

export type TronApprove = Extract<
  Sdk.TransactionPrerequisite,
  { type: 'TRON_APPROVE' }
>

// A TRON approve of USDT from the selected TRON wallet, for 1000000.
export function tronApprove(overrides: Partial<TronApprove> = {}): TronApprove {
  return {
    type: 'TRON_APPROVE',
    blockChain: 'TRON',
    wallet: 'TXfrom',
    token: '0xtrc20',
    spender: '0xspender',
    amount: '1000000',
    ...overrides,
  }
}

export type XrplTx = Extract<
  LegacySdk.Transaction,
  { type: LegacySdk.TransactionType.XRPL }
>

export function xrplChain(chainId = ''): Sdk.BlockchainMeta {
  return {
    ...chain('XRPL', ['^r[1-9A-HJ-NP-Za-km-z]{24,34}$']),
    type: LegacySdk.TransactionType.XRPL,
    chainId,
    info: {
      infoType: 'XRPLMetaInfo',
      blockExplorerUrls: [],
      addressUrl: '',
      transactionUrl: '',
      tokenUrl: null,
    },
  }
}

// An XRPL `Payment` from the selected XRPL wallet.
export function xrplTx(overrides: Partial<XrplTx> = {}): XrplTx {
  return {
    type: LegacySdk.TransactionType.XRPL,
    blockChain: 'XRPL',
    prerequisites: [],
    data: {
      TransactionType: 'Payment',
      Account: 'rXRPLfrom',
      Destination: 'rDestination',
      Amount: '1000000',
    },
    ...overrides,
  }
}

export type XrplTrustline = Extract<
  Sdk.TransactionPrerequisite,
  { type: 'XRPL_CHANGE_TRUSTLINE' }
>

// An XRPL trustline to USD from `rIssuer`, for the selected XRPL wallet.
export function xrplTrustline(
  overrides: Partial<XrplTrustline> = {},
): XrplTrustline {
  return {
    type: 'XRPL_CHANGE_TRUSTLINE',
    blockChain: 'XRPL',
    currency: 'USD',
    issuer: 'rIssuer',
    value: '1000',
    wallet: 'rXRPLfrom',
    ...overrides,
  }
}

export type StellarTx = Extract<
  LegacySdk.Transaction,
  { type: LegacySdk.TransactionType.STELLAR }
>

export function stellarChain(): Sdk.BlockchainMeta {
  return {
    ...chain('STELLAR', ['^G[A-Z2-7]{55}$']),
    type: LegacySdk.TransactionType.STELLAR,
    chainId: null,
    info: {
      infoType: 'StellarMetaInfo',
      blockExplorerUrls: [],
      addressUrl: '',
      transactionUrl: '',
      tokenUrl: null,
    },
  }
}

// A Stellar transaction from the selected Stellar wallet, with one operation, `payment-op` unless overridden.
export function stellarTx(
  operation = 'payment-op',
  overrides: Partial<StellarTx> = {},
): StellarTx {
  return {
    type: LegacySdk.TransactionType.STELLAR,
    blockChain: 'STELLAR',
    prerequisites: [],
    data: {
      baseFee: '100',
      preconditions: {
        timeBounds: { minTime: 0, maxTime: 0 },
        ledgerBounds: { minLedger: 0, maxLedger: 0 },
        minSeqNumber: null,
        minSeqAge: null,
        minSeqLedgerGap: null,
        extraSigners: null,
      },
      operationsXdrBase64: [operation],
      memoXdrBase64: null,
    },
    ...overrides,
  }
}

export type StellarTrustline = Extract<
  Sdk.TransactionPrerequisite,
  { type: 'STELLAR_CHANGE_TRUSTLINE' }
>

// A Stellar trustline to USDC from `GISSUER`, for the selected Stellar wallet.
export function stellarTrustline(
  overrides: Partial<StellarTrustline> = {},
): StellarTrustline {
  return {
    type: 'STELLAR_CHANGE_TRUSTLINE',
    blockChain: 'STELLAR',
    code: 'USDC',
    issuer: 'GISSUER',
    value: '11.50',
    wallet: 'GSTELLARFROM',
    ...overrides,
  }
}

// A `confirmRoute` answer for this request, with these swaps and this validation status.
export function confirmResponse(
  requestId: string,
  swaps: Sdk.SwapResult[] = [swap()],
  status: Sdk.BlockchainValidationStatus[] = validationStatus,
): Sdk.ConfirmRouteResponse {
  return {
    ok: true,
    result: {
      requestId,
      requestAmount: '1',
      from: ETH,
      to: USDC,
      result: {
        outputAmount: '3000',
        resultType: LegacySdk.RoutingResultType.OK,
        swaps,
      },
      validationStatus: status,
      diagnosisMessages: [],
      missingBlockchains: [],
      walletNotSupportingFromBlockchain: false,
    },
    error: null,
    errorCode: null,
    traceId: null,
  }
}

// The execution client's options: the only place most tests name the keys of the client config's `execution`.
export type ExecutionClientOptions = {
  // The emitter in place of the recording one, or `null` to build with no emitter.
  emitter?: Sdk.Emitter<Sdk.ExecutionEvents> | null
  pauseOnStart?: boolean
  beforeResume?: Sdk.BeforeResume
}

type ExecutionClient<P extends NamespacePort> = {
  client: Sdk.RangoClient
  events: RecordedEvent[]
  all: (RecordedEvent | ['loaded', undefined])[]
} & P

/*
 * A client with `execution.wallet` set to this namespace port, by default a recording one, and a
 * recording emitter unless `options` replaces it, with these `options` (such as `pauseOnStart`), whose blockchain list
 * holds these blockchains. The port is returned as given, so its mocks keep their types; `events` and `all` stay empty
 * when the emitter is replaced. The only way the tests build a client with a wallet.
 */
export async function createExecutionClient(
  port?: undefined,
  chains?: readonly Sdk.BlockchainMeta[],
  options?: ExecutionClientOptions,
): Promise<ExecutionClient<ReturnType<typeof recordingNamespaces>>>
export async function createExecutionClient<P extends NamespacePort>(
  port: P,
  chains?: readonly Sdk.BlockchainMeta[],
  options?: ExecutionClientOptions,
): Promise<ExecutionClient<P>>
export async function createExecutionClient(
  port: NamespacePort = recordingNamespaces(),
  chains: readonly Sdk.BlockchainMeta[] = evmBlockchains,
  { emitter, ...options }: ExecutionClientOptions = {},
) {
  const { RangoClient } = await loadSdk()
  httpClient.getBlockchains.mockResolvedValue([...chains])
  const recording = recordingEmitter()
  const client = new RangoClient({
    apiKey: 'test-key',
    execution: {
      wallet: port.wallet,
      ...(emitter === null ? {} : { emitter: emitter ?? recording.emitter }),
      ...options,
    },
  })
  return { client, events: recording.events, all: recording.all, ...port }
}

// The stored Execution, as `history` answers it.
export async function historyOf(
  client: Sdk.RangoClient,
): Promise<Sdk.HistoryItem | undefined> {
  return client.history.get('request-1')
}

// The parts of a failed Prerequisite's stored failure a test checks: its code and message, and its detail if given.
export type PrerequisiteFailure = Pick<
  Sdk.ExecutionFailure,
  'reasonCode' | 'message'
> &
  Partial<Pick<Sdk.ExecutionFailure, 'detail'>>

/*
 * What every failed Prerequisite leaves: the Execution `FAILED` with this failure, its main entry not started and step 1
 * reported with the failure's reason code. Answers the `HistoryItem`, for a caller's own checks.
 */
export async function expectPrerequisiteFailed(
  client: Sdk.RangoClient,
  failure: PrerequisiteFailure,
): Promise<Sdk.HistoryItem | undefined> {
  const view = await historyOf(client)
  expect(view?._queue.status).toBe('FAILED')
  expect(view?._storage.failure).toMatchObject(failure)
  expect(view?._storage.transactions.s1?.execution.status).toBe('not_started')
  expect(httpClient.reportFailure).toHaveBeenCalledWith(
    expect.objectContaining({ step: 1, eventType: failure.reasonCode }),
  )
  return view
}

// A distinct Wallet ID per blockchain, so a report tag with the wrong one shows.
export const SELECTED_WALLETS = {
  ETH: { address: '0xfrom', walletId: 'metamask' },
  BSC: { address: '0xto', walletId: 'trust' },
  TRON: { address: 'TXfrom', walletId: 'tronlink' },
  XRPL: { address: 'rXRPLfrom', walletId: 'xaman' },
  STELLAR: { address: 'GSTELLARFROM', walletId: 'freighter' },
  HYPERLIQUID: { address: '0xhyperliquid', walletId: 'rabby' },
}
/*
 * What `getAccount` answers by default: each selected wallet's address, and a TRANSFER's `bc1from` on BTC. A fresh
 * map per call, so a test can change it.
 */
export function activeAccounts(): Record<string, string | null> {
  return {
    ...Object.fromEntries(
      Object.entries(SELECTED_WALLETS).map(([blockchain, { address }]) => [
        blockchain,
        address,
      ]),
    ),
    BTC: 'bc1from',
  }
}

export const EXECUTION_OPTIONS: Sdk.ExecutionOptions = {
  transactionOptions: {
    slippage: '1',
    validations: { balance: true, fee: true },
  },
  swapMode: 'refuel',
}
export const BSC_ASSET = { ...swap().to, blockchain: 'BSC' }

// A `checkStatus` answer for a step that succeeded.
export const succeeded = statusResponse({
  status: LegacySdk.TransactionStatus.SUCCESS,
  outputAmount: '2990',
})

// Each Step's transaction: step 1 on ETH, step 2 on BSC.
export function scriptCreateTransaction(): void {
  httpClient.createTransaction.mockImplementation(
    async ({ step }: { step: number }) =>
      createTxResponse(
        step === 1
          ? evmTx()
          : evmTx({ blockChain: 'BSC', from: '0xto', data: '0xdata2' }),
      ),
  )
}

// Caches and confirms a Quote, with the confirm answer for these swaps.
export async function confirmQuote(
  client: Sdk.RangoClient,
  requestId = 'request-1',
  swaps: Sdk.SwapResult[] = [swap()],
  options: Sdk.ConfirmOptions = {},
): Promise<Sdk.ConfirmResult> {
  httpClient.confirmRoute.mockResolvedValueOnce(
    confirmResponse(requestId, swaps),
  )
  await cacheQuote(client, { requestId, swaps })
  return client.confirm(requestId, SELECTED_WALLETS, options)
}

// A readable name for an event: its type, then the step event's type or `tx_execution` status.
export function nameOf([type, event]:
  | RecordedEvent
  | ['loaded', undefined]): string {
  if (type === 'changed' || type === 'loaded') {
    return type
  }
  if (type === 'routeEvent') {
    return `route:${event.event.type}`
  }
  return `step${event.step}:${'status' in event.event ? event.event.status : event.event.type}`
}

// What a failure Rango isn't told of still leaves, besides its stored failure: `failed` for `step` and the route.
export function expectNotReported(events: RecordedEvent[], step = 1): void {
  expect(events.map(nameOf)).toEqual(
    expect.arrayContaining([`step${step}:failed`, 'route:failed']),
  )
  expect(httpClient.reportFailure).not.toHaveBeenCalled()
}

export function viewOf([type, event]: RecordedEvent): Sdk.HistoryItem {
  return type === 'changed' ? event : event.view
}

export type HyperliquidTx = Extract<
  LegacySdk.Transaction,
  { type: LegacySdk.TransactionType.HYPERLIQUID }
>

// The hex digits of one 32-byte word.
const WORD_HEX = 64

// The chain a Hyperliquid action is signed on, and its nonce, which is also its action's time.
export const SIGNATURE_CHAIN_ID = '0xa4b1'
export const HYPERLIQUID_NONCE = 1_700_000_000_000

// The EIP-712 typed data of a Hyperliquid action of this primary type, as its message carries it.
export function hyperliquidTypedData(primaryType: string) {
  return {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 42161,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      [primaryType]: [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'destination', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'time', type: 'uint64' },
      ],
    },
    primaryType,
    message: {
      hyperliquidChain: 'Mainnet',
      destination: DESTINATION,
      amount: '10',
      time: HYPERLIQUID_NONCE,
    },
  }
}

const PRIMARY_TYPES = {
  withdraw3: 'HyperliquidTransaction:Withdraw',
  usdSend: 'HyperliquidTransaction:UsdSend',
}

// A Hyperliquid action of this type at HYPERLIQUID_NONCE, with its typed data as its message.
export function hyperliquidTx(
  type: HyperliquidTx['action']['type'] = 'withdraw3',
  overrides: Partial<HyperliquidTx> = {},
): HyperliquidTx {
  return {
    type: LegacySdk.TransactionType.HYPERLIQUID,
    blockChain: 'HYPERLIQUID',
    action: {
      type,
      signatureChainId: SIGNATURE_CHAIN_ID,
      hyperliquidChain: 'Mainnet',
      destination: DESTINATION,
      amount: '10',
      time: HYPERLIQUID_NONCE,
    },
    message: JSON.stringify(hyperliquidTypedData(PRIMARY_TYPES[type])),
    nonce: HYPERLIQUID_NONCE,
    prerequisites: [],
    expectedOutput: '10',
    ...overrides,
  }
}

// The `r` and `s` of every scripted Hyperliquid signature.
export const SIGNATURE_R = `0x${'a'.repeat(WORD_HEX)}`
export const SIGNATURE_S = `0x${'b'.repeat(WORD_HEX)}`

// A 65-byte `0x` signature whose `v` byte is `v`.
export function signatureWith(v: string): string {
  return `${SIGNATURE_R}${SIGNATURE_S.slice(2)}${v}`
}

export const HYPERLIQUID_EXCHANGE_URL = 'https://api.hyperliquid.xyz/exchange'
export const HYPERLIQUID_EXPLORER_URL = 'https://rpc.hyperliquid.xyz/explorer'

// An explorer `userDetails` answer holding one action of this type, time and hash.
export function explorerAnswer(
  hash: string,
  type = 'withdraw3',
  time = HYPERLIQUID_NONCE,
) {
  return {
    type: 'userDetails',
    txs: [{ action: { type, time }, hash, user: '0xhyperliquid', time }],
  }
}

/*
 * Stubs the global `fetch` for Hyperliquid: the exchange answers `exchange`, and the explorer answers from `explorer`
 * in order, repeating the last answer; an Error rejects. Every request is recorded with its URL and parsed body.
 */
export function stubHyperliquid({
  exchange = { status: 'ok', response: { type: 'default' } },
  explorer = [explorerAnswer('0xhyperhash')],
}: {
  exchange?: unknown
  explorer?: readonly unknown[]
} = {}) {
  const posts: { url: string; body: unknown }[] = []
  const nextExplorer = scripted(explorer)
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body: unknown =
      typeof init?.body === 'string' ? JSON.parse(init.body) : null
    posts.push({ url, body })
    const answer =
      url === HYPERLIQUID_EXCHANGE_URL ? exchange : await nextExplorer()
    return new Response(JSON.stringify(answer))
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, posts }
}

/*
 * Per-namespace fakes: v14's WalletPort by namespace. Each namespace takes v14's requests (no `address`, and `blockchain`
 * only on `evm` and `bip122`) and has v14's method names; every call but `getAccount` is recorded, copied, in call
 * order, as `[namespace, method, request]`. `createExecutionClient` hands one to the SDK as it is, so a test asserts
 * what v14's port receives.
 */

type SignResult = {
  hash: string
  response?: unknown
  hashRequiringUpdate?: boolean
}
type WaitResult = { hash: string; response?: unknown }
type TxOf<T extends LegacySdk.TransactionType> = Extract<
  LegacySdk.Transaction,
  { type: T }
>
type EvmTx = TxOf<LegacySdk.TransactionType.EVM>
type TronTx = TxOf<LegacySdk.TransactionType.TRON>
type OnChain = { blockchain: string }

// What `getTransactionInfo` answers on each namespace: the Host's judgement on `evm`, else the chain's raw answer.
export type EvmInfo = 'pending' | 'success' | 'failed'
export type TronInfo = { blockNumber?: number; receipt?: { result?: string } }
export type XrplInfo = {
  validated: boolean
  meta?: { TransactionResult: string }
}

// How the SDK judges each raw info, and the Host on `evm`.
type Status = 'pending' | 'success' | 'failed'

// The answer for each status, per namespace: a fake answers the success by default.
export const EVM_INFO = {
  pending: 'pending',
  success: 'success',
  failed: 'failed',
} satisfies Record<Status, EvmInfo>
export const TRON_INFO = {
  pending: {},
  success: { blockNumber: 1, receipt: { result: 'SUCCESS' } },
  failed: { blockNumber: 1, receipt: { result: 'REVERT' } },
} satisfies Record<Status, TronInfo>
export const XRPL_INFO = {
  pending: { validated: false },
  success: { validated: true, meta: { TransactionResult: 'tesSUCCESS' } },
  failed: { validated: true, meta: { TransactionResult: 'tecPATH_DRY' } },
} satisfies Record<Status, XrplInfo>

// v20's namespace ports, as the tests fake them, matching the source's. Only `wait` is optional, as there.
export type EvmNamespace = {
  getAccount(req: OnChain): Promise<string | null>
  getChainId(req: OnChain): Promise<string | null>
  switchChain(req: OnChain & { chainId: string }): Promise<void>
  sign(req: OnChain & { tx: EvmTx }): Promise<SignResult>
  wait?(
    req: OnChain & { hash: string; response?: unknown },
  ): Promise<WaitResult>
  getAllowance(
    req: OnChain & { prerequisite: EvmApprove },
  ): Promise<string | null>
  getTransactionInfo(req: OnChain & { hash: string }): Promise<EvmInfo>
}
export type HyperliquidNamespace = {
  getAccount(): Promise<string | null>
  getChainId(): Promise<string | null>
  switchChain(req: { chainId: string }): Promise<void>
  signTypedData(req: { typedData: unknown; chainId: string }): Promise<string>
}
export type TronNamespace = {
  getAccount(): Promise<string | null>
  sign(req: { tx: TronTx }): Promise<SignResult>
  getAllowance(req: { prerequisite: TronApprove }): Promise<string | null>
  buildTransaction(req: { prerequisite: TronApprove }): Promise<TronTx>
  getTransactionInfo(req: { hash: string }): Promise<TronInfo>
}
export type XrplNamespace = {
  getAccount(): Promise<string | null>
  sign(req: { tx: XrplTx }): Promise<SignResult>
  getTrustline(req: { prerequisite: XrplTrustline }): Promise<string | null>
  getTransactionInfo(req: { hash: string }): Promise<XrplInfo>
}
export type StellarNamespace = {
  getAccount(): Promise<string | null>
  sign(req: { tx: StellarTx }): Promise<SignResult>
  getTrustline(req: { prerequisite: StellarTrustline }): Promise<string | null>
  buildTransaction(req: {
    prerequisite: StellarTrustline
    limit: string
  }): Promise<StellarTx>
}
export type Bip122Namespace = {
  getAccount(req: OnChain): Promise<string | null>
  sign(
    req: OnChain & { tx: TxOf<LegacySdk.TransactionType.TRANSFER> },
  ): Promise<SignResult>
}
type SingleChainNamespace<T extends LegacySdk.TransactionType> = {
  getAccount(): Promise<string | null>
  sign(req: { tx: TxOf<T> }): Promise<SignResult>
}
export type Namespaces = {
  evm?: EvmNamespace
  hyperliquid?: HyperliquidNamespace
  tron?: TronNamespace
  xrpl?: XrplNamespace
  stellar?: StellarNamespace
  bip122?: Bip122Namespace
  solana?: SingleChainNamespace<LegacySdk.TransactionType.SOLANA>
  starknet?: SingleChainNamespace<LegacySdk.TransactionType.STARKNET>
  ton?: SingleChainNamespace<LegacySdk.TransactionType.TON>
  sui?: SingleChainNamespace<LegacySdk.TransactionType.SUI>
}
type Namespace = keyof Namespaces

// Every `[namespace, method, request]` the namespace `F`, with the methods `M`, can record.
type Recorded<F extends Namespace, M> = {
  [K in keyof M & string]-?: [
    F,
    K,
    NonNullable<M[K]> extends (...args: infer A) => unknown ? A[0] : never,
  ]
}[keyof M & string]

export type NamespaceRequest = {
  [F in Namespace]-?: Recorded<F, NonNullable<Namespaces[F]>>
}[Namespace]

// A namespace port as a test holds it: the namespaces, and the requests they record.
export type NamespacePort = { wallet: Namespaces; requests: NamespaceRequest[] }

/*
 * The recording namespace port: every namespace, with every method but `wait`. `sign` answers `0xhash1`, `0xhash2`, ...
 * across namespaces, `getAccount` the blockchain's entry in `accounts` (the requested one on `evm` and `bip122`, the
 * namespace's own otherwise, such as `TRON`), `getChainId` the blockchain's entry in `chainIds` (`HYPERLIQUID`'s on
 * `hyperliquid`), `switchChain` records the request and leaves the chain where it was, so the next read decides, the
 * reads `null`, `getTransactionInfo` its namespace's success, `signTypedData` a signature, and `buildTransaction` rejects,
 * as no build is scripted. Both maps are read on each call, so a test can change them; each mock is replaceable per
 * test.
 */
export function recordingNamespaces(
  chainIds: Record<string, string | null> = { ETH: '0x1', BSC: '0x38' },
  accounts: Record<string, string | null> = activeAccounts(),
) {
  const requests: NamespaceRequest[] = []
  let signed = 0
  const nextHash = (): SignResult => {
    signed += 1
    return { hash: `0xhash${signed}` }
  }
  const accountOn = (blockchain: string) => async (): Promise<string | null> =>
    accounts[blockchain] ?? null
  const unscripted = new Error('No build scripted for this namespace')
  const wallet = {
    evm: {
      getAccount: vi.fn(
        async (req: OnChain): Promise<string | null> =>
          accounts[req.blockchain] ?? null,
      ),
      getChainId: vi.fn(async (req: OnChain): Promise<string | null> => {
        requests.push(['evm', 'getChainId', structuredClone(req)])
        return chainIds[req.blockchain] ?? null
      }),
      switchChain: vi.fn(
        async (req: OnChain & { chainId: string }): Promise<void> => {
          requests.push(['evm', 'switchChain', structuredClone(req)])
        },
      ),
      sign: vi.fn(async (req: Parameters<EvmNamespace['sign']>[0]) => {
        requests.push(['evm', 'sign', structuredClone(req)])
        return nextHash()
      }),
      getAllowance: vi.fn(
        async (
          req: Parameters<EvmNamespace['getAllowance']>[0],
        ): Promise<string | null> => {
          requests.push(['evm', 'getAllowance', structuredClone(req)])
          return null
        },
      ),
      getTransactionInfo: vi.fn(
        async (req: OnChain & { hash: string }): Promise<EvmInfo> => {
          requests.push(['evm', 'getTransactionInfo', structuredClone(req)])
          return EVM_INFO.success
        },
      ),
    },
    hyperliquid: {
      getAccount: vi.fn(accountOn('HYPERLIQUID')),
      getChainId: vi.fn(async (): Promise<string | null> => {
        requests.push(['hyperliquid', 'getChainId', undefined])
        return chainIds.HYPERLIQUID ?? null
      }),
      switchChain: vi.fn(async (req: { chainId: string }): Promise<void> => {
        requests.push(['hyperliquid', 'switchChain', structuredClone(req)])
      }),
      signTypedData: vi.fn(
        async (req: { typedData: unknown; chainId: string }) => {
          requests.push(['hyperliquid', 'signTypedData', structuredClone(req)])
          return signatureWith('1b')
        },
      ),
    },
    tron: {
      getAccount: vi.fn(accountOn('TRON')),
      sign: vi.fn(async (req: Parameters<TronNamespace['sign']>[0]) => {
        requests.push(['tron', 'sign', structuredClone(req)])
        return nextHash()
      }),
      getAllowance: vi.fn(
        async (
          req: Parameters<TronNamespace['getAllowance']>[0],
        ): Promise<string | null> => {
          requests.push(['tron', 'getAllowance', structuredClone(req)])
          return null
        },
      ),
      buildTransaction: vi.fn(
        async (req: { prerequisite: TronApprove }): Promise<TronTx> => {
          requests.push(['tron', 'buildTransaction', structuredClone(req)])
          throw unscripted
        },
      ),
      getTransactionInfo: vi.fn(
        async (req: { hash: string }): Promise<TronInfo> => {
          requests.push(['tron', 'getTransactionInfo', structuredClone(req)])
          return TRON_INFO.success
        },
      ),
    },
    xrpl: {
      getAccount: vi.fn(accountOn('XRPL')),
      sign: vi.fn(async (req: Parameters<XrplNamespace['sign']>[0]) => {
        requests.push(['xrpl', 'sign', structuredClone(req)])
        return nextHash()
      }),
      getTrustline: vi.fn(
        async (
          req: Parameters<XrplNamespace['getTrustline']>[0],
        ): Promise<string | null> => {
          requests.push(['xrpl', 'getTrustline', structuredClone(req)])
          return null
        },
      ),
      getTransactionInfo: vi.fn(
        async (req: { hash: string }): Promise<XrplInfo> => {
          requests.push(['xrpl', 'getTransactionInfo', structuredClone(req)])
          return XRPL_INFO.success
        },
      ),
    },
    stellar: {
      getAccount: vi.fn(accountOn('STELLAR')),
      sign: vi.fn(async (req: Parameters<StellarNamespace['sign']>[0]) => {
        requests.push(['stellar', 'sign', structuredClone(req)])
        return nextHash()
      }),
      getTrustline: vi.fn(
        async (
          req: Parameters<StellarNamespace['getTrustline']>[0],
        ): Promise<string | null> => {
          requests.push(['stellar', 'getTrustline', structuredClone(req)])
          return null
        },
      ),
      buildTransaction: vi.fn(
        async (req: {
          prerequisite: StellarTrustline
          limit: string
        }): Promise<StellarTx> => {
          requests.push(['stellar', 'buildTransaction', structuredClone(req)])
          throw unscripted
        },
      ),
    },
    bip122: {
      getAccount: vi.fn(
        async (req: OnChain): Promise<string | null> =>
          accounts[req.blockchain] ?? null,
      ),
      sign: vi.fn(async (req: Parameters<Bip122Namespace['sign']>[0]) => {
        requests.push(['bip122', 'sign', structuredClone(req)])
        return nextHash()
      }),
    },
    solana: {
      getAccount: vi.fn(accountOn('SOLANA')),
      sign: vi.fn(
        async (req: { tx: TxOf<LegacySdk.TransactionType.SOLANA> }) => {
          requests.push(['solana', 'sign', structuredClone(req)])
          return nextHash()
        },
      ),
    },
    starknet: {
      getAccount: vi.fn(accountOn('STARKNET')),
      sign: vi.fn(
        async (req: { tx: TxOf<LegacySdk.TransactionType.STARKNET> }) => {
          requests.push(['starknet', 'sign', structuredClone(req)])
          return nextHash()
        },
      ),
    },
    ton: {
      getAccount: vi.fn(accountOn('TON')),
      sign: vi.fn(async (req: { tx: TxOf<LegacySdk.TransactionType.TON> }) => {
        requests.push(['ton', 'sign', structuredClone(req)])
        return nextHash()
      }),
    },
    sui: {
      getAccount: vi.fn(accountOn('SUI')),
      sign: vi.fn(async (req: { tx: TxOf<LegacySdk.TransactionType.SUI> }) => {
        requests.push(['sui', 'sign', structuredClone(req)])
        return nextHash()
      }),
    },
  } satisfies Namespaces
  return { wallet, requests }
}

type RecordingNamespaces = ReturnType<typeof recordingNamespaces>['wallet']

/*
 * `recordingNamespaces` with a `switchChain` on `evm` and `hyperliquid` that records the request and also moves the
 * blockchain (`HYPERLIQUID` on `hyperliquid`) to `chainId`, so `getChainId` answers it next. Replaceable per test.
 */
export function switchingNamespaces(
  chainIds: Record<string, string | null> = { ETH: '0x1', BSC: '0x38' },
  accounts: Record<string, string | null> = activeAccounts(),
) {
  const { wallet, requests } = recordingNamespaces(chainIds, accounts)
  const evmSwitch = vi.fn(
    async (req: OnChain & { chainId: string }): Promise<void> => {
      requests.push(['evm', 'switchChain', structuredClone(req)])
      chainIds[req.blockchain] = req.chainId
    },
  )
  const hyperliquidSwitch = vi.fn(
    async (req: { chainId: string }): Promise<void> => {
      requests.push(['hyperliquid', 'switchChain', structuredClone(req)])
      chainIds.HYPERLIQUID = req.chainId
    },
  )
  return {
    wallet: {
      ...wallet,
      evm: { ...wallet.evm, switchChain: evmSwitch },
      hyperliquid: { ...wallet.hyperliquid, switchChain: hyperliquidSwitch },
    },
    requests,
  }
}

/*
 * `recordingNamespaces` with a `wait` on `evm`, the only namespace v14 has it on, that records the request too, copied, and
 * resolves with the hash it got, as a port with no signer for it would. Replaceable per test.
 */
export function waitingNamespaces(
  chainIds: Record<string, string | null> = { ETH: '0x1', BSC: '0x38' },
  accounts: Record<string, string | null> = activeAccounts(),
) {
  const { wallet, requests } = recordingNamespaces(chainIds, accounts)
  const wait = vi.fn(
    async (
      req: Parameters<NonNullable<EvmNamespace['wait']>>[0],
    ): Promise<WaitResult> => {
      requests.push(['evm', 'wait', structuredClone(req)])
      return { hash: req.hash }
    },
  )
  return { wallet: { ...wallet, evm: { ...wallet.evm, wait } }, requests }
}

/*
 * `port` with `getAllowance` (`evm`, `tron`) and `getTrustline` (`xrpl`, `stellar`) answering from one `granted`
 * script, and a `getTransactionInfo` (`evm`, `tron`, `xrpl`) answering its namespace's info (the Host's judgement on
 * `evm`, else the chain's raw answer) from its `infos` script, each in order and repeating the last answer; an Error
 * rejects. Every request is recorded too, copied. By default nothing is granted before the approve and UNLIMITED after
 * it, and the approve succeeds at once. Replaceable per test.
 */
export function approvingNamespaces<W extends RecordingNamespaces>(
  port: { wallet: W; requests: NamespaceRequest[] },
  {
    granted = [null, UNLIMITED],
    infos = {},
  }: {
    granted?: readonly (string | null | Error | Rejection)[]
    infos?: {
      evm?: readonly (EvmInfo | Error)[]
      tron?: readonly (TronInfo | Error)[]
      xrpl?: readonly (XrplInfo | Error)[]
    }
  } = {},
) {
  const { wallet, requests } = port
  const nextGranted = scripted(granted)
  const nextEvmInfo = scripted(infos.evm ?? [EVM_INFO.success])
  const nextTronInfo = scripted(infos.tron ?? [TRON_INFO.success])
  const nextXrplInfo = scripted(infos.xrpl ?? [XRPL_INFO.success])
  return {
    wallet: {
      ...wallet,
      evm: {
        ...wallet.evm,
        getAllowance: vi.fn(
          async (req: Parameters<EvmNamespace['getAllowance']>[0]) => {
            requests.push(['evm', 'getAllowance', structuredClone(req)])
            return nextGranted()
          },
        ),
        getTransactionInfo: vi.fn(async (req: OnChain & { hash: string }) => {
          requests.push(['evm', 'getTransactionInfo', structuredClone(req)])
          return nextEvmInfo()
        }),
      },
      tron: {
        ...wallet.tron,
        getAllowance: vi.fn(
          async (req: Parameters<TronNamespace['getAllowance']>[0]) => {
            requests.push(['tron', 'getAllowance', structuredClone(req)])
            return nextGranted()
          },
        ),
        getTransactionInfo: vi.fn(async (req: { hash: string }) => {
          requests.push(['tron', 'getTransactionInfo', structuredClone(req)])
          return nextTronInfo()
        }),
      },
      xrpl: {
        ...wallet.xrpl,
        getTrustline: vi.fn(
          async (req: Parameters<XrplNamespace['getTrustline']>[0]) => {
            requests.push(['xrpl', 'getTrustline', structuredClone(req)])
            return nextGranted()
          },
        ),
        getTransactionInfo: vi.fn(async (req: { hash: string }) => {
          requests.push(['xrpl', 'getTransactionInfo', structuredClone(req)])
          return nextXrplInfo()
        }),
      },
      stellar: {
        ...wallet.stellar,
        getTrustline: vi.fn(
          async (req: Parameters<StellarNamespace['getTrustline']>[0]) => {
            requests.push(['stellar', 'getTrustline', structuredClone(req)])
            return nextGranted()
          },
        ),
      },
    },
    requests,
  }
}

/*
 * `port` with a `buildTransaction` on `tron` and `stellar`, the namespaces v14 has it on, that records every request too,
 * copied, and answers from its namespace's script in order, repeating the last answer; an Error rejects, and so does a
 * namespace given no script. Replaceable per test.
 */
export function buildingNamespaces<W extends RecordingNamespaces>(
  port: { wallet: W; requests: NamespaceRequest[] },
  builds: {
    tron?: readonly (TronTx | Error | Rejection)[]
    stellar?: readonly (StellarTx | Error | Rejection)[]
  },
) {
  const { wallet, requests } = port
  const unscripted = new Error('No build scripted for this namespace')
  const nextTron = scripted(builds.tron ?? [unscripted])
  const nextStellar = scripted(builds.stellar ?? [unscripted])
  return {
    wallet: {
      ...wallet,
      tron: {
        ...wallet.tron,
        buildTransaction: vi.fn(async (req: { prerequisite: TronApprove }) => {
          requests.push(['tron', 'buildTransaction', structuredClone(req)])
          return nextTron()
        }),
      },
      stellar: {
        ...wallet.stellar,
        buildTransaction: vi.fn(
          async (req: { prerequisite: StellarTrustline; limit: string }) => {
            requests.push(['stellar', 'buildTransaction', structuredClone(req)])
            return nextStellar()
          },
        ),
      },
    },
    requests,
  }
}

/*
 * `port` with a `signTypedData` on `hyperliquid` that records every request too, copied, and answers from `signatures`
 * in order, repeating the last answer; an Error rejects. Replaceable per test.
 */
export function typedSigningNamespaces<W extends RecordingNamespaces>(
  port: { wallet: W; requests: NamespaceRequest[] },
  signatures: readonly (string | Error)[] = [signatureWith('1b')],
) {
  const { wallet, requests } = port
  const nextSignature = scripted(signatures)
  const signTypedData = vi.fn(
    async (req: { typedData: unknown; chainId: string }) => {
      requests.push(['hyperliquid', 'signTypedData', structuredClone(req)])
      return nextSignature()
    },
  )
  return {
    wallet: {
      ...wallet,
      hyperliquid: { ...wallet.hyperliquid, signTypedData },
    },
    requests,
  }
}
