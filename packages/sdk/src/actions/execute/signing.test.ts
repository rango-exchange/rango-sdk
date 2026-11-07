// Signer rejections and the port's `wait`, driven through the public client over fake-indexeddb, with the polling timer faked.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { SignerError, SignerErrorCode } from 'rango-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  confirmQuote,
  createExecutionClient,
  EXECUTION_OPTIONS,
  expectNotReported,
  httpClient,
  type RecordedEvent,
  recordingNamespaces,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  signerError,
  statusResponse,
  succeeded,
  waitingNamespaces,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
const POLLS_AFTER = 3
// What every evm request names besides its own fields: v14's evm namespace takes the blockchain, and no address.
const ON_ETH = { blockchain: 'ETH' }

let factory = new IDBFactory()

// A fresh module graph and `httpClient` mock, on this database.
function freshStart(on: IDBFactory): void {
  vi.resetModules()
  resetHttpClient()
  globalThis.indexedDB = on
  scriptCreateTransaction()
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// Confirms and executes a one-Step Route, and lets it run until it waits on the clock.
async function confirmAndExecute(client: Sdk.RangoClient): Promise<void> {
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
}

// Runs a one-Step Route whose `sign` rejects with this error, and returns what is stored after and the events emitted.
async function runRejectedSign(
  error: unknown,
): Promise<{ view: Sdk.HistoryItem; events: RecordedEvent[] }> {
  const port = recordingNamespaces()
  const { client, events } = await createExecutionClient(port)
  port.wallet.evm.sign.mockRejectedValueOnce(error)
  await confirmAndExecute(client)
  const view = await client.history.get('request-1')
  if (view === undefined) {
    throw new Error('No stored Execution')
  }
  return { view, events }
}

describe('a sign rejection', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    freshStart(factory)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // A SignerError's message and detail are its `getErrorDetail()`'s: a user reject's are fixed, the rest keep the root.
  test.each([
    [
      SignerErrorCode.REJECTED_BY_USER,
      'USER_REJECT',
      'User rejected the transaction',
      'User rejected the transaction',
    ],
    [
      SignerErrorCode.SIGN_TX_ERROR,
      'CALL_WALLET_FAILED',
      'Error signing the transaction',
      'Wallet said no',
    ],
    [
      SignerErrorCode.SEND_TX_ERROR,
      'SEND_TX_FAILED',
      'Error sending the transaction',
      'Wallet said no',
    ],
    [
      SignerErrorCode.TX_FAILED_IN_BLOCKCHAIN,
      'TX_FAILED_IN_BLOCKCHAIN',
      'Transaction failed in blockchain',
      'Wallet said no',
    ],
    [
      SignerErrorCode.NOT_IMPLEMENTED,
      'CLIENT_UNEXPECTED_BEHAVIOUR',
      'Operation not implemented',
      'Wallet said no',
    ],
    [
      SignerErrorCode.OPERATION_UNSUPPORTED,
      'CLIENT_UNEXPECTED_BEHAVIOUR',
      'Unsupported operation',
      'Wallet said no',
    ],
    [
      SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      'CLIENT_UNEXPECTED_BEHAVIOUR',
      'Unexpected error',
      'Wallet said no',
    ],
  ])(
    'a SignerError coded %s is stored and reported as %s with its getErrorDetail message and detail, and the entry stays sign_requested',
    async (code, reasonCode, message, detail) => {
      const { view } = await runRejectedSign(signerError(code))

      expect(view._queue.status).toBe('FAILED')
      expect(view._storage.failure).toEqual({ reasonCode, message, detail })
      expect(view._storage.transactions.s1?.execution).toEqual({
        status: 'sign_requested',
        result: { walletResult: null, checkResult: null },
      })
      expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
      expect(httpClient.reportFailure).toHaveBeenCalledWith({
        requestId: 'request-1',
        step: 1,
        eventType: reasonCode,
        reason: detail,
        tags: { wallet: 'metamask' },
      })
      expect(httpClient.checkStatus).not.toHaveBeenCalled()
    },
  )

  test('a SignerError whose getErrorDetail throws on a circular root keeps its code, with its own message and a null detail', async () => {
    // Made circular only once built: the constructor stringifies its root too.
    const root: { self?: unknown } = {}
    const error = new SignerError(
      SignerErrorCode.SIGN_TX_ERROR,
      'Signing broke',
      root,
    )
    root.self = root
    expect(() => error.getErrorDetail()).toThrow()

    const { view } = await runRejectedSign(error)

    expect(view._queue.status).toBe('FAILED')
    expect(view._storage.failure).toEqual({
      reasonCode: 'CALL_WALLET_FAILED',
      message: 'Signing broke',
      detail: null,
    })
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      eventType: 'CALL_WALLET_FAILED',
      reason: '',
      tags: { wallet: 'metamask' },
    })
  })

  test.each([
    ['a plain Error', new Error('wallet exploded'), 'wallet exploded'],
    [
      'a plain object coded REJECTED_BY_USER',
      { code: 'REJECTED_BY_USER', message: 'User rejected' },
      'User rejected',
    ],
    [
      'a plain object coded REJECTED_BY_USER with no message',
      { code: 'REJECTED_BY_USER' },
      '[object Object]',
    ],
    [
      "an Error whose message reads like a user's reject",
      Object.assign(new Error('User rejected the request.'), { code: 4001 }),
      'User rejected the request.',
    ],
    [
      'a plain Error with a cause',
      Object.assign(new Error('wallet exploded'), {
        cause: { message: 'nonce too low' },
      }),
      'wallet exploded',
    ],
  ])(
    '%s rejection is stored as CLIENT_UNEXPECTED_BEHAVIOUR with its message and a null detail, and is not reported',
    async (_, error, message) => {
      const { view, events } = await runRejectedSign(error)

      expect(view._queue.status).toBe('FAILED')
      expect(view._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message,
        detail: null,
      })
      expect(view._storage.transactions.s1?.execution.status).toBe(
        'sign_requested',
      )
      expectNotReported(events)
    },
  )

  test("a SignerError with a cause reports the cause's message as the reason, and the stored detail is unchanged", async () => {
    const error = signerError(SignerErrorCode.SEND_TX_ERROR, 'Wallet said no', {
      message: 'nonce too low',
    })
    const { view } = await runRejectedSign(error)

    expect(view._storage.failure).toEqual({
      reasonCode: 'SEND_TX_FAILED',
      message: error.message,
      detail: 'Wallet said no',
    })
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      eventType: 'SEND_TX_FAILED',
      reason: 'nonce too low',
      tags: { wallet: 'metamask' },
    })
  })

  test("a user rejection with a cause reports the detail, not the cause's message", async () => {
    const { view } = await runRejectedSign(
      signerError(SignerErrorCode.REJECTED_BY_USER, 'unused', {
        message: 'User denied transaction signature',
      }),
    )

    expect(view._storage.failure?.detail).toBe('User rejected the transaction')
    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      eventType: 'USER_REJECT',
      reason: 'User rejected the transaction',
      tags: { wallet: 'metamask' },
    })
  })

  test.each([
    ['a cause with no message', { code: 4001 }, 'Wallet said no'],
    [
      'a cause whose message is not a string',
      { message: 42 },
      'Wallet said no',
    ],
    ['a string cause', 'nonce too low', 'Wallet said no'],
    ['a cause with no message and no detail', { code: 4001 }, ''],
  ])('%s reports the detail, or an empty reason', async (_, cause, reason) => {
    // No root, no detail: `getErrorDetail()` answers none.
    const root = reason === '' ? undefined : reason
    await runRejectedSign(
      new SignerError(
        SignerErrorCode.SIGN_TX_ERROR,
        undefined,
        root,
        undefined,
        cause,
      ),
    )

    expect(httpClient.reportFailure).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      eventType: 'CALL_WALLET_FAILED',
      reason,
      tags: { wallet: 'metamask' },
    })
  })
})

describe("the port's wait", () => {
  beforeEach(() => {
    factory = new IDBFactory()
    freshStart(factory)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("is called once, after sign and before polling, with the signed hash and sign's response, and no chain ID or transaction type", async () => {
    const port = waitingNamespaces()
    const { client } = await createExecutionClient(port)
    const response = { nonce: 7 }
    port.wallet.evm.sign.mockResolvedValueOnce({ hash: '0xsigned', response })
    let polled = false
    port.wallet.evm.wait.mockImplementationOnce(async (req) => {
      polled = httpClient.checkStatus.mock.calls.length > 0
      // The same object `sign` resolved with, not a copy.
      expect(req.response).toBe(response)
      return { hash: req.hash }
    })

    await confirmAndExecute(client)

    expect(port.wallet.evm.wait).toHaveBeenCalledTimes(1)
    expect(port.wallet.evm.wait).toHaveBeenCalledWith({
      ...ON_ETH,
      hash: '0xsigned',
      response,
    })
    expect(polled).toBe(false)
    expect(httpClient.checkStatus).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      txId: '0xsigned',
    })
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test('a different hash replaces the stored hash, and polling follows it', async () => {
    const port = waitingNamespaces()
    const { client } = await createExecutionClient(port)
    port.wallet.evm.wait.mockResolvedValueOnce({ hash: '0xreplaced' })
    const seen: unknown[] = []
    httpClient.checkStatus.mockImplementationOnce(async () => {
      const view = await client.history.get('request-1')
      seen.push(view?._storage.transactions.s1?.execution.result.walletResult)
      return statusResponse()
    })

    await confirmAndExecute(client)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await settle()

    expect(seen).toEqual([{ hash: '0xreplaced' }])
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(2)
    for (const [req] of httpClient.checkStatus.mock.calls) {
      expect(req).toEqual({
        requestId: 'request-1',
        step: 1,
        txId: '0xreplaced',
      })
    }
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: '0xreplaced' })
  })

  test('the same hash moves on to polling with it', async () => {
    const port = waitingNamespaces()
    const { client } = await createExecutionClient(port)

    await confirmAndExecute(client)

    expect(port.requests.map(([, method]) => method)).toEqual([
      'getChainId',
      'sign',
      'wait',
    ])
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
    expect(httpClient.checkStatus).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      txId: '0xhash1',
    })
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: '0xhash1' })
  })

  test.each([
    ['resolves', () => httpClient.checkStatus.mockResolvedValue(succeeded)],
    [
      'rejects',
      () => httpClient.checkStatus.mockRejectedValue(new Error('status down')),
    ],
  ])(
    'a rejected wait makes one status call with the signed hash, which %s, then fails with the signer code and detail',
    async (_, scriptStatus) => {
      const unhandled = vi.fn()
      process.on('unhandledRejection', unhandled)
      try {
        scriptStatus()
        const port = waitingNamespaces()
        const { client } = await createExecutionClient(port)
        port.wallet.evm.wait.mockRejectedValueOnce(
          signerError(SignerErrorCode.SEND_TX_ERROR, 'Replaced by the user'),
        )

        await confirmAndExecute(client)
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * POLLS_AFTER)
        await settle()

        expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
        expect(httpClient.checkStatus).toHaveBeenCalledWith({
          requestId: 'request-1',
          step: 1,
          txId: '0xhash1',
        })
        const view = await client.history.get('request-1')
        expect(view?._queue.status).toBe('FAILED')
        expect(view?._storage.failure).toEqual({
          reasonCode: 'SEND_TX_FAILED',
          message: 'Error sending the transaction',
          detail: 'Replaced by the user',
        })
        expect(view?._storage.transactions.s1?.execution).toEqual({
          status: 'signed',
          result: { walletResult: { hash: '0xhash1' }, checkResult: null },
        })
        expect(httpClient.reportFailure).toHaveBeenCalledTimes(1)
        expect(httpClient.reportFailure).toHaveBeenCalledWith({
          requestId: 'request-1',
          step: 1,
          eventType: 'SEND_TX_FAILED',
          reason: 'Replaced by the user',
          tags: { wallet: 'metamask' },
        })
        expect(unhandled).not.toHaveBeenCalled()
      } finally {
        process.off('unhandledRejection', unhandled)
      }
    },
  )

  test('a plain Error rejection of wait is stored as CLIENT_UNEXPECTED_BEHAVIOUR with its message and a null detail, and is not reported', async () => {
    const port = waitingNamespaces()
    const { client, events } = await createExecutionClient(port)
    port.wallet.evm.wait.mockRejectedValueOnce(new Error('RPC down'))

    await confirmAndExecute(client)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * POLLS_AFTER)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'RPC down',
      detail: null,
    })
    expectNotReported(events)
  })

  test('a port without wait polls checkStatus right after signing', async () => {
    const port = recordingNamespaces()
    const { client } = await createExecutionClient(port)
    let polledAtSign = -1
    httpClient.checkStatus.mockImplementationOnce(async () => {
      polledAtSign = port.wallet.evm.sign.mock.calls.length
      return succeeded
    })

    await confirmAndExecute(client)

    expect('wait' in port.wallet.evm).toBe(false)
    expect(polledAtSign).toBe(1)
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
    expect(httpClient.checkStatus).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      txId: '0xhash1',
    })
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test('is never called again by later poll rounds', async () => {
    const port = waitingNamespaces()
    const { client } = await createExecutionClient(port)
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus.mockResolvedValue(statusResponse())

    await confirmAndExecute(client)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * POLLS_AFTER)
    await settle()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await settle()

    expect(httpClient.checkStatus).toHaveBeenCalledTimes(POLLS_AFTER + 2)
    expect(port.wallet.evm.wait).toHaveBeenCalledTimes(1)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test('is called again after a reload, without a response, and polling resumes with its hash', async () => {
    // The status check never answers: the queue stays RUNNING with its entry signed.
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus.mockReturnValue(new Promise(() => undefined))
    const first = waitingNamespaces()
    const { client } = await createExecutionClient(first)
    first.wallet.evm.sign.mockResolvedValueOnce({
      hash: '0xsigned',
      response: { live: true },
    })
    await confirmAndExecute(client)
    expect(first.wallet.evm.wait).toHaveBeenCalledTimes(1)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'RUNNING',
    )

    freshStart(factory)
    const port = waitingNamespaces()
    const { client: loaded } = await createExecutionClient(port)
    await loaded.history.getAll()
    await settle()

    expect(port.wallet.evm.sign).not.toHaveBeenCalled()
    expect(port.requests).toEqual([
      [
        'evm',
        'wait',
        {
          ...ON_ETH,
          hash: '0xsigned',
          response: undefined,
        },
      ],
    ])
    expect(httpClient.checkStatus).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      txId: '0xsigned',
    })
    expect((await loaded.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })
})
