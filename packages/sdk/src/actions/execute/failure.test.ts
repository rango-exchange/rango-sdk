// Execution failures driven through the public client, over fake-indexeddb, with the polling timer faked.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import { type SignerError, SignerErrorCode } from 'rango-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  BSC_ASSET,
  cacheQuote,
  chain,
  confirmQuote,
  confirmResponse,
  connectedAccounts,
  createExecutionClient,
  createTxResponse,
  done,
  evmApprove,
  evmBlockchains,
  evmTx,
  EXECUTION_OPTIONS,
  httpClient,
  isObject,
  nameOf,
  openQueues,
  recordingNamespaces,
  resetHttpClient,
  scriptCreateTransaction,
  SELECTED_WALLETS,
  settle,
  signerError,
  succeeded,
  swap,
  switchingNamespaces,
  viewOf,
} from '../../../tests/support.js'

// A transfer of BTC from its own address, which no selected wallet holds.
const BTC_TRANSFER: LegacySdk.Transfer = {
  type: LegacySdk.TransactionType.TRANSFER,
  blockChain: 'BTC',
  prerequisites: [],
  method: 'transfer',
  asset: { blockchain: 'BTC', symbol: 'BTC', address: null, ticker: 'BTC' },
  amount: '100000',
  decimals: 8,
  fromWalletAddress: 'bc1from',
  recipientAddress: 'bc1to',
  memo: null,
  psbt: null,
}

const POLL_INTERVAL_MS = 5_000
const SIGN_FAILED = 'wallet exploded'
// The last `changed`, `stepEvent` `failed` and `routeEvent` `failed`.
const FAILURE_TAIL = 3
// The last `stepEvent` `failed` and `routeEvent` `failed`.
const FAILED_TAIL = 2
const POLLS_AFTER = 4

let factory = new IDBFactory()

// A fresh module graph, `httpClient` mock and default database, as every test starts with.
function freshStart(): void {
  vi.resetModules()
  resetHttpClient()
  factory = new IDBFactory()
  globalThis.indexedDB = factory
  scriptCreateTransaction()
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// A sign rejection Rango is told of: a `SignerError`, stored `CALL_WALLET_FAILED` and reported with `SIGN_FAILED`.
function signFailed(): SignerError {
  return signerError(SignerErrorCode.SIGN_TX_ERROR, SIGN_FAILED)
}

// Runs a one-Step Route whose `sign` rejects with `error`, a plain error by default, and returns what is stored after.
async function runRejectedSign(
  client: Sdk.RangoClient,
  port: ReturnType<typeof recordingNamespaces>,
  error: unknown = new Error(SIGN_FAILED),
): Promise<Sdk.HistoryItem | undefined> {
  port.wallet.evm.sign.mockRejectedValueOnce(error)
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return client.history.get('request-1')
}

function withoutFinishedAt(
  storage: Sdk.ExecutionRecord | undefined,
): Omit<Sdk.ExecutionRecord, 'finishedAt'> | undefined {
  if (storage === undefined) {
    return undefined
  }
  const { finishedAt: _finishedAt, ...rest } = storage
  return rest
}

describe('an Execution failure', () => {
  beforeEach(() => {
    freshStart()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a sign that rejects with a plain error is stored, not thrown, and ends the Execution FAILED', async () => {
    const port = recordingNamespaces()
    const { client } = await createExecutionClient(port)
    port.wallet.evm.sign.mockRejectedValueOnce(new Error(SIGN_FAILED))
    await confirmQuote(client)

    await expect(
      client.execute('request-1', EXECUTION_OPTIONS),
    ).resolves.toBeUndefined()
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage).toMatchObject({
      finishedSwapSteps: 0,
      failure: {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: SIGN_FAILED,
        detail: null,
      },
      finishedAt: expect.any(Number),
      transactions: {
        s1: {
          step: 1,
          execution: {
            status: 'sign_requested',
            result: { walletResult: null, checkResult: null },
          },
        },
      },
    })
    for (const entry of Object.values(view?._storage.transactions ?? {})) {
      expect(entry).not.toHaveProperty('activity')
    }
    // A failed Execution is read again without throwing it.
    await expect(client.history.getAll()).resolves.toHaveLength(1)
  })

  test('reports the failure once, at the step it failed at', async () => {
    const port = recordingNamespaces()
    const { client } = await createExecutionClient(port)
    await runRejectedSign(client, port, signFailed())

    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      eventType: 'CALL_WALLET_FAILED',
      reason: SIGN_FAILED,
      tags: { wallet: SELECTED_WALLETS.ETH.walletId },
    })
  })

  test('a failure at step 2 reports and emits step finishedSwapSteps + 1', async () => {
    const port = recordingNamespaces()
    const { client, events } = await createExecutionClient(port)
    await confirmQuote(client, 'request-1', [
      swap(),
      swap({ from: BSC_ASSET, to: BSC_ASSET }),
    ])
    port.wallet.evm.sign
      .mockResolvedValueOnce({ hash: '0xhash1' })
      .mockRejectedValueOnce(signFailed())

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.finishedSwapSteps).toBe(1)
    expect(view?._storage.transactions.s1?.execution.status).toBe('completed')
    expect(view?._storage.transactions.s2?.execution.status).toBe(
      'sign_requested',
    )
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ step: 2 }),
    )
    expect(events.map(nameOf).slice(-FAILURE_TAIL)).toEqual([
      'changed',
      'step2:failed',
      'route:failed',
    ])
    expect(events.map(nameOf)).not.toContain('route:succeeded')
  })

  test('a signer error is stored by its code, with its detail reported as the reason', async () => {
    const port = recordingNamespaces()
    const { client } = await createExecutionClient(port)
    port.wallet.evm.sign.mockRejectedValueOnce(
      signerError(SignerErrorCode.SIGN_TX_ERROR, 'User said no'),
    )
    await confirmQuote(client)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CALL_WALLET_FAILED',
      message: 'Error signing the transaction',
      detail: 'User said no',
    })
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      eventType: 'CALL_WALLET_FAILED',
      reason: 'User said no',
      tags: { wallet: SELECTED_WALLETS.ETH.walletId },
    })
  })

  test('a reportFailure that rejects changes nothing and raises no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const port = recordingNamespaces()
      const { client } = await createExecutionClient(port)
      const reported = await runRejectedSign(client, port, signFailed())

      freshStart()
      httpClient.reportFailure.mockRejectedValue(new Error('report failed'))
      const failingPort = recordingNamespaces()
      const { client: failing } = await createExecutionClient(failingPort)
      const view = await runRejectedSign(failing, failingPort, signFailed())
      await settle()

      expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
      expect(view?._queue.status).toBe('FAILED')
      expect(withoutFinishedAt(view?._storage)).toEqual(
        withoutFinishedAt(reported?._storage),
      )
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  test('emits step failed then route failed, after the change that shows FAILED', async () => {
    const port = recordingNamespaces()
    const { client, events } = await createExecutionClient(port)
    await runRejectedSign(client, port)

    const tail = events.slice(-FAILURE_TAIL)
    expect(tail.map(nameOf)).toEqual([
      'changed',
      'step1:failed',
      'route:failed',
    ])
    for (const event of tail) {
      expect(viewOf(event)._queue.status).toBe('FAILED')
      expect(viewOf(event)._storage.failure?.reasonCode).toBe(
        'CLIENT_UNEXPECTED_BEHAVIOUR',
      )
    }
    const stepFailed = tail[1]
    expect(stepFailed?.[0] === 'stepEvent' && stepFailed[1].transactionId).toBe(
      's1',
    )
    expect(
      events.filter((event) => nameOf(event).endsWith(':failed')),
    ).toHaveLength(2)
  })

  test('after FAILED, advancing the timers sends no request and calls no port method', async () => {
    const port = recordingNamespaces()
    const { client, events } = await createExecutionClient(port)
    await runRejectedSign(client, port, signFailed())
    const signCalls = port.wallet.evm.sign.mock.calls.length
    const chainIdCalls = port.wallet.evm.getChainId.mock.calls.length
    const createCalls = httpClient.createTransaction.mock.calls.length
    const eventCount = events.length

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * POLLS_AFTER)
    await settle()

    expect(httpClient.checkStatus).not.toHaveBeenCalled()
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(createCalls)
    expect(port.wallet.evm.sign).toHaveBeenCalledTimes(signCalls)
    expect(port.wallet.evm.getChainId).toHaveBeenCalledTimes(chainIdCalls)
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(eventCount)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'FAILED',
    )
  })
})

describe("the failure report's wallet tag", () => {
  beforeEach(() => {
    freshStart()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Confirms a one-Step Route whose `/tx/create` answers this transaction, and executes it.
  async function startWith(
    client: Sdk.RangoClient,
    tx: LegacySdk.Transaction,
    selectedWallets: Sdk.SelectedWallets = SELECTED_WALLETS,
  ): Promise<void> {
    httpClient.createTransaction.mockReset()
    httpClient.createTransaction.mockResolvedValue(createTxResponse(tx))
    httpClient.confirmRoute.mockResolvedValueOnce(confirmResponse('request-1'))
    await cacheQuote(client, { requestId: 'request-1' })
    await client.confirm('request-1', selectedWallets)
    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()
  }

  // The report body for `request-1` with no `reason`, carrying these `tags`.
  function reported(
    eventType: Sdk.ExecutionFailure['reasonCode'],
    tags: { wallet: string } | undefined,
    step = 1,
  ) {
    return { requestId: 'request-1', step, eventType, reason: '', tags }
  }

  // The report body of a `signFailed` rejection at `step`, carrying these `tags`.
  function reportedSignFailed(tags: { wallet: string }, step = 1) {
    return {
      ...reported('CALL_WALLET_FAILED', tags, step),
      reason: SIGN_FAILED,
    }
  }

  test("a failure at a step's main entry reports that entry's Wallet ID", async () => {
    const port = recordingNamespaces()
    const { client } = await createExecutionClient(port)
    await confirmQuote(client, 'request-1', [
      swap(),
      swap({ from: BSC_ASSET, to: BSC_ASSET }),
    ])
    port.wallet.evm.sign
      .mockResolvedValueOnce({ hash: '0xhash1' })
      .mockRejectedValueOnce(signFailed())

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith(
      reportedSignFailed({ wallet: SELECTED_WALLETS.BSC.walletId }, 2),
    )
  })

  test("a TRANSFER's failure reports the Wallet ID of the transaction's own blockchain", async () => {
    const port = recordingNamespaces()
    const { client } = await createExecutionClient(port)
    httpClient.getBlockchains.mockResolvedValue([
      ...evmBlockchains,
      chain('BTC', ['^bc1']),
    ])
    port.wallet.bip122.sign.mockRejectedValueOnce(signFailed())

    await startWith(client, BTC_TRANSFER, {
      ...SELECTED_WALLETS,
      BTC: { address: 'bc1from', walletId: 'xdefi' },
    })

    expect(httpClient.reportFailure).toHaveBeenCalledWith(
      reportedSignFailed({ wallet: 'xdefi' }),
    )
  })

  test('a failure before the step has an entry (FETCH_TX_FAILED) reports no tag', async () => {
    const { client, events } = await createExecutionClient()
    httpClient.createTransaction.mockReset()
    httpClient.createTransaction.mockResolvedValue({
      ok: false,
      error: null,
      transaction: null,
    })
    await confirmQuote(client)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      ...reported('FETCH_TX_FAILED', undefined),
      reason: 'bad response from create tx endpoint',
    })
    expect(events.map(nameOf).slice(-FAILED_TAIL)).toEqual([
      'step1:failed',
      'route:failed',
    ])
  })

  test('an entry on a blockchain with no selected wallet reports no tag, and the failure is still stored and emitted', async () => {
    const port = recordingNamespaces(undefined, {
      ...connectedAccounts(),
      DOGE: ['Dfrom'],
    })
    const { client, events } = await createExecutionClient(port)
    httpClient.getBlockchains.mockResolvedValue([
      ...evmBlockchains,
      chain('DOGE', ['^D']),
    ])
    port.wallet.bip122.sign.mockRejectedValueOnce(signFailed())

    await startWith(client, {
      ...BTC_TRANSFER,
      blockChain: 'DOGE',
      fromWalletAddress: 'Dfrom',
    })

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CALL_WALLET_FAILED',
      message: 'Error signing the transaction',
      detail: SIGN_FAILED,
    })
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      ...reported('CALL_WALLET_FAILED', undefined),
      reason: SIGN_FAILED,
    })
    expect(events.map(nameOf).slice(-FAILURE_TAIL)).toEqual([
      'changed',
      'step1:failed',
      'route:failed',
    ])
  })

  describe('a cancel of a step blocked on its Prerequisite', () => {
    // A main entry on BSC behind an ETH approve, blocked on the approve with the wallet on the wrong chain.
    async function blockOnApprove() {
      const port = switchingNamespaces({ ETH: '0x38', BSC: '0x38' })
      port.wallet.evm.switchChain.mockImplementation(async () => undefined)
      const execution = await createExecutionClient(port)
      await startWith(
        execution.client,
        evmTx({
          blockChain: 'BSC',
          from: '0xto',
          prerequisites: [evmApprove()],
        }),
      )
      const view = await execution.client.history.get('request-1')
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked?.metadata.blockchain).toBe('ETH')
      return execution
    }

    test("reports the main entry's Wallet ID while the step has one", async () => {
      const { client } = await blockOnApprove()

      await client.cancel('request-1')
      await settle()

      expect(httpClient.reportFailure).toHaveBeenCalledWith({
        ...reported('USER_CANCEL', { wallet: SELECTED_WALLETS.BSC.walletId }),
        reason: 'Swap canceled by user.',
      })
    })

    test("reports the Prerequisite's Wallet ID when only the Prerequisite is stored", async () => {
      await blockOnApprove()
      const source = await openQueues(factory)
      const records: unknown[] = await done(
        source.transaction('queues').objectStore('queues').getAll(),
      )
      source.close()
      const [record] = records
      if (
        !isObject(record) ||
        !isObject(record.storage) ||
        !isObject(record.storage.transactions)
      ) {
        throw new Error('No stored queue')
      }
      // As a stored record with no main entry for the step would be.
      const { s1: _main, ...prerequisites } = record.storage.transactions
      expect(Object.keys(prerequisites)).toEqual(['s1.p0'])
      freshStart()
      const target = await openQueues(factory)
      await done(
        target
          .transaction('queues', 'readwrite')
          .objectStore('queues')
          .put({
            ...record,
            storage: { ...record.storage, transactions: prerequisites },
          }),
      )
      target.close()

      const { client, events } = await createExecutionClient()
      await client.cancel('request-1')
      await settle()

      expect((await client.history.get('request-1'))?._queue.status).toBe(
        'CANCELED',
      )
      expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
      expect(httpClient.reportFailure).toHaveBeenCalledWith({
        ...reported('USER_CANCEL', { wallet: SELECTED_WALLETS.ETH.walletId }),
        reason: 'Swap canceled by user.',
      })
      expect(events.map(nameOf).slice(-FAILED_TAIL)).toEqual([
        'step1:failed',
        'route:failed',
      ])
    })
  })
})
