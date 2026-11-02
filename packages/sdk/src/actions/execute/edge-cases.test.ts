// execute() calls it can't act on, repeated calls, and delete(), driven through the public client over fake-indexeddb.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  confirmQuote,
  confirmResponse,
  createExecutionClient,
  createTxResponse,
  ETH,
  evmTx,
  EXECUTION_OPTIONS,
  expectSdkError,
  httpClient,
  recordingNamespaces,
  resetHttpClient,
  SELECTED_WALLETS,
  settle,
  statusResponse,
  succeeded,
  USDC,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
// The ends an Execution reaches here; `CANCELED` comes with cancel().
const SUCCESS_OR_FAILED_STATUSES: ('SUCCESS' | 'FAILED')[] = [
  'SUCCESS',
  'FAILED',
]

let factory = new IDBFactory()

// A fresh module graph and `httpClient` mock, on this database.
function freshStart(on: IDBFactory): void {
  vi.resetModules()
  resetHttpClient()
  globalThis.indexedDB = on
  httpClient.createTransaction.mockResolvedValue(createTxResponse(evmTx()))
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// Runs a one-Step Route to its end: `SUCCESS`, or `FAILED` through a `sign` that rejects.
async function runToEnd(
  client: Sdk.RangoClient,
  port: ReturnType<typeof recordingNamespaces>,
  status: 'SUCCESS' | 'FAILED',
  requestId = 'request-1',
): Promise<void> {
  if (status === 'FAILED') {
    port.wallet.evm.sign.mockRejectedValueOnce(new Error('wallet exploded'))
  }
  await confirmQuote(client, requestId)
  await client.execute(requestId, EXECUTION_OPTIONS)
  await settle()
  expect((await client.history.get(requestId))?._queue.status).toBe(status)
}

const httpClientMethods = [
  httpClient.getBestRoute,
  httpClient.getAllRoutes,
  httpClient.confirmRoute,
  httpClient.getBlockchains,
  httpClient.createTransaction,
  httpClient.checkStatus,
  httpClient.reportFailure,
]

function clearHttpClientCalls(): void {
  for (const method of httpClientMethods) {
    method.mockClear()
  }
}

async function requestIds(client: Sdk.RangoClient): Promise<string[]> {
  return (await client.history.getAll()).map(({ _queue }) => _queue.id)
}

describe('execute() edge cases', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    freshStart(factory)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const notFound: [
    string,
    (
      client: Sdk.RangoClient,
      port: ReturnType<typeof recordingNamespaces>,
    ) => Promise<string>,
  ][] = [
    ['an unknown ID', async () => 'request-typo'],
    [
      'the request ID of a quote() Route',
      async (client) => {
        httpClient.getBestRoute.mockResolvedValue({
          ...confirmResponse('request-quoted').result,
          error: null,
          errorCode: null,
          traceId: null,
        })
        const { data } = await client.quote({
          from: ETH,
          to: USDC,
          amount: '1',
          selectedWallets: SELECTED_WALLETS,
        })
        return data.requestId
      },
    ],
    [
      'the ID of a deleted Execution',
      async (client, port) => {
        await runToEnd(client, port, 'SUCCESS')
        await client.delete('request-1')
        return 'request-1'
      },
    ],
  ]

  test.each(notFound)(
    '%s throws INVALID_INPUT requestId NOT_FOUND and sends no request',
    async (_, arrange) => {
      const port = recordingNamespaces()
      const { client } = await createExecutionClient(port)
      const requestId = await arrange(client, port)
      await settle()
      clearHttpClientCalls()
      port.requests.length = 0

      const error = await expectSdkError(
        client.execute(requestId, EXECUTION_OPTIONS),
      )
      await settle()

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        message: 'No confirmed route or stored execution has this `requestId`.',
        metadata: { field: 'requestId', reason: 'NOT_FOUND' },
      })
      for (const method of httpClientMethods) {
        expect(method).not.toHaveBeenCalled()
      }
      expect(port.requests).toEqual([])
      expect(await client.history.getAll()).toEqual([])
    },
  )

  test('with no options, a new Execution throws INVALID_INPUT options MISSING, stores nothing and keeps the Route', async () => {
    const { client, requests } = await createExecutionClient(
      recordingNamespaces(),
    )
    await confirmQuote(client)

    const error = await expectSdkError(client.execute('request-1'))
    await settle()

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      message: 'A new execution needs `options`.',
      metadata: { field: 'options', reason: 'MISSING' },
    })
    expect(await client.history.getAll()).toEqual([])
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect(requests).toEqual([])

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
  })

  const withoutWalletType: [string, Sdk.ExecutionOptions['walletTypes']][] = [
    [
      'no entry',
      Object.fromEntries(
        Object.entries(EXECUTION_OPTIONS.walletTypes).filter(
          ([blockchain]) => blockchain !== 'BSC',
        ),
      ),
    ],
    [
      'an empty walletType',
      { ...EXECUTION_OPTIONS.walletTypes, BSC: { walletType: '' } },
    ],
  ]

  test.each(withoutWalletType)(
    'with %s for a selectedWallets key, a new Execution throws INVALID_INPUT walletTypes MISSING, stores nothing and keeps the Route',
    async (_, walletTypes) => {
      const { client, requests } = await createExecutionClient(
        recordingNamespaces(),
      )
      await confirmQuote(client)

      const error = await expectSdkError(
        client.execute('request-1', { ...EXECUTION_OPTIONS, walletTypes }),
      )
      await settle()

      expect(error).toMatchObject({
        type: 'INVALID_INPUT',
        message: 'A new execution needs a `walletType` for BSC.',
        metadata: { field: 'walletTypes', reason: 'MISSING' },
      })
      expect(await client.history.getAll()).toEqual([])
      expect(httpClient.createTransaction).not.toHaveBeenCalled()
      expect(requests).toEqual([])

      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()

      expect((await client.history.get('request-1'))?._queue.status).toBe(
        'SUCCESS',
      )
    },
  )

  test('checks nothing else: walletTypes keys beyond selectedWallets are kept, and swapMode is stored as given', async () => {
    const { client } = await createExecutionClient(recordingNamespaces())
    await confirmQuote(client)
    const options: Sdk.ExecutionOptions = {
      ...EXECUTION_OPTIONS,
      walletTypes: {
        ...EXECUTION_OPTIONS.walletTypes,
        SOLANA: { walletType: 'phantom' },
      },
      swapMode: 'swap',
    }

    await client.execute('request-1', options)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.options).toEqual(options)
  })

  test('two parallel calls with the same new ID create one Execution and send one /tx/create', async () => {
    const { client, wallet } = await createExecutionClient(
      recordingNamespaces(),
    )
    await confirmQuote(client)

    const first = client.execute('request-1', EXECUTION_OPTIONS)
    const second = client.execute('request-1', EXECUTION_OPTIONS)
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ])
    await settle()

    expect(await requestIds(client)).toEqual(['request-1'])
    expect(
      httpClient.createTransaction.mock.calls.map(([req]) => req.step),
    ).toEqual([1])
    expect(wallet.evm.sign).toHaveBeenCalledTimes(1)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test.each(SUCCESS_OR_FAILED_STATUSES)(
    'an Execution that ended %s is final: re-confirming its Quote, then execute(), changes nothing',
    async (status) => {
      const port = recordingNamespaces()
      const { client, events } = await createExecutionClient(port)
      await runToEnd(client, port, status)
      const before = structuredClone(await client.history.get('request-1'))
      const eventCount = events.length
      const requestCount = port.requests.length

      await confirmQuote(client)
      clearHttpClientCalls()
      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
      await settle()

      expect(await client.history.get('request-1')).toEqual(before)
      expect(await requestIds(client)).toEqual(['request-1'])
      for (const method of httpClientMethods) {
        expect(method).not.toHaveBeenCalled()
      }
      expect(port.requests).toHaveLength(requestCount)
      expect(events).toHaveLength(eventCount)
    },
  )
})

describe('delete()', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    freshStart(factory)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test.each(SUCCESS_OR_FAILED_STATUSES)(
    'removes an Execution that ended %s, emitting no event, also for a client loading the same database',
    async (status) => {
      const port = recordingNamespaces()
      const { client, events } = await createExecutionClient(port)
      await runToEnd(client, port, status, 'request-1')
      await runToEnd(client, port, 'SUCCESS', 'request-2')
      const eventCount = events.length

      await client.delete('request-1')

      expect(await client.history.get('request-1')).toBeUndefined()
      expect(await requestIds(client)).toEqual(['request-2'])
      await settle()
      expect(events).toHaveLength(eventCount)

      freshStart(factory)
      const { client: loaded } = await createExecutionClient(
        recordingNamespaces(),
      )
      expect(await loaded.history.get('request-1')).toBeUndefined()
      expect(await requestIds(loaded)).toEqual(['request-2'])
    },
  )

  test('leaves a running Execution and an unknown ID as they are, and the running one still ends SUCCESS', async () => {
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus.mockResolvedValue(statusResponse())
    const { client, events } = await createExecutionClient(
      recordingNamespaces(),
    )
    await confirmQuote(client)
    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()
    const before = structuredClone(await client.history.get('request-1'))
    expect(before?._queue.status).toBe('RUNNING')
    const eventCount = events.length

    await expect(client.delete('request-1')).resolves.toBeUndefined()
    await expect(client.delete('request-typo')).resolves.toBeUndefined()
    await settle()

    expect(await client.history.get('request-1')).toEqual(before)
    expect(await requestIds(client)).toEqual(['request-1'])
    expect(events).toHaveLength(eventCount)

    httpClient.checkStatus.mockResolvedValue(succeeded)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await settle()

    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })
})

describe('confirmed cache', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    freshStart(factory)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Confirms each request ID in turn, every Quote under its own route ID.
  async function confirmEach(
    client: Sdk.RangoClient,
    requestIds: string[],
  ): Promise<void> {
    for (const requestId of requestIds) {
      await confirmQuote(client, requestId)
    }
  }

  // How many confirms the slot keeps.
  const KEPT = 10

  const ids = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => `request-${index + 1}`)

  test("is undefined before the first confirm, then holds each confirm's result under its request ID", async () => {
    const { client } = await createExecutionClient(recordingNamespaces())

    expect(client.cache.get('confirmed')).toBeUndefined()

    const first = await confirmQuote(client, 'request-1')
    const second = await confirmQuote(client, 'request-2')

    const confirmed = client.cache.get('confirmed')
    expect([...(confirmed?.keys() ?? [])]).toEqual(['request-1', 'request-2'])
    expect(confirmed?.get('request-1')).toEqual(first)
    expect(confirmed?.get('request-1')).not.toBe(first)
    expect(confirmed?.get('request-2')).toEqual(second)
  })

  test('an 11th confirm drops the oldest, whose execute() then throws INVALID_INPUT requestId NOT_FOUND', async () => {
    const { client } = await createExecutionClient(recordingNamespaces())
    await confirmEach(client, ids(KEPT + 1))

    expect([...(client.cache.get('confirmed')?.keys() ?? [])]).toEqual(
      ids(KEPT + 1).slice(1),
    )

    const error = await expectSdkError(
      client.execute('request-1', EXECUTION_OPTIONS),
    )
    await settle()

    expect(error).toMatchObject({
      type: 'INVALID_INPUT',
      metadata: { field: 'requestId', reason: 'NOT_FOUND' },
    })
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect(await client.history.getAll()).toEqual([])
  })

  test('re-confirming a request ID moves it to the newest place, so it outlasts the ones after it', async () => {
    const { client } = await createExecutionClient(recordingNamespaces())
    await confirmEach(client, ids(KEPT))

    await confirmQuote(client, 'request-1')

    expect([...(client.cache.get('confirmed')?.keys() ?? [])]).toEqual([
      ...ids(KEPT).slice(1),
      'request-1',
    ])

    await confirmQuote(client, 'request-11')

    expect([...(client.cache.get('confirmed')?.keys() ?? [])]).toEqual([
      ...ids(KEPT).slice(2),
      'request-1',
      'request-11',
    ])
  })

  test('a slot read earlier is unchanged by a later confirm and by execute() storing the Execution', async () => {
    const { client } = await createExecutionClient(recordingNamespaces())
    await confirmQuote(client, 'request-1')
    const read = client.cache.get('confirmed')
    const before = structuredClone(read)

    await confirmQuote(client, 'request-2')
    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(read).toEqual(before)
    expect([...(read?.keys() ?? [])]).toEqual(['request-1'])
  })

  test('the entry is gone from the slot once execute() has stored the Execution, and the others stay', async () => {
    const { client } = await createExecutionClient(recordingNamespaces())
    await confirmEach(client, ids(2))

    await client.execute('request-1', EXECUTION_OPTIONS)

    expect((await client.history.get('request-1'))?._queue.id).toBe('request-1')
    expect([...(client.cache.get('confirmed')?.keys() ?? [])]).toEqual([
      'request-2',
    ])
    await settle()
  })

  test("changing the Route confirm() returned doesn't change the kept one", async () => {
    const { client } = await createExecutionClient(recordingNamespaces())
    const returned = await confirmQuote(client, 'request-1')
    const before = structuredClone(returned)

    returned.data.requestId = 'mutated'
    returned.data.selectedWallets.ETH = '0xmutated'
    const [firstSwap] = returned.data.result?.swaps ?? []
    if (firstSwap) {
      firstSwap.toAmount = '0'
    }

    expect(client.cache.get('confirmed')?.get('request-1')).toEqual(before)
  })

  test("changing a kept Route read from the slot doesn't change the stored Execution", async () => {
    const { client } = await createExecutionClient(recordingNamespaces())
    await confirmQuote(client, 'request-1')
    const kept = client.cache.get('confirmed')?.get('request-1')
    if (!kept) {
      throw new Error('no kept Route')
    }
    const before = structuredClone(kept.data)

    await client.execute('request-1', EXECUTION_OPTIONS)
    kept.data.requestId = 'mutated'
    kept.data.selectedWallets.ETH = '0xmutated'
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.data).toEqual(before)
  })
})
