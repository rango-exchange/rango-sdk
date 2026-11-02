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
  evmBlockchains,
  EXECUTION_OPTIONS,
  historyOf,
  httpClient,
  nameOf,
  type NamespacePort,
  onEthAndBsc,
  recordingNamespaces,
  reloadOn,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  succeeded,
  swap,
  switchingNamespaces,
  viewOf,
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

// A client whose emitter scribbles on every `changed` and `stepEvent` view, after recording a copy of it.
async function createScribblingClient(port: NamespacePort) {
  const seen: Sdk.HistoryItem[] = []
  const sinks: {
    [K in keyof Sdk.ExecutionEvents]: (event: Sdk.ExecutionEvents[K]) => void
  } = {
    routeEvent: () => undefined,
    stepEvent: (event) => {
      seen.push(structuredClone(event.view))
      scribble(event.view)
    },
    changed: (event) => {
      seen.push(structuredClone(event))
      scribble(event)
    },
    loaded: () => undefined,
  }
  const emitter: Sdk.Emitter<Sdk.ExecutionEvents> = {
    emit(type, event) {
      sinks[type](event)
    },
  }
  const { client } = await createExecutionClient(port, evmBlockchains, {
    emitter,
  })
  return { client, seen }
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

  test('changing the blocked reason of a BLOCKED view leaves the next history.get() unchanged', async () => {
    const port = switchingNamespaces({ ETH: '0x38' })
    port.wallet.evm.switchChain.mockImplementation(async () => undefined)
    const { client } = await createExecutionClient(port)
    await start(client)
    const before = await historyOf(client)
    const kept = structuredClone(before)
    expect(before?._queue.status).toBe('BLOCKED')

    if (before?._queue.blocked == null) {
      throw new Error('the view is not blocked')
    }
    before._queue.blocked.metadata.address = 'changed'
    before._queue.blocked.metadata.blockchain = 'changed'

    expect(await historyOf(client)).toEqual(kept)
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

  test('changing the view in a changed or stepEvent handler changes neither the stored record nor what the swap does next', async () => {
    const port = onEthAndBsc(recordingNamespaces())
    const { client, seen } = await createScribblingClient(port)

    await start(client, TWO_STEPS)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.data.requestId).toBe('request-1')
    expect(view?._storage.options).toEqual(EXECUTION_OPTIONS)
    expect(Object.keys(view?._storage.transactions ?? {})).toEqual(['s1', 's2'])
    expect(view?._storage.finishedSwapSteps).toBe(TWO_STEPS.length)
    expect(view?._storage.failure).toBeNull()
    expect(view?._storage.finishedAt).toEqual(expect.any(Number))
    expect(port.eth.sign).toHaveBeenCalledTimes(1)
    expect(port.bsc.sign).toHaveBeenCalledTimes(1)
    for (const [, request] of port.requests) {
      expect(request).not.toHaveProperty('walletId')
    }
    // Each handler got the stored view, not one an earlier handler changed.
    for (const received of seen) {
      expect(received._storage.data.requestId).toBe('request-1')
      expect(received._storage.failure).toBeNull()
    }
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

  test('_queue.blocked holds the reason while BLOCKED, and is null once the Execution runs again after an unblock', async () => {
    const chainIds: Record<string, string | null> = { ETH: '0x38' }
    const port = switchingNamespaces(chainIds)
    port.wallet.evm.switchChain.mockImplementation(async () => undefined)
    const { client, events } = await createExecutionClient(port)
    await start(client)

    expect((await historyOf(client))?._queue).toMatchObject({
      status: 'BLOCKED',
      blocked: {
        reason: 'NETWORK_MISMATCH',
        metadata: {
          blockchain: 'ETH',
          address: '0xfrom',
          requiredChainId: '0x1',
        },
      },
    })

    const mark = events.length
    chainIds.ETH = '0x1'
    await client.execute('request-1')
    await settle()

    const after = events.slice(mark).map(viewOf)
    expect(after.map(({ _queue }) => _queue.status)).toContain('RUNNING')
    expect(after.map(({ _queue }) => _queue.blocked)).toEqual(
      after.map(() => null),
    )
    expect((await historyOf(client))?._queue).toMatchObject({
      status: 'SUCCESS',
      blocked: null,
    })
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

  test('the events carry the HistoryItem history.get() returns at that point', async () => {
    const chainIds: Record<string, string | null> = { ETH: '0x38' }
    const port = switchingNamespaces(chainIds)
    port.wallet.evm.switchChain.mockImplementation(async () => undefined)
    const { client, events } = await createExecutionClient(port)
    await start(client)

    // Blocked: the last event is the block's stepEvent.
    const blocked = await historyOf(client)
    expect(events.map(nameOf).at(-1)).toBe('step1:waiting_for_network_change')
    expect(events.map(viewOf).at(-1)).toEqual(blocked)

    chainIds.ETH = '0x1'
    await client.execute('request-1')
    await settle()

    // Ended: the last event is the route's `succeeded`, after the last `changed`.
    const ended = await historyOf(client)
    expect(ended?._queue.status).toBe('SUCCESS')
    expect(events.map(nameOf).at(-1)).toBe('route:succeeded')
    expect(events.map(viewOf).at(-1)).toEqual(ended)
    expect(
      events
        .filter(([type]) => type === 'changed')
        .map(viewOf)
        .at(-1),
    ).toEqual(ended)
  })
})
