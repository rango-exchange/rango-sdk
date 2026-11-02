// Reload and resume: a second client built on the same fake-indexeddb database picks up a RUNNING Execution, with the timers faked.
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
  done,
  EXECUTION_OPTIONS,
  expectNotReported,
  hang,
  historyOf,
  httpClient,
  isObject,
  nameOf,
  onEthAndBsc,
  openQueues,
  recordingNamespaces,
  reloadOn,
  resumeExecutions,
  scriptCreateTransaction,
  settle,
  succeeded,
  swap,
  switchingNamespaces,
  viewOf,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
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

// The one queue record stored in this database, as core persisted it.
async function storedQueue(on: IDBFactory): Promise<Record<string, unknown>> {
  const db = await openQueues(on)
  const records: unknown[] = await done(
    db.transaction('queues').objectStore('queues').getAll(),
  )
  db.close()
  const [record] = records
  if (records.length !== 1 || !isObject(record)) {
    throw new Error('Expected one stored queue')
  }
  return record
}

// The stored tasks of a queue record.
function tasksOf(record: Record<string, unknown>): Record<string, unknown>[] {
  const { tasks } = record
  if (!Array.isArray(tasks)) {
    throw new Error('No stored tasks')
  }
  return tasks.filter(isObject)
}

// The payloads of the stored SDK_EXECUTE_TRANSACTION tasks, in queue order.
function executePayloadsOf(record: Record<string, unknown>): unknown[] {
  return tasksOf(record)
    .filter(({ action }) => action === 'SDK_EXECUTE_TRANSACTION')
    .map(({ payload }) => payload)
}

/*
 * Rewinds the stored queue to its first task with this action and payload, as a page closed after that task stored
 * its work but before core marked it finished would leave it: that task RUNNING and every later one PENDING.
 */
async function rewindTo(
  on: IDBFactory,
  action: string,
  payload: unknown,
): Promise<void> {
  const record = await storedQueue(on)
  const tasks = tasksOf(record)
  const index = tasks.findIndex(
    (task) =>
      task.action === action &&
      JSON.stringify(task.payload) === JSON.stringify(payload),
  )
  const { state } = record
  if (index < 0 || !isObject(state) || !isObject(state.tasks)) {
    throw new Error(`No stored ${action} task`)
  }
  const taskStates: Record<string, unknown> = { ...state.tasks }
  tasks.forEach((task, at) => {
    if (at >= index && typeof task.id === 'string') {
      taskStates[task.id] = {
        status: at === index ? 'RUNNING' : 'PENDING',
        blockedFor: null,
      }
    }
  })
  const db = await openQueues(on)
  await done(
    db
      .transaction('queues', 'readwrite')
      .objectStore('queues')
      .put({
        ...record,
        status: 'RUNNING',
        state: {
          ...state,
          status: 'RUNNING',
          activeTaskIndex: index,
          tasks: taskStates,
        },
      }),
  )
  db.close()
}

// A port whose evm wallet on this blockchain hangs on `getChainId`: its entry stays `not_started` at the gate.
function stuckAtGate(blockchain: string) {
  const port = recordingNamespaces()
  const stuck = port.evmOn(blockchain)
  stuck.getChainId.mockImplementation(hang)
  return {
    ...port,
    wallet: {
      ...port.wallet,
      evm: { default: port.wallet.evm, [blockchain]: stuck },
    },
  }
}

describe('after a reload', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    scriptLegacy()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a second client resumes a RUNNING two-Step Route to SUCCESS with no execute(), its stored step 2 not fetched again', async () => {
    const { client } = await createExecutionClient(stuckAtGate('BSC'))
    await start(client, TWO_STEPS)
    const before = await historyOf(client)
    expect(before?._queue.status).toBe('RUNNING')
    expect(before?._storage.finishedSwapSteps).toBe(1)
    const stored = await storedQueue(factory)
    expect(executePayloadsOf(stored)).toEqual([
      { transactionId: 's1' },
      { transactionId: 's2' },
    ])

    reloadOn(factory)
    scriptLegacy()
    const {
      client: loaded,
      requests,
      bsc,
    } = await resumeExecutions(onEthAndBsc(recordingNamespaces()))

    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect(requests.map(callOf)).toEqual(['getChainId', 'sign:0xcontract'])
    // Step 2's route is on BSC: its calls go to the `evm` map's BSC wallet.
    expect(bsc.getChainId).toHaveBeenCalledTimes(1)
    expect(bsc.sign).toHaveBeenCalledWith({
      tx: expect.objectContaining({ blockChain: 'BSC', data: '0xdata2' }),
    })
    expect(httpClient.checkStatus.mock.calls.map(([req]) => req)).toEqual([
      { requestId: 'request-1', step: 2, txId: '0xhash1' },
    ])
    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.finishedSwapSteps).toBe(2)
    // The resumed task got its `{ transactionId }` back unchanged, and the queue kept every stored task.
    const after = await storedQueue(factory)
    expect(tasksOf(after).slice(0, tasksOf(stored).length)).toEqual(
      tasksOf(stored),
    )
    expect(executePayloadsOf(after)).toEqual(executePayloadsOf(stored))
  })

  test('a finished step is not counted again, and a step whose entries are stored is not fetched again', async () => {
    const { client } = await createExecutionClient(stuckAtGate('BSC'))
    await start(client, TWO_STEPS)
    // As if the page closed in step 1's SDK_STEP_FINISHED after its count was stored: it and step 2's fetch run again.
    await rewindTo(factory, 'SDK_STEP_FINISHED', { step: 1 })

    reloadOn(factory)
    scriptLegacy()
    const {
      client: loaded,
      requests,
      events,
    } = await resumeExecutions(onEthAndBsc(recordingNamespaces()))

    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect(requests.map(callOf)).toEqual(['getChainId', 'sign:0xcontract'])
    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.finishedSwapSteps).toBe(2)
    expect(events.map(nameOf).filter((name) => name !== 'changed')).toEqual([
      'step2:send_tx',
      'step2:tx_sent',
      'step2:check_status',
      'step2:output_revealed',
      'step2:succeeded',
      'route:succeeded',
    ])
  })

  test('a swap stopped after its last step stored finishedAt emits routeEvent succeeded once on the new page', async () => {
    const { client, events: before } = await createExecutionClient(
      recordingNamespaces(),
    )
    await start(client)
    const finished = await historyOf(client)
    expect(finished?._queue.status).toBe('SUCCESS')
    // As if the page closed in the last SDK_STEP_FINISHED after it stored `finishedAt`, before core marked it finished.
    await rewindTo(factory, 'SDK_STEP_FINISHED', { step: 1 })
    const { finishedAt } = finished?._storage ?? {}
    expect(finishedAt).toEqual(expect.any(Number))
    expect(
      before.map(nameOf).filter((name) => name === 'route:succeeded'),
    ).toHaveLength(1)

    reloadOn(factory)
    scriptLegacy()
    const { client: loaded, events, requests } = await resumeExecutions()

    expect(requests).toEqual([])
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    expect(httpClient.checkStatus).not.toHaveBeenCalled()
    const ends = events.filter((event) => nameOf(event) === 'route:succeeded')
    expect(ends).toHaveLength(1)
    const [end] = ends
    expect(end && viewOf(end)._queue.status).toBe('SUCCESS')
    expect(end && viewOf(end)._storage.finishedAt).toBe(finishedAt)
    expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
  })

  test('a main entry left sign_requested fails TX_EXPIRED, reported, and the wallet is not prompted again', async () => {
    const first = recordingNamespaces()
    first.wallet.evm.sign.mockImplementation(hang)
    const { client } = await createExecutionClient(first)
    await start(client)
    expect(
      (await historyOf(client))?._storage.transactions.s1?.execution.status,
    ).toBe('sign_requested')

    reloadOn(factory)
    scriptLegacy()
    const { client: loaded, wallet, requests } = await resumeExecutions()

    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toMatchObject({
      reasonCode: 'TX_EXPIRED',
      message: 'Transaction is expired. Please try again.',
    })
    expect(httpClient.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, eventType: 'TX_EXPIRED' }),
    )
    expect(wallet.evm.sign).not.toHaveBeenCalled()
    expect(requests).toEqual([])
  })

  test('a signed main entry other than Hyperliquid with no stored hash fails TX_EXPIRED, with nothing signed or polled', async () => {
    const first = recordingNamespaces()
    first.wallet.evm.sign.mockImplementation(hang)
    const { client } = await createExecutionClient(first)
    await start(client)
    // As if the stored `signed` write lost its hash: the entry is `signed` with `walletResult: null`.
    const record = await storedQueue(factory)
    const { storage } = record
    if (!isObject(storage) || !isObject(storage.transactions)) {
      throw new Error('No stored transactions')
    }
    const entry = storage.transactions.s1
    if (!isObject(entry)) {
      throw new Error('No stored s1')
    }
    const db = await openQueues(factory)
    await done(
      db
        .transaction('queues', 'readwrite')
        .objectStore('queues')
        .put({
          ...record,
          storage: {
            ...storage,
            transactions: {
              ...storage.transactions,
              s1: {
                ...entry,
                execution: {
                  status: 'signed',
                  result: { walletResult: null, checkResult: null },
                },
              },
            },
          },
        }),
    )
    db.close()

    reloadOn(factory)
    scriptLegacy()
    const { client: loaded, wallet, requests } = await resumeExecutions()

    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toMatchObject({
      reasonCode: 'TX_EXPIRED',
      message: 'Transaction is expired. Please try again.',
    })
    expect(view?._storage.transactions.s1?.execution.status).toBe('signed')
    expect(wallet.evm.sign).not.toHaveBeenCalled()
    expect(httpClient.checkStatus).not.toHaveBeenCalled()
    expect(requests).toEqual([])
  })

  test('a signed main entry resumes its status poll with no gate, even with the wallet on another chain', async () => {
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus.mockImplementation(hang)
    const { client } = await createExecutionClient(recordingNamespaces())
    await start(client)

    reloadOn(factory)
    scriptLegacy()
    const port = switchingNamespaces({ ETH: '0x38' })
    const { client: loaded, requests } = await resumeExecutions(port)

    expect(requests).toEqual([])
    expect(httpClient.checkStatus).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      txId: '0xhash1',
    })
    expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
  })

  test('a Blockchain list that fails to load at the gate fails the swap CLIENT_UNEXPECTED_BEHAVIOUR with its message, not reported, with no port call and no retry', async () => {
    const { client } = await createExecutionClient(stuckAtGate('ETH'))
    await start(client)

    reloadOn(factory)
    scriptLegacy()
    const port = recordingNamespaces()
    const {
      client: loaded,
      requests,
      events,
    } = await createExecutionClient(port)
    httpClient.getBlockchains.mockReset()
    httpClient.getBlockchains.mockRejectedValue(new Error('meta API down'))
    await loaded.history.getAll()
    await settle()
    await advance(POLL_INTERVAL_MS * 2)

    expect(httpClient.getBlockchains).toHaveBeenCalledTimes(1)
    expect(requests).toEqual([])
    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'The request failed.',
      detail: null,
    })
    expectNotReported(events)
  })

  test('a task that runs again emits its events again', async () => {
    httpClient.createTransaction.mockReset()
    httpClient.createTransaction.mockImplementation(hang)
    const { client, events: before } = await createExecutionClient(
      recordingNamespaces(),
    )
    await start(client)
    const emitted = before.map(nameOf).filter((name) => name !== 'changed')
    expect(emitted).toEqual([
      'route:started',
      'step1:started',
      'step1:create_tx',
    ])

    reloadOn(factory)
    scriptLegacy()
    const { client: loaded, events } = await resumeExecutions()

    expect(
      events
        .map(nameOf)
        .filter((name) => name !== 'changed')
        .slice(0, emitted.length),
    ).toEqual(emitted)
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
  })
})
