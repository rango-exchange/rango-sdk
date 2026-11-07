// The `beforeResume` hook: called before each run of an Execution, its `setContext` routing that run's port calls, over fake-indexeddb.
import 'fake-indexeddb/auto'

import type { Namespaces } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  callOf,
  confirmQuote,
  createExecutionClient,
  evmBlockchains,
  EXECUTION_OPTIONS,
  hang,
  historyOf,
  httpClient,
  nameOf,
  recordingNamespaces,
  reloadOn,
  scriptCreateTransaction,
  SELECTED_WALLETS,
  settle,
  stubWindow,
  succeeded,
  switchingNamespaces,
} from '../../../tests/support.js'

type Context = Parameters<Sdk.BeforeResume>[0]

let factory = new IDBFactory()

// The `httpClient` answers every test starts with: each Step's transaction, a status check that succeeds, a report.
function scriptLegacy(): void {
  scriptCreateTransaction()
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// Confirms a one-Step Route under this request ID and executes it, with every pending step run.
async function start(
  client: Sdk.RangoClient,
  requestId = 'request-1',
): Promise<void> {
  await confirmQuote(client, requestId)
  await client.execute(requestId, EXECUTION_OPTIONS)
  await settle()
}

// A hook that sets the wallet to this namespace port on every call.
function routingTo(namespaces: Namespaces) {
  return vi.fn<Sdk.BeforeResume>((_, setContext) => {
    setContext({ wallet: namespaces })
  })
}

// Every call the port got, `getAccount` included, which its `requests` leave out.
function callCount(port: ReturnType<typeof recordingNamespaces>): number {
  return port.wallet.evm.getAccount.mock.calls.length + port.requests.length
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

describe('beforeResume', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    scriptLegacy()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('execute() calls it once, before the first port call, with only the wallet and the Execution’s HistoryItem', async () => {
    const port = recordingNamespaces()
    const seen: { context: Context; item: Sdk.HistoryItem; calls: number }[] =
      []
    const beforeResume = vi.fn<Sdk.BeforeResume>((context, _, item) => {
      seen.push({ context, item, calls: callCount(port) })
    })
    const { client } = await createExecutionClient(port, evmBlockchains, {
      beforeResume,
    })

    await start(client)

    expect(beforeResume).toHaveBeenCalledTimes(1)
    expect(seen[0]?.calls).toBe(0)
    expect(seen[0]?.context).toEqual({ wallet: port.wallet })
    expect(seen[0]?.item).toMatchObject({
      _storage: {
        data: { requestId: 'request-1', selectedWallets: SELECTED_WALLETS },
        options: EXECUTION_OPTIONS,
      },
      _queue: { id: 'request-1', status: 'PENDING', blocked: null },
    })
    expect(port.requests.map(callOf)).toEqual(['getChainId', 'sign:0xcontract'])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('a setContext with another wallet sends every port call of that run to it, and none to the config’s', async () => {
    const port = recordingNamespaces()
    const other = recordingNamespaces()
    const { client } = await createExecutionClient(port, evmBlockchains, {
      beforeResume: routingTo(other.wallet),
    })

    await start(client)

    expect(callCount(port)).toBe(0)
    expect(other.wallet.evm.getAccount).toHaveBeenCalledTimes(1)
    expect(other.requests.map(callOf)).toEqual([
      'getChainId',
      'sign:0xcontract',
    ])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('a setContext with only another wallet keeps the rest of the context: the run still fetches, emits and polls', async () => {
    const other = recordingNamespaces()
    const { client, events } = await createExecutionClient(
      recordingNamespaces(),
      evmBlockchains,
      { beforeResume: routingTo(other.wallet) },
    )

    await start(client)

    expect(other.requests.map(callOf)).toEqual([
      'getChainId',
      'sign:0xcontract',
    ])
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    expect(httpClient.checkStatus).toHaveBeenCalled()
    expect(events.map(nameOf)).toEqual(
      expect.arrayContaining(['step1:succeeded', 'route:succeeded']),
    )
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('a setContext({}) leaves the client with no wallet, so the run Blocks NOT_CONNECTED with no port call', async () => {
    const port = recordingNamespaces()
    const beforeResume = vi.fn<Sdk.BeforeResume>((_, setContext) => {
      setContext({})
    })
    const { client } = await createExecutionClient(port, evmBlockchains, {
      beforeResume,
    })

    await start(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toMatchObject({ reason: 'NOT_CONNECTED' })
    expect(callCount(port)).toBe(0)
  })

  test('a later call gets the context the last setContext set', async () => {
    const port = recordingNamespaces()
    const other = recordingNamespaces()
    const wallets: (Sdk.WalletPort | undefined)[] = []
    const beforeResume = vi.fn<Sdk.BeforeResume>((context, setContext) => {
      wallets.push(context.wallet)
      setContext({ wallet: other.wallet })
    })
    const { client } = await createExecutionClient(port, evmBlockchains, {
      beforeResume,
    })

    await start(client, 'request-1')
    await start(client, 'request-2')

    expect(wallets).toEqual([port.wallet, other.wallet])
    expect(beforeResume.mock.calls.map(([, , item]) => item._queue.id)).toEqual(
      ['request-1', 'request-2'],
    )
    expect(callCount(port)).toBe(0)
  })

  test('a second client over the same database calls it for the stored RUNNING Execution it resumes at load', async () => {
    await reloadWithRunning()
    const port = recordingNamespaces()
    const other = recordingNamespaces()
    const beforeResume = routingTo(other.wallet)
    const { client } = await createExecutionClient(port, evmBlockchains, {
      beforeResume,
    })

    await client.history.getAll()
    await settle()

    // Core's resume of a task stored RUNNING sets the queue back to PENDING and runs it again, calling the hook again.
    expect(beforeResume).toHaveBeenCalled()
    expect(beforeResume.mock.calls[0]?.[2]).toMatchObject({
      _storage: {
        data: { requestId: 'request-1' },
        options: EXECUTION_OPTIONS,
      },
      _queue: { id: 'request-1', status: 'RUNNING' },
    })
    expect(callCount(port)).toBe(0)
    expect(other.requests.map(callOf)).toEqual([
      'getChainId',
      'sign:0xcontract',
    ])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('with pauseOnStart: true, it isn’t called at load, and is called for the stored RUNNING Execution on resume()', async () => {
    stubWindow()
    await reloadWithRunning()
    const port = recordingNamespaces()
    const beforeResume = vi.fn<Sdk.BeforeResume>()
    const { client } = await createExecutionClient(port, evmBlockchains, {
      pauseOnStart: true,
      beforeResume,
    })

    await client.history.getAll()
    await settle()
    expect(beforeResume).not.toHaveBeenCalled()

    await client.resume()
    await settle()

    expect(beforeResume).toHaveBeenCalled()
    expect(beforeResume.mock.calls[0]?.[2]._queue).toMatchObject({
      id: 'request-1',
      status: 'RUNNING',
    })
    expect(port.requests.map(callOf)).toEqual(['getChainId', 'sign:0xcontract'])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('execute() on a BLOCKED Execution calls it before the gate runs again, and its setContext routes the unblocked run', async () => {
    // The config's wallet stays on BSC: the run it starts blocks NETWORK_MISMATCH.
    const port = switchingNamespaces({ ETH: '0x38' })
    port.wallet.evm.switchChain.mockImplementation(async () => undefined)
    const other = recordingNamespaces()
    const beforeResume = vi.fn<Sdk.BeforeResume>()
    const { client } = await createExecutionClient(port, evmBlockchains, {
      beforeResume,
    })
    await start(client)
    expect((await historyOf(client))?._queue.status).toBe('BLOCKED')
    expect(beforeResume).toHaveBeenCalledTimes(1)
    const portCalls = callCount(port)
    let otherCalls: number | undefined
    beforeResume.mockImplementation((_, setContext) => {
      otherCalls = callCount(other)
      setContext({ wallet: other.wallet })
    })

    await client.execute('request-1')
    await settle()

    expect(beforeResume).toHaveBeenCalledTimes(2)
    expect(beforeResume.mock.calls[1]?.[2]._queue.id).toBe('request-1')
    expect(otherCalls).toBe(0)
    expect(callCount(port)).toBe(portCalls)
    expect(other.wallet.evm.getAccount).toHaveBeenCalledTimes(1)
    expect(other.requests.map(callOf)).toEqual([
      'getChainId',
      'sign:0xcontract',
    ])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })
})
