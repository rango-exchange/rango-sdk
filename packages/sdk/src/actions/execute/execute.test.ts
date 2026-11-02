import type { EvmInfo, EvmNamespace } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'
import type { Transaction } from 'rango-sdk'
import type {
  APIErrorCode,
  TransactionPrerequisite,
  TransactionType,
} from 'rango-types'

import * as FakeIndexedDB from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import * as RangoTypes from 'rango-types'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from 'vitest'

import {
  cacheQuote,
  createClient,
  createExecutionClient,
  DESTINATION,
  ETH,
  evmApproveTx,
  evmBlockchains,
  EXECUTION_OPTIONS,
  expectSdkError,
  httpClient,
  loadSdk,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  stubWindow,
  swap,
  USDC,
  validationStatus,
} from '../../../tests/support.js'

const SELECTED_WALLETS = { ETH: '0xfrom', BSC: '0xto' }

const routeResult = {
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
}

// An `evm` namespace with only its required methods.
function minimalWallet() {
  return {
    sign: vi.fn(async () => ({ hash: '0xhash' })),
    getAccount: vi.fn(async () => '0xfrom'),
    getChainId: vi.fn(async () => '0x1'),
    switchChain: vi.fn(async () => undefined),
    getAllowance: vi.fn(async () => null),
    buildTransaction: vi.fn(async () => evmApproveTx()),
    getTransactionInfo: vi.fn(async (): Promise<EvmInfo> => 'pending'),
  } satisfies EvmNamespace
}

/*
 * A fresh fake IndexedDB, with the `IDB*` classes core's `idb` checks results against, as `fake-indexeddb/auto` sets
 * them: imported here, it would break the tests that check Node has no IndexedDB. `vi.unstubAllGlobals()` removes it.
 */
function stubIndexedDB(): void {
  vi.stubGlobal('indexedDB', new FakeIndexedDB.IDBFactory())
  for (const [name, value] of Object.entries(FakeIndexedDB)) {
    if (name.startsWith('IDB')) {
      vi.stubGlobal(name, value)
    }
  }
}

// Each execution method, and what `history.get('request-1')` answers after it on a client with no wallet.
const calls: [
  string,
  (client: Sdk.RangoClient) => Promise<unknown>,
  Sdk.HistoryItem['_queue']['status'] | undefined,
][] = [
  [
    'execute() with options',
    async (client) => client.execute('request-1', EXECUTION_OPTIONS),
    'BLOCKED',
  ],
  [
    'history.get()',
    async (client) => client.history.get('request-1'),
    undefined,
  ],
  ['history.getAll()', async (client) => client.history.getAll(), undefined],
]

// A client with no `execution`, and one whose `execution` has every key but `wallet`.
const builds: [string, () => Promise<Sdk.RangoClient>][] = [
  ['without execution', async () => createClient(evmBlockchains)],
  [
    'with an execution without wallet',
    async () => {
      const { RangoClient } = await loadSdk()
      httpClient.getBlockchains.mockResolvedValue([...evmBlockchains])
      return new RangoClient({
        apiKey: 'test-key',
        execution: {
          emitter: { emit: vi.fn() },
          pauseOnStart: false,
          beforeResume: vi.fn(),
        },
      })
    },
  ],
]
type WithoutWallet = [
  string,
  string,
  () => Promise<Sdk.RangoClient>,
  (client: Sdk.RangoClient) => Promise<unknown>,
  Sdk.HistoryItem['_queue']['status'] | undefined,
]
const withoutWallet = builds.flatMap(([build, create]) =>
  calls.map(
    ([name, call, status]): WithoutWallet => [
      build,
      name,
      create,
      call,
      status,
    ],
  ),
)

describe('the execution keys', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    httpClient.confirmRoute.mockResolvedValue({
      ok: true,
      result: routeResult,
      error: null,
      errorCode: null,
      traceId: null,
    })
    httpClient.getBestRoute.mockResolvedValue({
      ...routeResult,
      error: null,
      errorCode: null,
      traceId: null,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'indexedDB')
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test.each(withoutWallet)(
    '%s, %s throws nothing',
    async (_, __, build, call, status) => {
      stubIndexedDB()
      stubWindow()
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      scriptCreateTransaction()
      const client = await build()
      await cacheQuote(client)
      await client.confirm('request-1', SELECTED_WALLETS)

      await call(client)
      await settle()

      expect((await client.history.get('request-1'))?._queue.status).toBe(
        status,
      )
    },
  )

  test('without execution, quote(), quotes() and confirm() work in Node, which has no IndexedDB', async () => {
    expect('indexedDB' in globalThis).toBe(false)
    const client = await createClient()

    const { requestId } = await cacheQuote(client)
    const confirmed = await client.confirm(requestId, SELECTED_WALLETS, {
      req: { destination: DESTINATION },
    })
    const quoted = await client.quote({
      from: ETH,
      to: USDC,
      amount: '1',
      selectedWallets: SELECTED_WALLETS,
    })

    expect(confirmed.data.requestId).toBe('request-1')
    expect(quoted.data.requestId).toBe('request-1')
  })

  test('without IndexedDB, execute() throws REQUEST_FAILED with the core error as cause, and quoting still works', async () => {
    expect('indexedDB' in globalThis).toBe(false)
    // Core logs its failed load.
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { client, requests } = await createExecutionClient()
    await cacheQuote(client)
    await client.confirm('request-1', SELECTED_WALLETS)

    const error = await expectSdkError(
      client.execute('request-1', EXECUTION_OPTIONS),
    )

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      message: 'The request failed.',
    })
    expect(error).toHaveProperty('cause', expect.any(Error))
    expect(error).toHaveProperty('cause.message', "Couldn't load idb.")
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect(requests).toEqual([])

    const { requestId } = await cacheQuote(client)
    const confirmed = await client.confirm(requestId, SELECTED_WALLETS)
    const quoted = await client.quote({
      from: ETH,
      to: USDC,
      amount: '1',
      selectedWallets: SELECTED_WALLETS,
    })
    expect(confirmed.data.requestId).toBe('request-1')
    expect(quoted.data.requestId).toBe('request-1')
    log.mockRestore()
  })

  test('builds with a port that has only the required methods of an evm namespace, calling no port method and touching no IndexedDB', async () => {
    const { RangoClient } = await loadSdk()
    const indexedDB = vi.fn(() => undefined)
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get: indexedDB,
    })
    const wallet = minimalWallet()

    const { client } = await createExecutionClient(
      { wallet: { evm: wallet }, requests: [] },
      evmBlockchains,
      {
        emitter: null,
      },
    )

    expect(client).toBeInstanceOf(RangoClient)
    expect(wallet.sign).not.toHaveBeenCalled()
    expect(wallet.getAccount).not.toHaveBeenCalled()
    expect(wallet.getChainId).not.toHaveBeenCalled()
    expect(indexedDB).not.toHaveBeenCalled()
  })

  test('with an execution of wallet, emitter and pauseOnStart, quote(), quotes() and confirm() still work, calling no port method and emitting nothing', async () => {
    const wallet = minimalWallet()
    const emitter = { emit: vi.fn() }
    const { client } = await createExecutionClient(
      { wallet: { evm: wallet }, requests: [] },
      [],
      {
        emitter,
        pauseOnStart: true,
      },
    )

    const { requestId } = await cacheQuote(client)
    const confirmed = await client.confirm(requestId, SELECTED_WALLETS)
    const quoted = await client.quote({
      from: ETH,
      to: USDC,
      amount: '1',
      selectedWallets: SELECTED_WALLETS,
    })

    expect(confirmed.data.requestId).toBe('request-1')
    expect(quoted.data.requestId).toBe('request-1')
    expect(wallet.sign).not.toHaveBeenCalled()
    expect(wallet.getAccount).not.toHaveBeenCalled()
    expect(wallet.getChainId).not.toHaveBeenCalled()
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  test('types the execution methods', async () => {
    const client = await createClient()

    expectTypeOf(client.execute).parameters.toEqualTypeOf<
      [string, (Sdk.ExecutionOptions | undefined)?]
    >()
    expectTypeOf(client.execute).returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf(client).not.toHaveProperty('setActive')
    expectTypeOf(client.history).toEqualTypeOf<Sdk.ExecutionHistory>()
    expectTypeOf(client.history.get).returns.toEqualTypeOf<
      Promise<Sdk.HistoryItem | undefined>
    >()
    expectTypeOf(client.history.getAll).returns.toEqualTypeOf<
      Promise<Sdk.HistoryItem[]>
    >()
  })

  test('types ExecutionConfig, the client config’s execution key and ExecutionOptions, and exports no ExecuteOptions, UserOptions or CreateTransactionOptions', () => {
    expectTypeOf<Sdk.RangoClientConfig['execution']>().toEqualTypeOf<
      Sdk.ExecutionConfig | undefined
    >()
    expectTypeOf<Sdk.ExecutionConfig>().toEqualTypeOf<{
      wallet?: Sdk.WalletPort
      emitter?: Sdk.Emitter<Sdk.ExecutionEvents>
      pauseOnStart?: boolean
      beforeResume?: Sdk.BeforeResume
    }>()
    expectTypeOf<Sdk.ExecutionOptions>().toEqualTypeOf<{
      transactionOptions: {
        slippage: string
        infiniteApprove?: boolean
        validations: { balance: boolean; fee: boolean }
      }
      walletTypes: { [blockchain: string]: { walletType: string } }
      swapMode?: 'swap' | 'refuel'
    }>()
    expectTypeOf<
      Sdk.ExecutionRecord['options']
    >().toEqualTypeOf<Sdk.ExecutionOptions>()
    // @ts-expect-error ExecuteOptions is not exported
    expectTypeOf<Sdk.ExecuteOptions>().not.toBeNever()
    // @ts-expect-error UserOptions is not exported
    expectTypeOf<Sdk.UserOptions>().not.toBeNever()
    // @ts-expect-error CreateTransactionOptions is not exported
    expectTypeOf<Sdk.CreateTransactionOptions>().not.toBeNever()
  })

  test('exports the execution types, and TransactionType, SignerError and SignerErrorCode as values', async () => {
    const sdk = await loadSdk()

    expect(sdk.TransactionType.EVM).toBe('EVM')
    // A fresh module graph per test: the entry's rango-types is another copy, so these compare by behaviour.
    expect(sdk.SignerErrorCode).toEqual(RangoTypes.SignerErrorCode)
    const error = new sdk.SignerError(sdk.SignerErrorCode.SIGN_TX_ERROR)
    expect(error).toBeInstanceOf(sdk.SignerError)
    expect(RangoTypes.SignerError.isSignerError(error)).toBe(true)
    expect(error.getErrorDetail().message).toBe('Error signing the transaction')
    expectTypeOf<Sdk.SignerError>().toEqualTypeOf<RangoTypes.SignerError>()
    expectTypeOf<Sdk.SignerErrorCode>().toEqualTypeOf<RangoTypes.SignerErrorCode>()
    expectTypeOf<Sdk.Transaction>().toEqualTypeOf<Transaction>()
    expectTypeOf<Sdk.TransactionType>().toEqualTypeOf<TransactionType>()
    expectTypeOf<Sdk.TransactionPrerequisite>().toEqualTypeOf<TransactionPrerequisite>()
    expectTypeOf<Sdk.APIErrorCode>().toEqualTypeOf<APIErrorCode>()
    expectTypeOf<Sdk.HistoryItem>().toEqualTypeOf<{
      _storage: Sdk.ExecutionRecord
      _queue: {
        id: string
        createdAt: number
        status:
          | 'PENDING'
          | 'RUNNING'
          | 'BLOCKED'
          | 'SUCCESS'
          | 'FAILED'
          | 'CANCELED'
        blocked: Sdk.BlockReason | null
      }
    }>()
    // @ts-expect-error ExecutionView is not exported: HistoryItem replaces it
    expectTypeOf<Sdk.ExecutionView>().not.toBeNever()
    expectTypeOf<
      Sdk.ExecutionRecord['transactions'][string]
    >().toEqualTypeOf<Sdk.ExecutionTransaction>()
    expectTypeOf<
      Sdk.ExecutionRecord['failure']
    >().toEqualTypeOf<Sdk.ExecutionFailure | null>()
    expectTypeOf<keyof Sdk.ExecutionTransaction>().toEqualTypeOf<
      'data' | 'step' | 'execution'
    >()
    // @ts-expect-error: there is no stored activity, so no ExecutionActivity export.
    expectTypeOf<Sdk.ExecutionActivity>().toBeNever()
    expectTypeOf<Sdk.ExecutionEvents['routeEvent']>().toEqualTypeOf<{
      event: Sdk.RouteEvent
      view: Sdk.HistoryItem
    }>()
    expectTypeOf<Sdk.ExecutionEvents['stepEvent']>().toEqualTypeOf<{
      event: Sdk.StepEvent
      step: number
      transactionId: string | null
      view: Sdk.HistoryItem
    }>()
    expectTypeOf<
      Sdk.ExecutionEvents['changed']
    >().toEqualTypeOf<Sdk.HistoryItem>()
    expectTypeOf<
      Sdk.ExecutionEvents['stepEvent']['event']
    >().toEqualTypeOf<Sdk.StepEvent>()
    expectTypeOf<keyof Sdk.ExecutionEvents>().toEqualTypeOf<
      'routeEvent' | 'stepEvent' | 'changed' | 'loaded'
    >()
    expectTypeOf<Sdk.ExecutionEvents['loaded']>().toEqualTypeOf<undefined>()
  })

  test('types the WalletPort as nine optional namespaces, each with only the methods the SDK calls for it, getTransactionInfo answering the Host judgement on evm and what the chain says elsewhere, and exports no WalletTarget', () => {
    type TxOf<T extends TransactionType> = Extract<Transaction, { type: T }>
    type PrerequisiteOf<T extends TransactionPrerequisite['type']> = Extract<
      TransactionPrerequisite,
      { type: T }
    >
    type OnChain = { blockchain: string }

    expectTypeOf<Sdk.WalletPort>().toEqualTypeOf<{
      evm?: Sdk.EvmWallet
      tron?: Sdk.TronWallet
      xrpl?: Sdk.XrplWallet
      stellar?: Sdk.StellarWallet
      bip122?: Sdk.Bip122Wallet
      solana?: Sdk.SolanaWallet
      starknet?: Sdk.StarknetWallet
      ton?: Sdk.TonWallet
      sui?: Sdk.SuiWallet
    }>()
    expectTypeOf<Sdk.SignResult>().toEqualTypeOf<{
      hash: string
      response?: unknown
      hashRequiringUpdate?: boolean
    }>()
    expectTypeOf<Sdk.EvmChainDescription>().toEqualTypeOf<{
      chainName: string
      nativeCurrency: { name: string; symbol: string; decimals: number }
      rpcUrls: string[]
      blockExplorerUrls: string[]
    }>()
    expectTypeOf<Sdk.EvmWallet>().toEqualTypeOf<{
      getAccount(req: OnChain): Promise<string | null>
      getChainId(req: OnChain): Promise<string | null>
      switchChain(req: {
        blockchain: string
        chainId: string
        chain?: Sdk.EvmChainDescription
      }): Promise<void>
      sign(req: {
        blockchain: string
        tx: TxOf<TransactionType.EVM>
      }): Promise<Sdk.SignResult>
      wait?(req: {
        blockchain: string
        hash: string
        response?: unknown
      }): Promise<{ hash: string; response?: unknown }>
      getAllowance(req: {
        blockchain: string
        prerequisite: PrerequisiteOf<'EVM_APPROVE'>
      }): Promise<string | null>
      buildTransaction(req: {
        blockchain: string
        prerequisite: PrerequisiteOf<'EVM_APPROVE'>
      }): Promise<TxOf<TransactionType.EVM>>
      getTransactionInfo(req: {
        blockchain: string
        hash: string
      }): Promise<'pending' | 'success' | 'failed'>
    }>()
    expectTypeOf<Sdk.TronWallet>().toEqualTypeOf<{
      getAccount(): Promise<string | null>
      sign(req: { tx: TxOf<TransactionType.TRON> }): Promise<Sdk.SignResult>
      getAllowance(req: {
        prerequisite: PrerequisiteOf<'TRON_APPROVE'>
      }): Promise<string | null>
      buildTransaction(req: {
        prerequisite: PrerequisiteOf<'TRON_APPROVE'>
      }): Promise<TxOf<TransactionType.TRON>>
      getTransactionInfo(req: { hash: string }): Promise<{
        blockNumber?: number
        receipt?: { result?: string }
      }>
    }>()
    expectTypeOf<Sdk.XrplWallet>().toEqualTypeOf<{
      getAccount(): Promise<string | null>
      sign(req: { tx: TxOf<TransactionType.XRPL> }): Promise<Sdk.SignResult>
      getTrustline(req: {
        prerequisite: PrerequisiteOf<'XRPL_CHANGE_TRUSTLINE'>
      }): Promise<string | null>
      buildTransaction(req: {
        prerequisite: PrerequisiteOf<'XRPL_CHANGE_TRUSTLINE'>
        limit: string
      }): Promise<TxOf<TransactionType.XRPL>>
      getTransactionInfo(req: { hash: string }): Promise<{
        validated: boolean
        meta?: { TransactionResult: string }
      }>
    }>()
    expectTypeOf<Sdk.StellarWallet>().toEqualTypeOf<{
      getAccount(): Promise<string | null>
      sign(req: { tx: TxOf<TransactionType.STELLAR> }): Promise<Sdk.SignResult>
      getTrustline(req: {
        prerequisite: PrerequisiteOf<'STELLAR_CHANGE_TRUSTLINE'>
      }): Promise<string | null>
      buildTransaction(req: {
        prerequisite: PrerequisiteOf<'STELLAR_CHANGE_TRUSTLINE'>
        limit: string
      }): Promise<TxOf<TransactionType.STELLAR>>
    }>()
    expectTypeOf<Sdk.Bip122Wallet>().toEqualTypeOf<{
      getAccount(req: OnChain): Promise<string | null>
      sign(req: {
        blockchain: string
        tx: TxOf<TransactionType.TRANSFER>
      }): Promise<Sdk.SignResult>
    }>()
    expectTypeOf<Sdk.SolanaWallet>().toEqualTypeOf<{
      getAccount(): Promise<string | null>
      sign(req: { tx: TxOf<TransactionType.SOLANA> }): Promise<Sdk.SignResult>
    }>()
    expectTypeOf<Sdk.StarknetWallet>().toEqualTypeOf<{
      getAccount(): Promise<string | null>
      sign(req: { tx: TxOf<TransactionType.STARKNET> }): Promise<Sdk.SignResult>
    }>()
    expectTypeOf<Sdk.TonWallet>().toEqualTypeOf<{
      getAccount(): Promise<string | null>
      sign(req: { tx: TxOf<TransactionType.TON> }): Promise<Sdk.SignResult>
    }>()
    expectTypeOf<Sdk.SuiWallet>().toEqualTypeOf<{
      getAccount(): Promise<string | null>
      sign(req: { tx: TxOf<TransactionType.SUI> }): Promise<Sdk.SignResult>
    }>()
    // Only wait is optional: switchChain is required on evm.
    expectTypeOf<undefined>().toExtend<Sdk.EvmWallet['wait']>()
    expectTypeOf<undefined>().not.toExtend<Sdk.EvmWallet['switchChain']>()
    expectTypeOf<undefined>().not.toExtend<Sdk.EvmWallet['sign']>()
    expectTypeOf<undefined>().not.toExtend<Sdk.EvmWallet['getAllowance']>()
    expectTypeOf<undefined>().not.toExtend<Sdk.EvmWallet['buildTransaction']>()
    expectTypeOf<undefined>().not.toExtend<Sdk.TronWallet['buildTransaction']>()
    expectTypeOf<undefined>().not.toExtend<Sdk.XrplWallet['buildTransaction']>()
    // @ts-expect-error WalletTarget is not exported: no request carries an address
    expectTypeOf<Sdk.WalletTarget>().not.toBeNever()
    // @ts-expect-error there is no cosmos namespace
    expectTypeOf<Sdk.WalletPort['cosmos']>().not.toBeNever()
  })

  test('narrows an INVALID_INPUT error on options or walletTypes to MISSING, on a client with no wallet', async () => {
    stubIndexedDB()
    const client = await createClient(evmBlockchains)
    await cacheQuote(client)
    await client.confirm('request-1', SELECTED_WALLETS)

    const error = await client.execute('request-1').catch((e: unknown) => e)

    const { SdkError } = await loadSdk()
    if (!(error instanceof SdkError) || error.type !== 'INVALID_INPUT') {
      throw new Error('expected an INVALID_INPUT SdkError')
    }
    if (error.metadata.field === 'options') {
      expectTypeOf(error.metadata.reason).toEqualTypeOf<'MISSING'>()
    }
    if (error.metadata.field === 'walletTypes') {
      expectTypeOf(error.metadata.reason).toEqualTypeOf<'MISSING'>()
    }
    expect(error.metadata.field).toBe('options')
  })
})
