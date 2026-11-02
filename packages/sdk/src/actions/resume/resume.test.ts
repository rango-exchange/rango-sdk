// pause(), resume() and pauseOnStart: true: two tabs are two clients on the same fake-indexeddb database, with the timers faked.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  BSC_ASSET,
  callOf,
  confirmQuote,
  createExecutionClient,
  evmBlockchains,
  EXECUTION_OPTIONS,
  expectSdkError,
  hang,
  historyOf,
  httpClient,
  nameOf,
  onEthAndBsc,
  recordingNamespaces,
  reloadOn,
  scriptCreateTransaction,
  settle,
  signsOf,
  statusResponse,
  stubWindow,
  succeeded,
  swap,
} from '../../../tests/support.js'

// Core's paused Manager reloads storage on this interval.
const SYNC_INTERVAL = 5_000
// The status poll's interval.
const POLL_INTERVAL = 5_000
const TWO_STEPS = [swap(), swap({ from: BSC_ASSET, to: BSC_ASSET })]

let factory = new IDBFactory()

// The `httpClient` answers every test starts with: each Step's transaction, a status check that succeeds, a report.
function scriptLegacy(): void {
  scriptCreateTransaction()
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// Confirms and executes a Route of these swaps, and runs every pending step.
async function start(
  client: Sdk.RangoClient,
  swaps: Sdk.SwapResult[] = [swap()],
): Promise<void> {
  await confirmQuote(client, 'request-1', swaps)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
}

// Holds the port's next `sign` open until the test resolves it.
function holdSign(port: ReturnType<typeof recordingNamespaces>) {
  const held = Promise.withResolvers<{ hash: string }>()
  port.wallet.evm.sign.mockImplementationOnce(async () => held.promise)
  return held
}

// A page that stored a RUNNING Execution, its `/tx/create` left hanging, then reloaded on the same database.
async function reloadWithRunning(): Promise<void> {
  httpClient.createTransaction.mockImplementation(hang)
  const { client } = await createExecutionClient()
  await start(client)
  expect((await historyOf(client))?._queue.status).toBe('RUNNING')
  reloadOn(factory)
  scriptLegacy()
}

describe('pause() and resume()', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    scriptLegacy()
    stubWindow()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('with pauseOnStart: true, a stored RUNNING Execution waits for resume(), then runs to SUCCESS', async () => {
    await reloadWithRunning()
    const { client, requests } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')
    await advance(SYNC_INTERVAL * 2)

    expect(requests).toEqual([])
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect(httpClient.checkStatus).not.toHaveBeenCalled()
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')

    await client.resume()
    await settle()

    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    expect(requests.map(callOf)).toEqual(['getChainId', 'sign:0xcontract'])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('without pauseOnStart, a stored RUNNING Execution resumes on the first execution call, with no resume()', async () => {
    await reloadWithRunning()
    const { client, requests } = await createExecutionClient()
    await settle()
    expect(httpClient.createTransaction).not.toHaveBeenCalled()

    await client.history.getAll()
    await settle()

    expect(requests.map(callOf)).toEqual(['getChainId', 'sign:0xcontract'])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('pause() starts no new task, and a second client’s resume() continues the swap to SUCCESS', async () => {
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValue(succeeded)
    const first = recordingNamespaces()
    const held = holdSign(first)
    const { client: active } = await createExecutionClient(first)
    const second = onEthAndBsc(recordingNamespaces())
    const { client: other } = await createExecutionClient(
      second,
      evmBlockchains,
      { pauseOnStart: true },
    )
    await other.pause()
    await start(active, TWO_STEPS)
    expect(first.wallet.evm.sign).toHaveBeenCalledTimes(1)
    held.resolve({ hash: '0xhash1' })
    await settle()

    // The step 1 task in flight stops polling, then no step 2 is created.
    await active.pause()
    await settle()

    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    expect((await historyOf(active))?._queue.status).toBe('RUNNING')

    await other.resume()
    await settle()

    expect(httpClient.createTransaction).toHaveBeenCalledTimes(2)
    expect(first.wallet.evm.sign).toHaveBeenCalledTimes(1)
    expect(second.requests.map(callOf)).toEqual([
      'getChainId',
      'sign:0xcontract',
    ])
    expect(second.bsc.sign).toHaveBeenCalledTimes(1)
    expect(signsOf(second.requests)[0]).toMatchObject({
      tx: { blockChain: 'BSC', data: '0xdata2' },
    })
    const view = await historyOf(other)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.finishedSwapSteps).toBe(2)

    // The paused client sees it on its next reload of storage.
    await advance(SYNC_INTERVAL)
    expect(await historyOf(active)).toEqual(view)
  })

  test('pause() in one client then resume() in a second runs each task once across the two', async () => {
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValue(succeeded)
    const first = recordingNamespaces()
    const { client: active, events: activeEvents } =
      await createExecutionClient(first)
    const second = onEthAndBsc(recordingNamespaces())
    const { client: other, events: otherEvents } = await createExecutionClient(
      second,
      evmBlockchains,
      { pauseOnStart: true },
    )
    await other.pause()
    await start(active, TWO_STEPS)
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await active.pause()
    await other.resume()
    await settle()
    await advance(POLL_INTERVAL * 2)

    expect(httpClient.checkStatus.mock.calls.map(([{ step }]) => step)).toEqual(
      [1, 1, 2],
    )
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(2)
    expect(signsOf([...first.requests, ...second.requests])).toHaveLength(2)
    expect(
      [...activeEvents, ...otherEvents]
        .map(nameOf)
        .filter((name) => name === 'step1:succeeded'),
    ).toHaveLength(1)
    expect((await historyOf(other))?._queue.status).toBe('SUCCESS')
  })

  test('a paused client’s 5-second sync doesn’t write its old snapshot over the running client’s progress', async () => {
    httpClient.checkStatus.mockImplementation(hang)
    const port = recordingNamespaces()
    const held = holdSign(port)
    const { client: active } = await createExecutionClient(port)
    await start(active)
    const { client: paused } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    await paused.pause()
    await settle()

    // The sync's reload is still in flight when the running client stores the hash.
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL)
    held.resolve({ hash: '0xhash1' })
    await settle()

    const view = await historyOf(active)
    expect(view?._storage.transactions.s1?.execution.status).toBe('signed')
    reloadOn(factory)
    const { client: reloaded } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    expect(await historyOf(reloaded)).toEqual(view)
  })

  test('a paused client emits loaded, with no payload, each time its sync reloads the active client’s writes', async () => {
    const first = recordingNamespaces()
    const held = holdSign(first)
    const { client: active } = await createExecutionClient(first)
    await start(active)
    const second = recordingNamespaces()
    const { client: paused, all } = await createExecutionClient(
      second,
      evmBlockchains,
      { pauseOnStart: true },
    )
    await paused.pause()
    await settle()
    expect(all).toEqual([['loaded', undefined]])
    expect((await historyOf(paused))?._queue.status).toBe('RUNNING')

    held.resolve({ hash: '0xhash1' })
    await settle()
    expect((await historyOf(active))?._queue.status).toBe('SUCCESS')
    expect((await historyOf(paused))?._queue.status).toBe('RUNNING')

    await advance(SYNC_INTERVAL)

    const view = await historyOf(paused)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view).toEqual(await historyOf(active))
    expect(all.slice(1)).toEqual([['loaded', undefined]])
    expect(second.requests).toEqual([])
  })

  test.each([1, 2])(
    'resume() called %i times on a client that isn’t paused, with an Execution in flight, makes no port call, emits no event and leaves history as it was',
    async (times) => {
      const port = recordingNamespaces()
      port.wallet.evm.sign.mockImplementation(hang)
      const { client, all } = await createExecutionClient(port)
      await start(client)
      const before = await historyOf(client)
      expect(before?._queue.status).toBe('RUNNING')
      const requestCount = port.requests.length
      const eventCount = all.length

      for (let call = 0; call < times; call += 1) {
        await client.resume()
      }
      await settle()

      expect(port.requests).toHaveLength(requestCount)
      expect(port.wallet.evm.sign).toHaveBeenCalledTimes(1)
      expect(all).toHaveLength(eventCount)
      expect(await historyOf(client)).toEqual(before)
    },
  )

  test('pause() then resume() on one client resumes its RUNNING Execution to SUCCESS', async () => {
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValue(succeeded)
    const recording = recordingNamespaces()
    const held = holdSign(recording)
    const port = onEthAndBsc(recording)
    const { client } = await createExecutionClient(port)
    await start(client, TWO_STEPS)
    held.resolve({ hash: '0xhash1' })
    await settle()

    // The step 1 task in flight stops polling, then no step 2 is created.
    await client.pause()
    await settle()
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')

    await client.resume()
    await settle()

    expect(httpClient.createTransaction).toHaveBeenCalledTimes(2)
    expect(port.eth.sign).toHaveBeenCalledTimes(1)
    expect(port.bsc.sign).toHaveBeenCalledTimes(1)
    expect(signsOf(port.requests)).toMatchObject([
      { tx: { blockChain: 'BSC', data: '0xdata2' } },
    ])
    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.finishedSwapSteps).toBe(2)
  })

  test('pause() then resume() on one client, while a step is mid-sign, asks the WalletPort to sign once and ends SUCCESS once', async () => {
    const port = recordingNamespaces()
    const held = Promise.withResolvers<string | null>()
    port.wallet.evm.getChainId.mockImplementationOnce(async () => held.promise)
    const { client, events } = await createExecutionClient(port)
    await start(client)
    expect(port.wallet.evm.sign).not.toHaveBeenCalled()

    await client.pause()
    await client.resume()
    await settle()
    // The paused run's chain read answers only after the new run ended.
    held.resolve('0x1')
    await settle()

    expect(port.wallet.evm.sign).toHaveBeenCalledTimes(1)
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(
      events.map(nameOf).filter((name) => name === 'route:succeeded'),
    ).toHaveLength(1)
  })

  test('pause() mid-poll then resume() runs one poller, with no check_status between them, and the next Step starts once', async () => {
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValue(succeeded)
    const { client, events } = await createExecutionClient(
      onEthAndBsc(recordingNamespaces()),
    )
    await start(client, TWO_STEPS)
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await client.pause()
    await advance(POLL_INTERVAL * 2)

    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)

    await client.resume()
    await settle()
    await advance(POLL_INTERVAL * 2)

    // The check before the pause, then one each for step 1 on resume and for step 2.
    expect(httpClient.checkStatus.mock.calls.map(([{ step }]) => step)).toEqual(
      [1, 1, 2],
    )
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(2)
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(
      events.map(nameOf).filter((name) => name === 'step1:succeeded'),
    ).toHaveLength(1)
  })

  test('pause() on a paused client resolves and changes nothing: one sync per interval, nothing resumed', async () => {
    await reloadWithRunning()
    const { client, all, requests } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    await client.pause()
    await client.pause()
    await settle()
    const eventCount = all.length

    await advance(SYNC_INTERVAL)

    expect(all.slice(eventCount).map(nameOf)).toEqual(['loaded'])
    expect(requests).toEqual([])
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')
  })

  test.each([
    [
      'pauseOnStart: true',
      async () =>
        (
          await createExecutionClient(recordingNamespaces(), evmBlockchains, {
            pauseOnStart: true,
          })
        ).client.pause(),
    ],
    ['pause()', async () => (await createExecutionClient()).client.pause()],
  ])(
    'with no window, as in Node, pause() on a client built with %s rejects with REQUEST_FAILED',
    async (_, call) => {
      vi.unstubAllGlobals()

      const error = await expectSdkError(call())

      expect(error).toMatchObject({
        type: 'REQUEST_FAILED',
        message: 'The request failed.',
        cause: expect.any(ReferenceError),
      })
    },
  )
})

// A client paused one of the two ways: built with pauseOnStart: true, or paused by pause() after it started.
const pausedClients: [
  string,
  () => ReturnType<typeof createExecutionClient>,
][] = [
  [
    'pauseOnStart: true',
    async () =>
      createExecutionClient(recordingNamespaces(), evmBlockchains, {
        pauseOnStart: true,
      }),
  ],
  [
    'pause()',
    async () => {
      const built = await createExecutionClient()
      await built.client.pause()
      return built
    },
  ],
]

describe('execute() of a new Route in a paused client', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    scriptLegacy()
    stubWindow()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test.each(pausedClients)(
    'with %s, throws CLIENT_PAUSED with no metadata, emits nothing, sends no /tx/create, stores nothing and keeps the Route',
    async (_, build) => {
      const { client, all, requests } = await build()
      await confirmQuote(client)
      // Loads the execution engine first, so the paused Manager's first `loaded` is not counted.
      await client.history.getAll()
      await settle()
      const eventCount = all.length

      const error = await expectSdkError(
        client.execute('request-1', EXECUTION_OPTIONS),
      )
      await settle()

      expect(error).toMatchObject({
        type: 'CLIENT_PAUSED',
        message: 'The client is paused: call `resume()` first.',
      })
      expect(error).not.toHaveProperty('metadata')
      expect(all).toHaveLength(eventCount)
      expect(httpClient.createTransaction).not.toHaveBeenCalled()
      expect(requests).toEqual([])
      expect(await client.history.getAll()).toEqual([])
      expect(client.cache.get('confirmed')?.has('request-1')).toBe(true)
    },
  )

  test.each(pausedClients)(
    'with %s, execute() with the same request ID after resume() runs the Execution to SUCCESS',
    async (_, build) => {
      const { client } = await build()
      await confirmQuote(client)
      await expectSdkError(client.execute('request-1', EXECUTION_OPTIONS))

      // Once resume()'s reload of storage has ended, which would otherwise drop the new record.
      await client.resume()
      await settle()
      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()

      expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    },
  )

  test('still throws INVALID_INPUT for an unknown request ID and missing options', async () => {
    const { client } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    await confirmQuote(client)

    const errors = [
      await expectSdkError(client.execute('request-2', EXECUTION_OPTIONS)),
      await expectSdkError(client.execute('request-1')),
    ]

    expect(errors).toMatchObject([
      {
        type: 'INVALID_INPUT',
        message: 'No confirmed route or stored execution has this `requestId`.',
        metadata: { field: 'requestId', reason: 'NOT_FOUND' },
      },
      {
        type: 'INVALID_INPUT',
        message: 'A new execution needs `options`.',
        metadata: { field: 'options', reason: 'MISSING' },
      },
    ])
    expect(await client.history.getAll()).toEqual([])
  })

  test('execute() of a stored Execution still resolves and changes nothing', async () => {
    await reloadWithRunning()
    const { client, all, requests } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    await settle()
    const before = await historyOf(client)
    const eventCount = all.length

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(await historyOf(client)).toEqual(before)
    expect(before?._queue.status).toBe('RUNNING')
    expect(all).toHaveLength(eventCount)
    expect(requests).toEqual([])
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
  })
})

describe('cancel() and delete() in a paused client', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    scriptLegacy()
    stubWindow()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('cancel() throws CLIENT_PAUSED for a known and an unknown request ID, reports nothing, and the running client still ends SUCCESS', async () => {
    const port = recordingNamespaces()
    const held = holdSign(port)
    const { client: active } = await createExecutionClient(port)
    await start(active)
    const { client: paused } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    expect((await historyOf(paused))?._queue.status).toBe('RUNNING')

    const errors = [
      await expectSdkError(paused.cancel('request-1')),
      await expectSdkError(paused.cancel('unknown')),
    ]
    held.resolve({ hash: '0xhash1' })
    await settle()

    const clientPaused = {
      type: 'CLIENT_PAUSED',
      message: 'The client is paused: call `resume()` first.',
    }
    expect(errors).toMatchObject([clientPaused, clientPaused])
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
    const view = await historyOf(active)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.failure).toBeNull()
  })

  test('delete() of an ended Execution resolves, and a client loading the same database no longer sees it', async () => {
    const { client: active } = await createExecutionClient()
    await start(active)
    expect((await historyOf(active))?._queue.status).toBe('SUCCESS')
    const { client: paused } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    expect((await historyOf(paused))?._queue.status).toBe('SUCCESS')

    await expect(paused.delete('request-1')).resolves.toBeUndefined()
    await settle()
    reloadOn(factory)
    const { client: reloaded } = await createExecutionClient()

    expect(await historyOf(reloaded)).toBeUndefined()
  })
})
