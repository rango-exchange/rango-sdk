// TRON: the main transaction signed with no network gate, and the port-built approve with its met test, proof and allowance confirmation, driven through the public client over fake-indexeddb, with the timers faked.
import 'fake-indexeddb/auto'

import type {
  NamespaceRequest,
  PrerequisiteFailure,
  Rejection,
  TronApprove,
} from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  approvingNamespaces,
  buildingNamespaces,
  callOf,
  chain,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmBlockchains,
  EXECUTION_OPTIONS,
  expectNotReported,
  expectPrerequisiteFailed,
  historyOf,
  httpClient,
  nameOf,
  portRejections,
  recordingNamespaces,
  resetHttpClient,
  settle,
  signsOf,
  succeeded,
  switchingNamespaces,
  TRON_CHAIN_ID,
  tronApprove,
  tronChain,
  tronTx,
  UNLIMITED,
  waitingNamespaces,
} from '../../../tests/support.js'

const ALLOWANCE_READ_INTERVAL_MS = 3_000
const ALLOWANCE_TIMEOUT_MS = 30_000
// The met test, then a confirmation read every ALLOWANCE_READ_INTERVAL_MS from 0 to ALLOWANCE_TIMEOUT_MS.
const READS_TO_TIME_OUT =
  1 + ALLOWANCE_TIMEOUT_MS / ALLOWANCE_READ_INTERVAL_MS + 1

const chains = [...evmBlockchains, tronChain()]

// What the port builds for the approve: plain data, signed as it is.
const BUILT = tronTx({ txID: 'approve-tx', isApprovalTx: true })

let factory = new IDBFactory()

// Confirms a one-Step Route whose TRON transaction carries these Prerequisites, executes it and runs every pending step.
async function start(
  port: ReturnType<typeof recordingNamespaces>,
  prerequisites: TronApprove[] = [],
  blockchains: readonly Sdk.BlockchainMeta[] = chains,
) {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(tronTx({ prerequisites })),
  )
  const execution = await createExecutionClient(port, blockchains)
  await confirmQuote(execution.client)
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return execution
}

// A port that grants nothing before the approve and UNLIMITED after it, and builds BUILT.
function tronWallet(
  options: Parameters<typeof approvingNamespaces>[1] = {},
  builds: readonly (ReturnType<typeof tronTx> | Error | Rejection)[] = [BUILT],
) {
  return buildingNamespaces(
    approvingNamespaces(recordingNamespaces(), options),
    {
      tron: builds,
    },
  )
}

// What every failed approve leaves: this failure, the main transaction never signed.
async function expectFailed(
  client: Sdk.RangoClient,
  port: { requests: readonly NamespaceRequest[] },
  failure: PrerequisiteFailure,
): Promise<void> {
  await expectPrerequisiteFailed(client, failure)
  expect(port.requests.map(callOf)).not.toContain('sign:main-tx')
}

describe('TRON', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the main transaction', () => {
    const lists: [string, readonly Sdk.BlockchainMeta[], string | null][] = [
      ['the TRON chain ID from the Blockchain list', chains, TRON_CHAIN_ID],
      [
        'null when the TRON chain has no chain ID',
        [...evmBlockchains, chain('TRON', ['^T'])],
        null,
      ],
    ]

    test.each(lists)(
      'is signed once on tron, with %s left out of the request, with no network gate, and ends SUCCESS',
      async (_name, blockchains) => {
        const port = switchingNamespaces()
        const { client } = await start(port, [], blockchains)

        expect(port.requests).toEqual([['tron', 'sign', { tx: tronTx() }]])
        expect(port.wallet.evm.getChainId).not.toHaveBeenCalled()
        expect(port.wallet.evm.switchChain).not.toHaveBeenCalled()
        expect(port.wallet.hyperliquid.getChainId).not.toHaveBeenCalled()
        expect(port.wallet.hyperliquid.switchChain).not.toHaveBeenCalled()
        expect(httpClient.checkStatus).toHaveBeenCalledWith({
          requestId: 'request-1',
          step: 1,
          txId: '0xhash1',
        })
        expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      },
    )

    test('fails CLIENT_UNEXPECTED_BEHAVIOUR, stored and not reported, with no port call, given a Blockchain list with no TRON', async () => {
      const port = switchingNamespaces()
      const { client, events } = await start(port, [], evmBlockchains)

      expect(port.requests).toEqual([])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: TRON is not in the Blockchain list.',
        detail: null,
      })
      expectNotReported(events)
    })

    test('is not handed to wait, which v14 has only on evm, and is polled on its hash', async () => {
      const port = waitingNamespaces()
      const { client } = await start(port)

      expect(port.requests.map(callOf)).toEqual(['sign:main-tx'])
      expect(port.wallet.evm.wait).not.toHaveBeenCalled()
      expect(httpClient.checkStatus).toHaveBeenCalledWith({
        requestId: 'request-1',
        step: 1,
        txId: '0xhash1',
      })
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })
  })

  test('the main transaction is gated on its account: another address blocks ACCOUNT_MISMATCH with nothing signed', async () => {
    const port = recordingNamespaces(undefined, { TRON: 'TXother' })
    const { client } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'ACCOUNT_MISMATCH',
      metadata: { blockchain: 'TRON', address: 'TXfrom' },
    })
    expect(port.wallet.tron.getAccount.mock.calls).toEqual([[]])
    expect(port.requests).toEqual([])
  })

  describe('TRON_APPROVE Prerequisites', () => {
    test('the approve is gated on its account: another address blocks ACCOUNT_MISMATCH before the met test', async () => {
      const port = tronWallet()
      port.wallet.tron.getAccount.mockResolvedValue('TXother')
      const { client } = await start(port, [tronApprove()])

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'ACCOUNT_MISMATCH',
        metadata: { blockchain: 'TRON', address: 'TXfrom' },
      })
      expect(port.wallet.tron.getAccount.mock.calls).toEqual([[]])
      expect(port.requests).toEqual([])
      expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
        'not_started',
      )
    })

    test('a met approve is stored completed without a build or a sign', async () => {
      const port = tronWallet({ granted: ['1000000'] })
      const { client, events } = await start(port, [tronApprove()])

      expect(port.requests.map(callOf)).toEqual([
        'read:0xtrc20',
        'sign:main-tx',
      ])
      expect(port.requests[0]).toEqual([
        'tron',
        'getAllowance',
        { prerequisite: tronApprove() },
      ])
      expect(port.wallet.tron.buildTransaction).not.toHaveBeenCalled()
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions['s1.p0']?.execution).toEqual({
        status: 'completed',
        result: { walletResult: null, checkResult: null },
      })
      expect(events.map(nameOf)).not.toContain('step1:approval_tx_succeeded')
    })

    test('an unmet approve is built once by the port, with no limit, right before its sign, which gets exactly what was built', async () => {
      const port = tronWallet()
      const { client } = await start(port, [tronApprove()])

      const calls = ['read:0xtrc20', 'build:0xtrc20', 'sign:approve-tx']
      expect(port.requests.map(callOf).slice(0, calls.length)).toEqual(calls)
      expect(port.wallet.tron.buildTransaction).toHaveBeenCalledTimes(1)
      expect(port.requests[1]).toEqual([
        'tron',
        'buildTransaction',
        { prerequisite: tronApprove() },
      ])
      expect(signsOf(port.requests)[0]).toEqual({ tx: BUILT })

      await advance(ALLOWANCE_READ_INTERVAL_MS)
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions['s1.p0']?.data).toEqual({
        type: 'prerequisite',
        value: tronApprove(),
      })
      expect(JSON.stringify(view)).not.toContain('approve-tx')
    })

    test('the approve is proved by getTransactionInfo and two met reads, stored completed with approval_tx_succeeded, and only then is the main transaction signed', async () => {
      const port = tronWallet()
      const { client, events } = await start(port, [tronApprove()])

      const proof = [
        'read:0xtrc20',
        'build:0xtrc20',
        'sign:approve-tx',
        'info:0xhash1',
        'read:0xtrc20',
      ]
      expect(port.requests.map(callOf)).toEqual(proof)
      expect(port.wallet.tron.getTransactionInfo).toHaveBeenCalledWith({
        hash: '0xhash1',
      })
      expect(
        (await historyOf(client))?._storage.transactions['s1.p0']?.execution
          .status,
      ).toBe('signed')
      expect(events.map(nameOf)).not.toContain('step1:approval_tx_succeeded')

      await advance(ALLOWANCE_READ_INTERVAL_MS)
      expect(port.requests.map(callOf).slice(proof.length)).toEqual([
        'read:0xtrc20',
        'sign:main-tx',
      ])
      const names = events.map(nameOf)
      const succeededAt = names.indexOf('step1:approval_tx_succeeded')
      expect(succeededAt).toBeGreaterThan(-1)
      expect(names.lastIndexOf('step1:send_tx')).toBeGreaterThan(succeededAt)
      expect(events[succeededAt]).toEqual([
        'stepEvent',
        expect.objectContaining({
          event: { type: 'approval_tx_succeeded' },
          step: 1,
          transactionId: 's1.p0',
        }),
      ])
      const view = await historyOf(client)
      expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
        'completed',
      )
      expect(view?._queue.status).toBe('SUCCESS')
    })

    test('an approve whose allowance never confirms ends the swap with INSUFFICIENT_APPROVE after 30 s', async () => {
      const port = tronWallet({ granted: [null, UNLIMITED, '0'] })
      const { client } = await start(port, [tronApprove()])

      await advance(ALLOWANCE_TIMEOUT_MS - 1)
      expect((await historyOf(client))?._queue.status).toBe('RUNNING')

      await advance(1)
      expect(port.wallet.tron.getAllowance).toHaveBeenCalledTimes(
        READS_TO_TIME_OUT,
      )
      await expectFailed(client, port, {
        reasonCode: 'INSUFFICIENT_APPROVE',
        message: 'Insufficient approve, please try again.',
      })
    })

    test.each(
      portRejections('Could not read the current allowance from the node.'),
    )(
      'a getAllowance rejected with %s in the met test ends the swap with its failure, and nothing is built or signed',
      async (_, error, failure) => {
        const port = tronWallet({ granted: [error] })
        const { client } = await start(port, [tronApprove()])

        await expectFailed(client, port, failure)
        expect(port.wallet.tron.buildTransaction).not.toHaveBeenCalled()
        expect(port.wallet.tron.sign).not.toHaveBeenCalled()
      },
    )

    test.each(portRejections('Could not build the Tron approve transaction.'))(
      'a buildTransaction rejected with %s ends the swap with its failure, and nothing is signed',
      async (_, error, failure) => {
        const port = tronWallet({}, [error])
        const { client } = await start(port, [tronApprove()])

        await expectFailed(client, port, failure)
        expect(port.wallet.tron.sign).not.toHaveBeenCalled()
        expect(
          (await historyOf(client))?._storage.transactions['s1.p0']?.execution
            .status,
        ).toBe('not_started')
      },
    )
  })
})
