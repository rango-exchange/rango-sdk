// Status-poll outcomes driven through the public client, over fake-indexeddb, with the polling timer faked.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { TransactionStatus } from 'rango-sdk'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  confirmQuote,
  createExecutionClient,
  evmTx,
  EXECUTION_OPTIONS,
  httpClient,
  nameOf,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  statusResponse,
  succeeded,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
// The last `changed`, `stepEvent` `failed` and `routeEvent` `failed`.
const FAILURE_TAIL = 3
// `stepEvent` `failed` and `routeEvent` `failed`.
const FAILURE_EVENTS = 2
const THREE_CALLS = 3

const EXPLORER = [{ url: 'https://explorer/1', description: 'Source' }]
const DIAGNOSIS = 'https://diagnosis/1'

let factory = new IDBFactory()

/*
 * Runs a one-Step Route to its first `checkStatus` answer, with `checkStatus` answering these in order, then the last.
 * `''` and `null` stand for an empty body, as axios can resolve one.
 */
async function startPolling(
  ...answers: (Error | ReturnType<typeof statusResponse> | '' | null)[]
) {
  const execution = await createExecutionClient()
  await confirmQuote(execution.client)
  httpClient.checkStatus.mockReset()
  for (const answer of answers) {
    if (answer instanceof Error) {
      httpClient.checkStatus.mockRejectedValueOnce(answer)
    } else {
      httpClient.checkStatus.mockResolvedValueOnce(answer)
    }
  }
  httpClient.checkStatus.mockResolvedValue(statusResponse())
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return execution
}

// The next poll round.
async function nextRound(): Promise<void> {
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
  await settle()
}

async function entryOf(
  client: Sdk.RangoClient,
): Promise<Sdk.ExecutionTransaction | undefined> {
  return (await client.history.get('request-1'))?._storage.transactions.s1
}

describe('status polling', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    scriptCreateTransaction()
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a running answer stores its outputAmount and links, and the next call comes only after POLL_INTERVAL_MS', async () => {
    const { client } = await startPolling(
      statusResponse({
        outputAmount: '2995',
        explorerUrl: EXPLORER,
        diagnosisUrl: DIAGNOSIS,
      }),
    )

    expect((await entryOf(client))?.execution).toEqual({
      status: 'signed',
      result: {
        walletResult: { hash: '0xhash1' },
        checkResult: {
          outputAmount: '2995',
          explorerUrl: EXPLORER,
          diagnosisUrl: DIAGNOSIS,
        },
      },
    })
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(2)
  })

  test('a later answer with null or empty fields keeps the stored values', async () => {
    const { client } = await startPolling(
      statusResponse({
        outputAmount: '2995',
        explorerUrl: EXPLORER,
        diagnosisUrl: DIAGNOSIS,
      }),
      statusResponse({ outputAmount: '', explorerUrl: null, diagnosisUrl: '' }),
    )

    await nextRound()

    expect(httpClient.checkStatus).toHaveBeenCalledTimes(2)
    expect((await entryOf(client))?.execution.result.checkResult).toEqual({
      outputAmount: '2995',
      explorerUrl: EXPLORER,
      diagnosisUrl: DIAGNOSIS,
    })
  })

  test('an answer with a new explorer list replaces the list whole, and a missing description is null', async () => {
    const { client } = await startPolling(
      statusResponse({ explorerUrl: EXPLORER }),
      statusResponse({
        explorerUrl: [{ url: 'https://explorer/2', description: null }],
      }),
    )

    await nextRound()

    expect((await entryOf(client))?.execution.result.checkResult).toEqual({
      outputAmount: null,
      explorerUrl: [{ url: 'https://explorer/2', description: null }],
      diagnosisUrl: null,
    })
  })

  test('an answer identical to what is stored makes no write and no event once the output amount is known', async () => {
    const answer = statusResponse({
      outputAmount: '2995',
      explorerUrl: EXPLORER,
    })
    const { client, events } = await startPolling(answer, answer, answer)
    const before = events.length

    await nextRound()
    await nextRound()

    expect(httpClient.checkStatus).toHaveBeenCalledTimes(THREE_CALLS)
    expect(events.length).toBe(before)
    expect((await entryOf(client))?.execution.result.checkResult).toEqual({
      outputAmount: '2995',
      explorerUrl: EXPLORER,
      diagnosisUrl: null,
    })
  })

  test('a success answer stores its final checkResult with the entry completed', async () => {
    const { client } = await startPolling(
      statusResponse({ outputAmount: '2995', diagnosisUrl: DIAGNOSIS }),
      statusResponse({
        status: TransactionStatus.SUCCESS,
        outputAmount: '2990',
        explorerUrl: EXPLORER,
      }),
    )

    await nextRound()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.transactions.s1?.execution).toEqual({
      status: 'completed',
      result: {
        walletResult: { hash: '0xhash1' },
        checkResult: {
          outputAmount: '2990',
          explorerUrl: EXPLORER,
          diagnosisUrl: DIAGNOSIS,
        },
      },
    })
  })

  test('a pending answer emits check_status while no output amount is stored, and output_revealed for the first with one', async () => {
    const { events } = await startPolling(
      statusResponse(),
      statusResponse({ outputAmount: '2995' }),
      statusResponse({ outputAmount: '2995', explorerUrl: EXPLORER }),
    )
    const before = events.length

    await nextRound()
    await nextRound()

    expect(events.slice(before).map(nameOf)).toEqual([
      'changed',
      'step1:output_revealed',
      'changed',
    ])
  })

  test('a success answer with the output amount already stored emits only succeeded', async () => {
    const { events } = await startPolling(
      statusResponse({ outputAmount: '2995' }),
      succeeded,
    )
    const before = events.length

    await nextRound()

    expect(
      events
        .slice(before)
        .map(nameOf)
        .filter((name) => name.startsWith('step1:')),
    ).toEqual(['step1:succeeded'])
  })

  test('a rejected checkStatus call fails nothing: the next round runs after POLL_INTERVAL_MS and a later success ends the step', async () => {
    const { client } = await startPolling(
      new Error('network down'),
      new Error('network down'),
      succeeded,
    )

    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
    const running = await client.history.get('request-1')
    expect(running?._queue.status).toBe('RUNNING')
    expect(running?._storage.failure).toBeNull()
    expect(
      running?._storage.transactions.s1?.execution.result.checkResult,
    ).toBe(null)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await settle()
    await nextRound()

    expect(httpClient.checkStatus).toHaveBeenCalledTimes(THREE_CALLS)
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.transactions.s1?.execution.status).toBe('completed')
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
  })

  test.each([
    ['an empty string', ''],
    ['null', null],
  ] as const)(
    'an empty answer (%s) makes no write and no event, and the next round runs normally',
    async (_, empty) => {
      const { client, events } = await startPolling(
        statusResponse(),
        empty,
        statusResponse({ outputAmount: '2995' }),
      )
      const stored = (await entryOf(client))?.execution
      const before = events.length

      await nextRound()

      expect(httpClient.checkStatus).toHaveBeenCalledTimes(2)
      expect(events.length).toBe(before)
      expect((await entryOf(client))?.execution).toEqual(stored)
      expect(
        (await client.history.get('request-1'))?._storage.failure,
      ).toBeNull()

      await nextRound()

      expect(httpClient.checkStatus).toHaveBeenCalledTimes(THREE_CALLS)
      expect(events.slice(before).map(nameOf)).toEqual([
        'changed',
        'step1:output_revealed',
      ])
      expect((await entryOf(client))?.execution.result.checkResult).toEqual({
        outputAmount: '2995',
        explorerUrl: [],
        diagnosisUrl: null,
      })
    },
  )

  test.each([
    ['its extraMessage', 'Reverted by the bridge', 'Reverted by the bridge'],
    ['null without an extraMessage', null, null],
  ])(
    'a failed answer ends the Execution FAILED with TX_FAIL, detail %s, and its checkResult',
    async (_, extraMessage, detail) => {
      const { client } = await startPolling(
        statusResponse({ outputAmount: '2995' }),
        statusResponse({
          status: TransactionStatus.FAILED,
          extraMessage,
          explorerUrl: EXPLORER,
          diagnosisUrl: DIAGNOSIS,
        }),
      )

      await nextRound()

      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'TX_FAIL',
        message: 'Transaction failed in blockchain',
        detail,
      })
      expect(view?._storage.transactions.s1?.execution).toEqual({
        status: 'signed',
        result: {
          walletResult: { hash: '0xhash1' },
          checkResult: {
            outputAmount: '2995',
            explorerUrl: EXPLORER,
            diagnosisUrl: DIAGNOSIS,
          },
        },
      })

      await nextRound()
      expect(httpClient.checkStatus).toHaveBeenCalledTimes(2)
    },
  )

  test('TX_FAIL is not reported, and the emitter still records step failed then route failed', async () => {
    const { client, events } = await startPolling(
      statusResponse({
        status: TransactionStatus.FAILED,
        explorerUrl: EXPLORER,
      }),
    )
    await settle()

    expect(httpClient.reportFailure).not.toHaveBeenCalled()
    expect(events.slice(-FAILURE_TAIL).map(nameOf)).toEqual([
      'changed',
      'step1:failed',
      'route:failed',
    ])
    // The failure and its checkResult land in one write: no `changed` shows one without the other.
    for (const [type, event] of events) {
      if (type === 'changed' && event._storage.failure !== null) {
        expect(
          event._storage.transactions.s1?.execution.result.checkResult
            ?.explorerUrl,
        ).toEqual(EXPLORER)
      }
    }
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'FAILED',
    )
  })

  test.each([
    ['running', TransactionStatus.RUNNING],
    ['success', TransactionStatus.SUCCESS],
  ])(
    'a %s answer with a newTx fails with CLIENT_UNEXPECTED_BEHAVIOUR, stores neither its checkResult nor the newTx, and is not reported',
    async (_, status) => {
      const newTx = evmTx({ data: '0xnewtx' })
      const { client, events } = await startPolling(
        statusResponse({
          status,
          newTx,
          outputAmount: '2995',
          explorerUrl: EXPLORER,
        }),
      )
      await settle()

      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: newTx is not supported.',
        detail: null,
      })
      expect(view?._storage.transactions.s1?.execution).toEqual({
        status: 'signed',
        result: { walletResult: { hash: '0xhash1' }, checkResult: null },
      })
      expect(Object.keys(view?._storage.transactions ?? {})).toEqual(['s1'])
      expect(JSON.stringify(view)).not.toContain('0xnewtx')
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
      expect(events.map(nameOf)).not.toContain('step1:succeeded')
      expect(events.slice(-FAILURE_EVENTS).map(nameOf)).toEqual([
        'step1:failed',
        'route:failed',
      ])
    },
  )

  test('an unexpected throw while reading an answer fails with CLIENT_UNEXPECTED_BEHAVIOUR and its message, and is not reported', async () => {
    // An answer whose `status` throws when read, as no answer the SDK expects would.
    const answer = Object.defineProperty(statusResponse(), 'status', {
      get: () => {
        throw new TypeError('bad answer')
      },
    })
    const { client, events } = await startPolling(answer)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'bad answer',
      detail: null,
    })
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
    expect(events.slice(-FAILURE_EVENTS).map(nameOf)).toEqual([
      'step1:failed',
      'route:failed',
    ])
  })
})
