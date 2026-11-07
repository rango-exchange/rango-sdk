// cancel(): a pending, running or blocked Execution ends `CANCELED` with a `USER_CANCEL` failure, driven through the public client over fake-indexeddb.
import 'fake-indexeddb/auto'

import type { RecordedEvent } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  BSC_ASSET,
  chain,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  done,
  evmBlockchains,
  EXECUTION_OPTIONS,
  hang,
  historyOf,
  httpClient,
  hyperliquidTx,
  isObject,
  nameOf,
  openQueues,
  recordingNamespaces,
  reloadOn,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  SIGNATURE_CHAIN_ID,
  signatureWith,
  stubHyperliquid,
  stubWindow,
  succeeded,
  swap,
  switchingNamespaces,
  typedSigningNamespaces,
  viewOf,
  waitingNamespaces,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
// The `stepEvent` `failed` and `routeEvent` `failed` a cancel ends with.
const FAILED_TAIL = 2
const USER_CANCEL: Sdk.ExecutionFailure = {
  reasonCode: 'USER_CANCEL',
  message: 'Swap canceled by user.',
  detail: null,
}

// The ends an Execution can reach.
const ENDED_QUEUE_STATUSES: ('SUCCESS' | 'FAILED' | 'CANCELED')[] = [
  'SUCCESS',
  'FAILED',
  'CANCELED',
]

let factory = new IDBFactory()

// Confirms a Route of these Steps and executes it, with every pending step run.
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

// Cancels `request-1` and runs every step it releases.
async function cancel(client: Sdk.RangoClient): Promise<void> {
  await client.cancel('request-1')
  await settle()
}

// The `transactionId` the cancel's step 1 `failed` event carries.
function failedTransactionOf(
  events: RecordedEvent[],
): string | null | undefined {
  const failed = events.find((event) => nameOf(event) === 'step1:failed')
  return failed?.[0] === 'stepEvent' ? failed[1].transactionId : undefined
}

/*
 * Stores `request-1` PENDING, with no task run, in a fresh database the next client loads: a RUNNING one whose
 * `/tx/create` hangs, with its queue and task states set back to PENDING.
 */
async function storePendingExecution(): Promise<void> {
  httpClient.createTransaction.mockImplementation(hang)
  const { client } = await createExecutionClient()
  await start(client)
  const source = await openQueues(factory)
  const records: unknown[] = await done(
    source.transaction('queues').objectStore('queues').getAll(),
  )
  source.close()
  const [record] = records
  if (
    !isObject(record) ||
    !isObject(record.state) ||
    !isObject(record.state.tasks)
  ) {
    throw new Error('No stored queue')
  }
  const taskStates = Object.fromEntries(
    Object.keys(record.state.tasks).map((id) => [
      id,
      { status: 'PENDING', blockedFor: null },
    ]),
  )
  factory = new IDBFactory()
  reloadOn(factory)
  scriptCreateTransaction()
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
  const target = await openQueues(factory)
  await done(
    target
      .transaction('queues', 'readwrite')
      .objectStore('queues')
      .put({
        ...record,
        status: 'PENDING',
        state: { ...record.state, status: 'PENDING', tasks: taskStates },
      }),
  )
  target.close()
}

describe('cancel()', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('a RUNNING Execution whose sign is pending ends CANCELED with the USER_CANCEL failure stored, and step failed carries no transactionId', async () => {
    const port = recordingNamespaces()
    const { client, events } = await createExecutionClient(port)
    holdSign(port)
    await start(client)
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')

    await cancel(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('CANCELED')
    expect(view?._storage.failure).toEqual(USER_CANCEL)
    expect(view?._storage.finishedAt).toEqual(expect.any(Number))
    expect(failedTransactionOf(events)).toBeNull()
  })

  test('a BLOCKED Execution ends CANCELED the same way, with blocked null and switchChain not called again', async () => {
    const port = switchingNamespaces({ ETH: '0x38' })
    port.wallet.evm.switchChain.mockImplementation(async () => undefined)
    const { client, events } = await createExecutionClient(port)
    await start(client)
    expect((await historyOf(client))?._queue.status).toBe('BLOCKED')
    const switches = port.wallet.evm.switchChain.mock.calls.length

    await cancel(client)
    await advance(POLL_INTERVAL_MS * 2)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('CANCELED')
    expect(view?._queue.blocked).toBeNull()
    expect(view?._storage.failure).toEqual(USER_CANCEL)
    expect(view?._storage.finishedAt).toEqual(expect.any(Number))
    expect(port.wallet.evm.switchChain).toHaveBeenCalledTimes(switches)
    expect(port.wallet.evm.sign).not.toHaveBeenCalled()
    expect(failedTransactionOf(events)).toBeNull()
  })

  test('reports USER_CANCEL with the step the swap was at and the cancel sentence as the reason', async () => {
    const port = recordingNamespaces()
    const { client } = await createExecutionClient(port)
    port.wallet.evm.sign.mockResolvedValueOnce({ hash: '0xhash1' })
    holdSign(port)
    await start(client, [swap(), swap({ from: BSC_ASSET, to: BSC_ASSET })])
    expect((await historyOf(client))?._storage.finishedSwapSteps).toBe(1)

    await cancel(client)

    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 2,
      eventType: 'USER_CANCEL',
      reason: 'Swap canceled by user.',
      tags: { wallet: 'trust' },
    })
    expect((await historyOf(client))?._storage.failure).toEqual(USER_CANCEL)
  })

  test('a reportFailure that rejects changes nothing and raises no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      httpClient.reportFailure.mockRejectedValue(new Error('report failed'))
      const port = recordingNamespaces()
      const { client, events } = await createExecutionClient(port)
      holdSign(port)
      await start(client)

      await cancel(client)

      const view = await historyOf(client)
      expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
      expect(view?._queue.status).toBe('CANCELED')
      expect(view?._storage.failure).toEqual(USER_CANCEL)
      expect(events.map(nameOf).slice(-FAILED_TAIL)).toEqual([
        'step1:failed',
        'route:failed',
      ])
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  test('emits step failed then route failed after the cancel, each with the view, and a change showing the failure', async () => {
    const port = recordingNamespaces()
    const { client, events } = await createExecutionClient(port)
    holdSign(port)
    await start(client)
    const before = events.length

    await cancel(client)

    const after = events.slice(before)
    const names = after.map(nameOf)
    expect(names.slice(-FAILED_TAIL)).toEqual(['step1:failed', 'route:failed'])
    expect(
      names.slice(0, -FAILED_TAIL).every((name) => name === 'changed'),
    ).toBe(true)
    expect(
      after.some(
        (event) =>
          nameOf(event) === 'changed' &&
          viewOf(event)._storage.failure?.reasonCode === 'USER_CANCEL',
      ),
    ).toBe(true)
    for (const event of after.slice(-FAILED_TAIL)) {
      expect(viewOf(event)._queue.status).toBe('CANCELED')
      expect(viewOf(event)._storage.failure).toEqual(USER_CANCEL)
    }
  })

  test('a sign that resolves after the cancel stores no hash, and nothing is waited on or polled', async () => {
    const port = waitingNamespaces()
    const { client, events } = await createExecutionClient(port)
    const held = holdSign(port)
    await start(client)
    await cancel(client)

    held.resolve({ hash: '0xlate' })
    await settle()
    await advance(POLL_INTERVAL_MS * 2)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('CANCELED')
    expect(view?._storage.transactions.s1?.execution).toEqual({
      status: 'sign_requested',
      result: { walletResult: null, checkResult: null },
    })
    expect(httpClient.checkStatus).not.toHaveBeenCalled()
    expect(port.wallet.evm.wait).not.toHaveBeenCalled()
    expect(events.map(nameOf)).not.toContain('route:succeeded')
  })

  test('a cancel while switchChain is pending emits no further switch_network, with no second switch', async () => {
    const chainIds: Record<string, string | null> = { ETH: '0x38' }
    const port = switchingNamespaces(chainIds)
    const { client, events } = await createExecutionClient(port)
    const pending = Promise.withResolvers<void>()
    port.wallet.evm.switchChain.mockImplementationOnce(
      async () => pending.promise,
    )
    await start(client)
    expect(port.wallet.evm.switchChain).toHaveBeenCalledTimes(1)
    const switches = () =>
      events.filter((event) => nameOf(event) === 'step1:switch_network')
    expect(switches()).toHaveLength(1)

    await cancel(client)
    pending.resolve()
    await settle()
    await advance(POLL_INTERVAL_MS * 2)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('CANCELED')
    expect(switches()).toHaveLength(1)
    expect(port.wallet.evm.switchChain).toHaveBeenCalledTimes(1)
    expect(port.wallet.evm.sign).not.toHaveBeenCalled()
  })

  test('a Hyperliquid action signed after the cancel is never posted', async () => {
    const hyperliquid = stubHyperliquid()
    httpClient.createTransaction.mockResolvedValue(
      createTxResponse(hyperliquidTx()),
    )
    const port = typedSigningNamespaces(
      waitingNamespaces({ HYPERLIQUID: SIGNATURE_CHAIN_ID }),
    )
    const held = Promise.withResolvers<string>()
    port.wallet.hyperliquid.signTypedData.mockImplementationOnce(
      async () => held.promise,
    )
    const { client } = await createExecutionClient(port, [
      ...evmBlockchains,
      chain('HYPERLIQUID', ['^(0x)[0-9A-Fa-f]{40}$']),
    ])
    await start(client)
    await cancel(client)

    held.resolve(signatureWith('1b'))
    await settle()
    await advance(POLL_INTERVAL_MS * 2)

    expect((await historyOf(client))?._queue.status).toBe('CANCELED')
    expect(hyperliquid.posts).toEqual([])
    expect(httpClient.checkStatus).not.toHaveBeenCalled()
  })

  // Runs `request-1` to the given end, through a `sign` that rejects for FAILED or a first cancel for CANCELED.
  async function endAs(
    client: Sdk.RangoClient,
    port: ReturnType<typeof recordingNamespaces>,
    status: 'SUCCESS' | 'FAILED' | 'CANCELED',
  ): Promise<void> {
    if (status === 'FAILED') {
      port.wallet.evm.sign.mockRejectedValueOnce(new Error('wallet exploded'))
    }
    if (status === 'CANCELED') {
      holdSign(port)
    }
    await start(client)
    if (status === 'CANCELED') {
      await cancel(client)
    }
    expect((await historyOf(client))?._queue.status).toBe(status)
  }

  test.each(ENDED_QUEUE_STATUSES)(
    'on an Execution that ended %s it writes, reports and emits nothing',
    async (status) => {
      const port = recordingNamespaces()
      const { client, events } = await createExecutionClient(port)
      await endAs(client, port, status)
      const before = await historyOf(client)
      const eventCount = events.length
      httpClient.reportFailure.mockClear()

      await cancel(client)

      expect(await historyOf(client)).toEqual(before)
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
      expect(events).toHaveLength(eventCount)
    },
  )

  test('on an unknown ID it resolves, reporting and emitting nothing', async () => {
    const { client, events } = await createExecutionClient()

    await expect(client.cancel('unknown')).resolves.toBeUndefined()
    await settle()

    expect(await client.history.get('unknown')).toBeUndefined()
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  test('a PENDING Execution ends CANCELED the same way: one USER_CANCEL write, a report, then step failed and route failed', async () => {
    await storePendingExecution()
    stubWindow()
    const { client, events } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { pauseOnStart: true },
    )
    expect((await historyOf(client))?._queue.status).toBe('PENDING')
    const before = events.length

    await cancel(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('CANCELED')
    expect(view?._storage.failure).toEqual(USER_CANCEL)
    expect(view?._storage.finishedAt).toEqual(expect.any(Number))
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      eventType: 'USER_CANCEL',
      reason: 'Swap canceled by user.',
      // No Transaction entry is stored yet, so the step has no wallet to tag.
      tags: undefined,
    })
    const after = events.slice(before)
    const names = after.map(nameOf)
    expect(names.slice(-FAILED_TAIL)).toEqual(['step1:failed', 'route:failed'])
    expect(
      names.slice(0, -FAILED_TAIL).every((name) => name === 'changed'),
    ).toBe(true)
    expect(
      after.filter(
        (event) =>
          nameOf(event) === 'changed' &&
          viewOf(event)._storage.failure?.reasonCode === 'USER_CANCEL',
      ),
    ).toHaveLength(1)
    for (const event of after.slice(-FAILED_TAIL)) {
      expect(viewOf(event)._queue.status).toBe('CANCELED')
      expect(viewOf(event)._storage.failure).toEqual(USER_CANCEL)
    }
    expect(failedTransactionOf(events)).toBeNull()
  })

  test('execute() after a cancel changes nothing', async () => {
    const port = recordingNamespaces()
    const { client, events } = await createExecutionClient(port)
    holdSign(port)
    await start(client)
    await cancel(client)
    const before = await historyOf(client)
    const eventCount = events.length
    const signs = port.wallet.evm.sign.mock.calls.length

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()
    await advance(POLL_INTERVAL_MS * 2)

    expect(await historyOf(client)).toEqual(before)
    expect(events).toHaveLength(eventCount)
    expect(port.wallet.evm.sign).toHaveBeenCalledTimes(signs)
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
  })
})
