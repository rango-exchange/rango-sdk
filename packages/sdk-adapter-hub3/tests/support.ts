/*
 * Shared support for the Hub3 adapters' tests: a pruned copy of `packages/sdk/tests/support.ts`, holding only what these
 * tests reach. It loads the built `@rango-dev/sdk`, whose legacy client the `rango-sdk` mock below replaces. Test-only: not published.
 */
import type * as Sdk from '@rango-dev/sdk'
import type { SignerErrorCode } from 'rango-types'
import type { Mock } from 'vitest'

import * as LegacySdk from 'rango-sdk'
import { SignerError } from 'rango-types'
import { expect, vi } from 'vitest'

// The legacy client's methods the SDK calls, as the SDK's internal `LegacyClient` has them; that type isn't exported.
type LegacyClient = Pick<
  LegacySdk.RangoClient,
  | 'getBestRoute'
  | 'getAllRoutes'
  | 'confirmRoute'
  | 'getBlockchains'
  | 'createTransaction'
  | 'checkStatus'
  | 'reportFailure'
>

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

export async function loadSdk(): Promise<typeof Sdk> {
  return import('@rango-dev/sdk')
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

// The approve the fake port builds: an approval transaction on `to`, the token, from the selected wallet.
export function evmApproveTx(
  overrides: Partial<LegacySdk.EvmTransaction> = {},
): LegacySdk.EvmTransaction {
  return evmTx({
    to: '0xtoken',
    data: '0xapprove',
    isApprovalTx: true,
    ...overrides,
  })
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
}

type ExecutionClient<P extends NamespacePort> = {
  client: Sdk.RangoClient
  events: RecordedEvent[]
  all: (RecordedEvent | ['loaded', undefined])[]
  // Every query `getWallet` got, copied, in call order.
  queries: Sdk.WalletQuery<Sdk.Namespace>[]
} & P

// A namespace's wallet for a blockchain: a map answers its entry, else its `default`.
function onBlockchain<W extends { getAccount: unknown }>(
  wallet: W | WalletsByBlockchain<W> | undefined,
  blockchain: string,
): W | undefined {
  if (wallet === undefined || isSingleWallet(wallet)) {
    return wallet
  }
  return wallet[blockchain] ?? wallet.default
}

function isSingleWallet<W extends { getAccount: unknown }>(
  wallet: W | WalletsByBlockchain<W>,
): wallet is W {
  return typeof wallet.getAccount === 'function'
}

// The distinct queries `getWallet` got, as `namespace:blockchain:walletId`.
export function distinctQueries(
  queries: readonly Sdk.WalletQuery<Sdk.Namespace>[],
): string[] {
  return [
    ...new Set(
      queries.map(
        ({ namespace, blockchain, walletId }) =>
          `${namespace}:${blockchain}:${walletId}`,
      ),
    ),
  ]
}

/*
 * The host's `getWallet` over `port`: it reads `port.wallet` on each call, so a test swaps the wallet by setting it, and
 * answers `evm` by the queried blockchain when it is a map. Records each query in `queries`.
 */
function getWalletOf(
  port: NamespacePort,
  queries: Sdk.WalletQuery<Sdk.Namespace>[],
): Sdk.GetWallet {
  return (query) => {
    queries.push({ ...query })
    const wallets: Partial<Sdk.WalletByNamespace> = {
      ...port.wallet,
      evm: onBlockchain(port.wallet.evm, query.blockchain),
    }
    return wallets[query.namespace]
  }
}

/*
 * A client with `execution.getWallet` answering from this namespace port, by default a recording one, and a
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
  const queries: Sdk.WalletQuery<Sdk.Namespace>[] = []
  const client = new RangoClient({
    apiKey: 'test-key',
    execution: {
      getWallet: getWalletOf(port, queries),
      ...(emitter === null ? {} : { emitter: emitter ?? recording.emitter }),
      ...options,
    },
  })
  return {
    client,
    events: recording.events,
    all: recording.all,
    queries,
    ...port,
  }
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
  BTC: { address: 'bc1from', walletId: 'xverse' },
  LTC: { address: 'ltc1from', walletId: 'xverse' },
}
/*
 * What `getAccount` answers by default: each selected wallet's address. A fresh map per call, so a test can change
 * it.
 */
export function activeAccounts(): Record<string, string | null> {
  return {
    ...Object.fromEntries(
      Object.entries(SELECTED_WALLETS).map(([blockchain, { address }]) => [
        blockchain,
        address,
      ]),
    ),
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
 * Per-namespace fakes: the wallets by namespace. Each namespace takes the port's requests and has its method names;
 * every call but `getAccount` is recorded, copied, in call order, as `[namespace, method, request]`.
 * `createExecutionClient` hands one to the SDK as it is, so a test asserts what the port receives.
 */

type SignAndSendResult = {
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

// What `getTransactionInfo` answers on each namespace: the Host's judgement on `evm`, else the chain's raw answer.
export type EvmInfo = 'pending' | 'success' | 'failed'

// How the SDK judges each raw info, and the Host on `evm`.
type Status = 'pending' | 'success' | 'failed'

// The answer for each status, per namespace: a fake answers the success by default.
export const EVM_INFO = {
  pending: 'pending',
  success: 'success',
  failed: 'failed',
} satisfies Record<Status, EvmInfo>

// v20's namespace ports, as the tests fake them, matching the source's. Only `wait` and `signTypedData` are optional, as there.
export type EvmNamespace = {
  getAccount(): Promise<string | null>
  getChainId(): Promise<string | null>
  switchChain(req: { chainId: string }): Promise<void>
  signAndSend(req: { tx: EvmTx }): Promise<SignAndSendResult>
  wait?(req: { hash: string; response?: unknown }): Promise<WaitResult>
  getAllowance(req: { prerequisite: EvmApprove }): Promise<string | null>
  buildTransaction(req: { prerequisite: EvmApprove }): Promise<EvmTx>
  getTransactionInfo(req: { hash: string }): Promise<EvmInfo>
  signTypedData?(req: { typedData: unknown; chainId: string }): Promise<string>
}
type SingleChainNamespace<T extends LegacySdk.TransactionType> = {
  getAccount(): Promise<string | null>
  signAndSend(req: { tx: TxOf<T> }): Promise<SignAndSendResult>
}
// Each wallet the fakes record, by the namespace they record it under.
type RecordedWallets = {
  evm: EvmNamespace
  solana: SingleChainNamespace<LegacySdk.TransactionType.SOLANA>
  starknet: SingleChainNamespace<LegacySdk.TransactionType.STARKNET>
  ton: SingleChainNamespace<LegacySdk.TransactionType.TON>
  sui: SingleChainNamespace<LegacySdk.TransactionType.SUI>
}
// A wallet by blockchain, as the fake `getWallet` answers `evm` from it.
type WalletsByBlockchain<W> = {
  [blockchain: string]: W | undefined
  default?: W
}
export type Namespaces = {
  [F in Exclude<RecordedLabel, 'evm'>]?: RecordedWallets[F]
} & {
  evm?: EvmNamespace | WalletsByBlockchain<EvmNamespace>
}
type RecordedLabel = keyof RecordedWallets

// Every `[label, method, request]` the wallet recorded as `F`, with the methods `M`, can record.
type Recorded<F extends RecordedLabel, M> = {
  [K in keyof M & string]-?: [
    F,
    K,
    NonNullable<M[K]> extends (...args: infer A) => unknown ? A[0] : never,
  ]
}[keyof M & string]

export type NamespaceRequest = {
  [F in RecordedLabel]-?: Recorded<F, RecordedWallets[F]>
}[RecordedLabel]

// A namespace port as a test holds it: the namespaces, and the requests they record.
export type NamespacePort = { wallet: Namespaces; requests: NamespaceRequest[] }

/*
 * The recording namespace port: every namespace, with every method but `wait`. `signAndSend` answers `0xhash1`,
 * `0xhash2`, ... across namespaces, `getAccount` its blockchain's entry in `accounts` (`ETH` on `evm`, the namespace's own otherwise), `getChainId` its blockchain's entry in `chainIds` (`ETH`'s on `evm`,
 * `HYPERLIQUID`'s on `hyperliquid`), `switchChain` records the request and leaves the chain where it was, so the next read decides, the
 * reads `null`, `getTransactionInfo` its namespace's success, `signTypedData` a signature, and `buildTransaction` an
 * approve on the requested token on `evm`. Both maps are read on each call, so a test can change them; each mock is replaceable per test.
 * `hyperliquid` is an `evm` wallet on `HYPERLIQUID`, left out of `wallet` until `withHyperliquid` puts it in `evm`'s map.
 * `evmOn` builds another such wallet on a blockchain, sharing the requests and the hashes, for a map.
 */
export function recordingNamespaces(
  chainIds: Record<string, string | null> = { ETH: '0x1', BSC: '0x38' },
  accounts: Record<string, string | null> = activeAccounts(),
) {
  const requests: NamespaceRequest[] = []
  let signed = 0
  const nextHash = (): SignAndSendResult => {
    signed += 1
    return { hash: `0xhash${signed}` }
  }
  const accountOn = (blockchain: string) => async (): Promise<string | null> =>
    accounts[blockchain] ?? null
  const evmOn = (blockchain: string) => ({
    getAccount: vi.fn(accountOn(blockchain)),
    getChainId: vi.fn(async (): Promise<string | null> => {
      requests.push(['evm', 'getChainId', undefined])
      return chainIds[blockchain] ?? null
    }),
    switchChain: vi.fn(async (req: { chainId: string }): Promise<void> => {
      requests.push(['evm', 'switchChain', structuredClone(req)])
    }),
    signAndSend: vi.fn(async (req: { tx: EvmTx }) => {
      requests.push(['evm', 'signAndSend', structuredClone(req)])
      return nextHash()
    }),
    getAllowance: vi.fn(
      async (req: { prerequisite: EvmApprove }): Promise<string | null> => {
        requests.push(['evm', 'getAllowance', structuredClone(req)])
        return null
      },
    ),
    buildTransaction: vi.fn(
      async (req: { prerequisite: EvmApprove }): Promise<EvmTx> => {
        requests.push(['evm', 'buildTransaction', structuredClone(req)])
        return evmApproveTx({ to: req.prerequisite.token })
      },
    ),
    getTransactionInfo: vi.fn(
      async (req: { hash: string }): Promise<EvmInfo> => {
        requests.push(['evm', 'getTransactionInfo', structuredClone(req)])
        return EVM_INFO.success
      },
    ),
    signTypedData: vi.fn(
      async (req: { typedData: unknown; chainId: string }) => {
        requests.push(['evm', 'signTypedData', structuredClone(req)])
        return signatureWith('1b')
      },
    ),
  })
  const hyperliquid = evmOn('HYPERLIQUID')
  const wallet = {
    evm: evmOn('ETH'),
    solana: {
      getAccount: vi.fn(accountOn('SOLANA')),
      signAndSend: vi.fn(
        async (req: { tx: TxOf<LegacySdk.TransactionType.SOLANA> }) => {
          requests.push(['solana', 'signAndSend', structuredClone(req)])
          return nextHash()
        },
      ),
    },
    starknet: {
      getAccount: vi.fn(accountOn('STARKNET')),
      signAndSend: vi.fn(
        async (req: { tx: TxOf<LegacySdk.TransactionType.STARKNET> }) => {
          requests.push(['starknet', 'signAndSend', structuredClone(req)])
          return nextHash()
        },
      ),
    },
    ton: {
      getAccount: vi.fn(accountOn('TON')),
      signAndSend: vi.fn(
        async (req: { tx: TxOf<LegacySdk.TransactionType.TON> }) => {
          requests.push(['ton', 'signAndSend', structuredClone(req)])
          return nextHash()
        },
      ),
    },
    sui: {
      getAccount: vi.fn(accountOn('SUI')),
      signAndSend: vi.fn(
        async (req: { tx: TxOf<LegacySdk.TransactionType.SUI> }) => {
          requests.push(['sui', 'signAndSend', structuredClone(req)])
          return nextHash()
        },
      ),
    },
  } satisfies Namespaces
  return { wallet, hyperliquid, requests, evmOn }
}
