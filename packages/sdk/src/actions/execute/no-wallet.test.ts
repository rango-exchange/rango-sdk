// A client built with no wallet: every missing wallet is a NOT_CONNECTED Block, never an error, over fake-indexeddb.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  approvingNamespaces,
  callOf,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmApprove,
  evmBlockchains,
  evmTx,
  EXECUTION_OPTIONS,
  hang,
  historyOf,
  httpClient,
  loadSdk,
  nameOf,
  recordingEmitter,
  recordingNamespaces,
  reloadOn,
  scriptCreateTransaction,
  settle,
  succeeded,
  UNLIMITED,
  waitingNamespaces,
} from '../../../tests/support.js'

const ALLOWANCE_READ_INTERVAL_MS = 3_000
const NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'ETH', address: '0xfrom' },
}
const NOT_CONNECTED_EVENT = 'step1:waiting_for_wallet_connect'

let factory = new IDBFactory()

// The `httpClient` answers every test starts with: each Step's transaction, a status check that succeeds, a report.
function scriptLegacy(): void {
  scriptCreateTransaction()
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

/*
 * A client whose `execution` has a recording emitter and a `beforeResume` that sets the context's wallet to `wallet()`
 * on every run, and no `wallet` of its own. `wallet()` answers `undefined` until the test connects one.
 */
async function walletlessClient(
  wallet: () => Sdk.WalletPort | undefined = () => undefined,
) {
  const { RangoClient } = await loadSdk()
  httpClient.getBlockchains.mockResolvedValue([...evmBlockchains])
  const { emitter, events } = recordingEmitter()
  const beforeResume = vi.fn<Sdk.BeforeResume>((context, setContext) => {
    setContext({ ...context, wallet: wallet() })
  })
  const client = new RangoClient({
    apiKey: 'test-key',
    execution: { emitter, beforeResume },
  })
  return { client, events, beforeResume }
}

// Confirms a one-Step Route and executes it, with every pending step run.
async function start(client: Sdk.RangoClient): Promise<void> {
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
}

describe('with no wallet', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    scriptLegacy()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('execute() stores the Execution and blocks NOT_CONNECTED at its first entry, emitting waiting_for_wallet_connect, with nothing failed', async () => {
    const { client, events } = await walletlessClient()

    await start(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
    expect(view?._storage.failure).toBeNull()
    expect(view?._storage.transactions.s1?.execution.status).toBe('not_started')
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
    expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)
    expect(
      events.find((event) => nameOf(event) === NOT_CONNECTED_EVENT),
    ).toEqual([
      'stepEvent',
      {
        event: {
          type: 'tx_execution_blocked',
          status: 'waiting_for_wallet_connect',
        },
        step: 1,
        transactionId: 's1',
        view: expect.objectContaining({
          _queue: expect.objectContaining({
            status: 'BLOCKED',
            blocked: NOT_CONNECTED,
          }),
        }),
      },
    ])
  })

  test('a wallet set in beforeResume continues the Blocked Execution on the next execute(), and every port call goes to it', async () => {
    const connection: { wallet?: Sdk.WalletPort } = {}
    const { client, beforeResume } = await walletlessClient(
      () => connection.wallet,
    )
    await start(client)
    expect((await historyOf(client))?._queue.status).toBe('BLOCKED')
    expect(beforeResume.mock.calls[0]?.[0].wallet).toBeUndefined()

    const port = recordingNamespaces()
    connection.wallet = port.wallet
    await client.execute('request-1')
    await settle()

    expect(port.wallet.evm.getAccount).toHaveBeenCalledTimes(1)
    expect(port.requests.map(callOf)).toEqual(['getChainId', 'sign:0xcontract'])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('a stored RUNNING Execution reloaded on a client with no wallet blocks NOT_CONNECTED at its next gated entry', async () => {
    httpClient.createTransaction.mockImplementation(hang)
    const { client } = await createExecutionClient()
    await start(client)
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')

    reloadOn(factory)
    scriptLegacy()
    const { client: loaded, events } = await walletlessClient()
    await loaded.history.getAll()
    await settle()

    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
    expect(view?._storage.failure).toBeNull()
    expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)
  })

  test('a signed EVM approve reloaded with no wallet blocks NOT_CONNECTED, and resumes its proof with no gate once a wallet is set', async () => {
    httpClient.createTransaction.mockResolvedValue(
      createTxResponse(evmTx({ prerequisites: [evmApprove()] })),
    )
    const first = approvingNamespaces(recordingNamespaces())
    first.wallet.evm.getTransactionInfo.mockImplementation(hang)
    const { client } = await createExecutionClient(first)
    await start(client)
    expect(
      (await historyOf(client))?._storage.transactions['s1.p0']?.execution
        .status,
    ).toBe('signed')

    reloadOn(factory)
    scriptLegacy()
    httpClient.createTransaction.mockResolvedValue(
      createTxResponse(evmTx({ prerequisites: [evmApprove()] })),
    )
    const connection: { wallet?: Sdk.WalletPort } = {}
    const { client: loaded, events } = await walletlessClient(
      () => connection.wallet,
    )
    await loaded.history.getAll()
    await settle()

    const blocked = await historyOf(loaded)
    expect(blocked?._queue.status).toBe('BLOCKED')
    expect(blocked?._queue.blocked).toEqual(NOT_CONNECTED)
    expect(blocked?._storage.failure).toBeNull()
    expect(blocked?._storage.transactions['s1.p0']?.execution.status).toBe(
      'signed',
    )
    expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)

    const port = approvingNamespaces(recordingNamespaces(), {
      granted: [UNLIMITED],
    })
    connection.wallet = port.wallet
    await loaded.execute('request-1')
    await settle()
    expect(port.requests.map(callOf)).toEqual(['info:0xhash1', 'read:0xtoken'])
    expect(port.wallet.evm.getAccount).not.toHaveBeenCalled()
    await advance(ALLOWANCE_READ_INTERVAL_MS)

    expect(port.requests.map(callOf)).toEqual([
      'info:0xhash1',
      'read:0xtoken',
      'read:0xtoken',
      'getChainId',
      'sign:0xcontract',
    ])
    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
      'completed',
    )
  })

  test('a signed EVM main entry reloaded with no wallet skips wait and is polled to SUCCESS', async () => {
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus.mockImplementation(hang)
    const first = waitingNamespaces()
    first.wallet.evm.wait.mockImplementation(hang)
    const { client } = await createExecutionClient(first)
    await start(client)
    expect(
      (await historyOf(client))?._storage.transactions.s1?.execution.status,
    ).toBe('signed')

    reloadOn(factory)
    scriptLegacy()
    const { client: loaded } = await walletlessClient()
    await loaded.history.getAll()
    await settle()

    expect(httpClient.checkStatus.mock.calls.map(([req]) => req)).toEqual([
      { requestId: 'request-1', step: 1, txId: '0xhash1' },
    ])
    expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
  })
})
