// `/tx/create` failures and refused transactions, driven through the public client over fake-indexeddb.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  BAD_REQUEST,
  BSC_ASSET,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmTx,
  EXECUTION_OPTIONS,
  httpClient,
  httpError,
  nameOf,
  recordingNamespaces,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  succeeded,
  swap,
} from '../../../tests/support.js'

const CREATE_TX_FAILED_MESSAGE = 'Create transaction failed in Rango Server'
// `stepEvent` `failed` and `routeEvent` `failed`.
const FAILURE_TAIL = 2

// Plain transactions the server could send: the `httpClient` mock is untyped, so they need no cast.
const base = { blockChain: 'ETH', prerequisites: [] }

function cosmosTx() {
  return { ...base, type: 'COSMOS', fromWalletAddress: '0xfrom' }
}

function xrplTx(transactionType: string) {
  return {
    ...base,
    type: 'XRPL',
    data: { TransactionType: transactionType },
  }
}

function hyperliquidTx(action: string, message: string) {
  return {
    ...base,
    type: 'HYPERLIQUID',
    action: { type: action },
    message,
  }
}

// Each refused transaction with what is stored for it.
const REFUSALS: {
  name: string
  tx: unknown
  reasonCode: Sdk.ExecutionFailure['reasonCode']
  message: string
}[] = [
  {
    name: 'a Cosmos transaction',
    tx: cosmosTx(),
    reasonCode: 'FETCH_TX_FAILED',
    message: 'Cosmos transactions are no longer supported.',
  },
  {
    name: 'a type that is not a TransactionType',
    tx: { ...base, type: 'FOO' },
    reasonCode: 'FETCH_TX_FAILED',
    message: 'FOO was unhandled!',
  },
  {
    name: 'a legacy approval transaction',
    tx: evmTx({ isApprovalTx: true }),
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message:
      'Unexpected Error: Legacy approval transactions are not supported.',
  },
  {
    name: 'a non-Payment XRPL transaction',
    tx: xrplTx('TrustSet'),
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message:
      'Unexpected Error: Only XRPL transactions with payment type are supported',
  },
  {
    name: 'an unsupported Hyperliquid action',
    tx: hyperliquidTx('spotSend', 'a message'),
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message: 'Unexpected Error: Transaction action is not supported.',
  },
  {
    name: 'a Hyperliquid transaction with an empty message',
    tx: hyperliquidTx('usdSend', ''),
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message: 'Unexpected Error: Transaction message does not exist.',
  },
  {
    name: 'an unknown Prerequisite type',
    tx: {
      ...evmTx(),
      prerequisites: [
        {
          type: 'SOLANA_APPROVE',
          blockchain: 'ETH',
          address: '0xtoken',
          spender: '0xspender',
          amount: '1',
        },
      ],
    },
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message: 'Unexpected Error: unknown prerequisite type!',
  },
]

let factory = new IDBFactory()

function freshStart(): void {
  vi.resetModules()
  resetHttpClient()
  factory = new IDBFactory()
  globalThis.indexedDB = factory
  scriptCreateTransaction()
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// Runs a one-Step Route whose `/tx/create` call is already scripted, and returns what is stored after.
async function runOneStep(): Promise<{
  view: Sdk.HistoryItem | undefined
  port: ReturnType<typeof recordingNamespaces>
  events: Awaited<ReturnType<typeof createExecutionClient>>['events']
}> {
  const port = recordingNamespaces()
  const { client, events } = await createExecutionClient(port)
  await confirmQuote(client)
  await expect(
    client.execute('request-1', EXECUTION_OPTIONS),
  ).resolves.toBeUndefined()
  await settle()
  return { view: await client.history.get('request-1'), port, events }
}

// What every failed fetch leaves: this failure, no entries, no wallet request, one report and the failed events.
function expectFailedFetch(
  run: Awaited<ReturnType<typeof runOneStep>>,
  failure: Sdk.ExecutionFailure,
): void {
  const { view, port, events } = run
  expect(view?._queue.status).toBe('FAILED')
  expect(view?._storage).toMatchObject({
    finishedSwapSteps: 0,
    transactions: {},
    failure,
    finishedAt: expect.any(Number),
  })
  expect(port.requests).toEqual([])
  expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
  expect(httpClient.reportFailure).toHaveBeenCalledWith({
    requestId: 'request-1',
    step: 1,
    eventType: failure.reasonCode,
    reason: failure.detail ?? '',
    tags: undefined,
  })
  expect(events.map(nameOf).slice(-FAILURE_TAIL)).toEqual([
    'step1:failed',
    'route:failed',
  ])
}

describe('a failed /tx/create', () => {
  beforeEach(() => {
    freshStart()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('an answer that is not ok fails with its error as the detail', async () => {
    httpClient.createTransaction.mockResolvedValueOnce({
      ok: false,
      error: 'route expired',
      transaction: null,
    })

    expectFailedFetch(await runOneStep(), {
      reasonCode: 'FETCH_TX_FAILED',
      message: CREATE_TX_FAILED_MESSAGE,
      detail: 'route expired',
    })
  })

  test('an ok answer without a transaction or error fails with a fallback detail', async () => {
    httpClient.createTransaction.mockResolvedValueOnce({
      ok: true,
      error: null,
      transaction: null,
    })

    expectFailedFetch(await runOneStep(), {
      reasonCode: 'FETCH_TX_FAILED',
      message: CREATE_TX_FAILED_MESSAGE,
      detail: 'bad response from create tx endpoint',
    })
  })

  test('an ok answer with no transaction field fails with the fallback detail', async () => {
    httpClient.createTransaction.mockResolvedValueOnce({
      ok: true,
      error: null,
    })

    expectFailedFetch(await runOneStep(), {
      reasonCode: 'FETCH_TX_FAILED',
      message: CREATE_TX_FAILED_MESSAGE,
      detail: 'bad response from create tx endpoint',
    })
  })

  test('an answer that is not ok with an empty error fails with the fallback detail', async () => {
    httpClient.createTransaction.mockResolvedValueOnce({
      ok: false,
      error: '',
      transaction: null,
    })

    expectFailedFetch(await runOneStep(), {
      reasonCode: 'FETCH_TX_FAILED',
      message: CREATE_TX_FAILED_MESSAGE,
      detail: 'bad response from create tx endpoint',
    })
  })

  test("a rejected call fails with the server's error text and no detail", async () => {
    httpClient.createTransaction.mockRejectedValueOnce(
      httpError(BAD_REQUEST, { error: 'server says' }),
    )

    expectFailedFetch(await runOneStep(), {
      reasonCode: 'FETCH_TX_FAILED',
      message: 'server says',
      detail: null,
    })
  })

  test('a rejected call without a server error text falls back to the default message', async () => {
    httpClient.createTransaction.mockRejectedValueOnce(
      new Error('socket hang up'),
    )

    expectFailedFetch(await runOneStep(), {
      reasonCode: 'FETCH_TX_FAILED',
      message: CREATE_TX_FAILED_MESSAGE,
      detail: null,
    })
  })
})

describe('a refused transaction', () => {
  beforeEach(() => {
    freshStart()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test.each(REFUSALS)(
    '$name fails with no entries and no wallet request',
    async ({ tx, reasonCode, message }) => {
      httpClient.createTransaction.mockResolvedValueOnce({
        ok: true,
        error: null,
        transaction: tx,
      })

      expectFailedFetch(await runOneStep(), {
        reasonCode,
        message,
        detail: null,
      })
    },
  )

  test('a refusal at step 2 keeps step 1 completed and reports step 2', async () => {
    const port = recordingNamespaces()
    const { client, events } = await createExecutionClient(port)
    httpClient.createTransaction
      .mockResolvedValueOnce(createTxResponse())
      .mockResolvedValueOnce({ ok: true, error: null, transaction: cosmosTx() })
    await confirmQuote(client, 'request-1', [
      swap(),
      swap({ from: BSC_ASSET, to: BSC_ASSET }),
    ])

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.finishedSwapSteps).toBe(1)
    expect(view?._storage.transactions.s1?.execution.status).toBe('completed')
    expect(view?._storage.transactions.s2).toBeUndefined()
    expect(view?._storage.failure).toEqual({
      reasonCode: 'FETCH_TX_FAILED',
      message: 'Cosmos transactions are no longer supported.',
      detail: null,
    })
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 2,
      eventType: 'FETCH_TX_FAILED',
      reason: '',
      tags: undefined,
    })
    expect(events.map(nameOf).slice(-FAILURE_TAIL)).toEqual([
      'step2:failed',
      'route:failed',
    ])
  })
})
