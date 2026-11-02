/*
 * `HistoryItem`: `_queue` holds the queue's state and `_storage` a copy of the record, so changing an item from
 * `history` or an event leaves the stored Execution and the swap as they are.
 */
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  BSC_ASSET,
  confirmQuote,
  createExecutionClient,
  EXECUTION_OPTIONS,
  historyOf,
  httpClient,
  reloadOn,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  succeeded,
  swap,
} from '../../../tests/support.js'

const TWO_STEPS = [swap(), swap({ from: BSC_ASSET, to: BSC_ASSET })]

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

// Changes every part of an item: each field of its queue state and of its record.
function scribble(view: Sdk.HistoryItem): void {
  view._queue.id = 'changed'
  view._queue.createdAt = 0
  view._queue.status = 'FAILED'
  view._queue.blocked = null
  view._storage.data.requestId = 'changed'
  view._storage.options.transactionOptions.slippage = '50'
  view._storage.data.selectedWallets.ETH.walletId = 'changed'
  view._storage.transactions = {}
  view._storage.finishedSwapSteps = 0
  view._storage.failure = {
    reasonCode: 'USER_CANCEL',
    message: 'changed',
    detail: null,
  }
  view._storage.finishedAt = 0
}

describe('HistoryItem', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('changing a view from history.get() leaves the next history.get() unchanged', async () => {
    const { client } = await createExecutionClient()
    await start(client, TWO_STEPS)
    const before = await historyOf(client)
    const kept = structuredClone(before)

    if (before === undefined) {
      throw new Error('history.get() returned no view')
    }
    scribble(before)

    expect(await historyOf(client)).toEqual(kept)
  })

  test('changing a view from history.getAll() leaves the next history.getAll() unchanged', async () => {
    const { client } = await createExecutionClient()
    await start(client)
    const [before] = await client.history.getAll()
    const kept = structuredClone(before)

    if (before === undefined) {
      throw new Error('history.getAll() returned no view')
    }
    scribble(before)

    expect(await client.history.getAll()).toEqual([kept])
  })

  test('two reads return equal but distinct objects', async () => {
    const { client } = await createExecutionClient()
    await start(client)

    const first = await historyOf(client)
    const second = await historyOf(client)
    const [fromAll] = await client.history.getAll()

    expect(second).toEqual(first)
    expect(fromAll).toEqual(first)
    expect(second).not.toBe(first)
    expect(second?._storage).not.toBe(first?._storage)
    expect(second?._storage.transactions).not.toBe(first?._storage.transactions)
    expect(fromAll?._storage).not.toBe(first?._storage)
  })

  test('_queue holds the request ID as id, and when the Execution was stored as createdAt', async () => {
    const { client } = await createExecutionClient()
    await confirmQuote(client, 'request-1')
    const before = Date.now()
    await client.execute('request-1', EXECUTION_OPTIONS)
    const after = Date.now()
    await settle()

    const item = await historyOf(client)
    expect(item?._queue.id).toBe('request-1')
    expect(item?._queue.createdAt).toBeGreaterThanOrEqual(before)
    expect(item?._queue.createdAt).toBeLessThanOrEqual(after)
  })

  test('history.getAll() returns one HistoryItem per loaded Execution, each equal to its history.get()', async () => {
    const { client } = await createExecutionClient()
    await start(client)
    await confirmQuote(client, 'request-2')
    await client.execute('request-2', EXECUTION_OPTIONS)
    await settle()

    const items = await client.history.getAll()
    expect(items.map(({ _queue }) => _queue.id).sort()).toEqual([
      'request-1',
      'request-2',
    ])
    for (const item of items) {
      expect(item).toEqual(await client.history.get(item._queue.id))
    }

    // A client built again on the same database loads both.
    reloadOn(factory)
    const { client: loaded } = await createExecutionClient()
    const byId = (left: Sdk.HistoryItem, right: Sdk.HistoryItem) =>
      left._queue.id.localeCompare(right._queue.id)
    expect((await loaded.history.getAll()).sort(byId)).toEqual(items.sort(byId))
  })
})
