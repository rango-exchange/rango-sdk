import type * as Sdk from '../../mod.js'
import type { Transaction } from 'rango-sdk'
import type {
  APIErrorCode,
  TransactionPrerequisite,
  TransactionType,
} from 'rango-types'

import * as FakeIndexedDB from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
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

const SELECTED_WALLETS = {
  ETH: { address: '0xfrom', walletId: 'metamask' },
  BSC: { address: '0xto', walletId: 'trust' },
}

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

// Each execution method, called on a client with no wallet.
const calls: [string, (client: Sdk.RangoClient) => Promise<unknown>][] = [
  [
    'execute() with options',
    async (client) => client.execute('request-1', EXECUTION_OPTIONS),
  ],
]

// A client with no `execution`, and one whose `execution` has every key.
const builds: [string, () => Promise<Sdk.RangoClient>][] = [
  ['without execution', async () => createClient(evmBlockchains)],
  [
    'with an execution',
    async () => {
      const { RangoClient } = await loadSdk()
      httpClient.getBlockchains.mockResolvedValue([...evmBlockchains])
      return new RangoClient({
        apiKey: 'test-key',
        execution: { pauseOnStart: false },
      })
    },
  ],
]
type WithoutWallet = [
  string,
  string,
  () => Promise<Sdk.RangoClient>,
  (client: Sdk.RangoClient) => Promise<unknown>,
]
const withoutWallet = builds.flatMap(([build, create]) =>
  calls.map(([name, call]): WithoutWallet => [build, name, create, call]),
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
    async (_, __, build, call) => {
      stubIndexedDB()
      stubWindow()
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      scriptCreateTransaction()
      const client = await build()
      await cacheQuote(client)
      await client.confirm('request-1', SELECTED_WALLETS)

      await call(client)
      await settle()
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
    const { client } = await createExecutionClient()
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

  test('types the execution methods', async () => {
    const client = await createClient()

    expectTypeOf(client.execute).parameters.toEqualTypeOf<
      [string, (Sdk.ExecutionOptions | undefined)?]
    >()
    expectTypeOf(client.execute).returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf(client).not.toHaveProperty('setActive')
  })

  test('types ExecutionConfig, the client config’s execution key and ExecutionOptions, and exports no ExecuteOptions, UserOptions or CreateTransactionOptions', () => {
    expectTypeOf<Sdk.RangoClientConfig['execution']>().toEqualTypeOf<
      Sdk.ExecutionConfig | undefined
    >()
    expectTypeOf<Sdk.ExecutionConfig>().toEqualTypeOf<{
      pauseOnStart?: boolean
    }>()
    expectTypeOf<Sdk.ExecutionOptions>().toEqualTypeOf<{
      transactionOptions: {
        slippage: string
        infiniteApprove?: boolean
        validations: { balance: boolean; fee: boolean }
      }
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

  test('exports the execution types, and TransactionType as a value', async () => {
    const sdk = await loadSdk()

    expect(sdk.TransactionType.EVM).toBe('EVM')
    expectTypeOf<Sdk.Transaction>().toEqualTypeOf<Transaction>()
    expectTypeOf<Sdk.TransactionType>().toEqualTypeOf<TransactionType>()
    expectTypeOf<Sdk.TransactionPrerequisite>().toEqualTypeOf<TransactionPrerequisite>()
    expectTypeOf<Sdk.APIErrorCode>().toEqualTypeOf<APIErrorCode>()
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
  })

  test('narrows an INVALID_INPUT error on options to MISSING, on a client with no wallet', async () => {
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
    expect(error.metadata.field).toBe('options')
  })
})
