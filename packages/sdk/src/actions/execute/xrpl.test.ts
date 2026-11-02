// XRPL: the `Payment` signed with no network gate, and the `TrustSet` the port builds, with its met test and proof, driven through the public client over fake-indexeddb, with the timers faked.
import 'fake-indexeddb/auto'

import type {
  Rejection,
  XrplInfo,
  XrplTrustline,
  XrplTx,
} from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  approvingNamespaces,
  buildingNamespaces,
  callOf,
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
  waitingNamespaces,
  XRPL_INFO,
  xrplChain,
  xrplTrustline,
  xrplTrustSetTx,
  xrplTx,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
const TRUSTLINE_LIMIT = '10000000000000'

const chains = [...evmBlockchains, xrplChain()]

let factory = new IDBFactory()

// Confirms a one-Step Route whose XRPL Payment carries these Prerequisites, executes it and runs every pending step.
async function start(
  port: ReturnType<typeof recordingNamespaces>,
  prerequisites: XrplTrustline[] = [],
  blockchains: readonly Sdk.BlockchainMeta[] = chains,
) {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(xrplTx({ prerequisites })),
  )
  const execution = await createExecutionClient(port, blockchains)
  await confirmQuote(execution.client)
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return execution
}

// A port that grants no trustline, builds `xrplTrustSetTx()` unless given `builds`, and proves it at once.
function xrplWallet({
  granted = [null],
  infos = [XRPL_INFO.success],
  builds,
}: {
  granted?: readonly (string | null | Error | Rejection)[]
  infos?: readonly (XrplInfo | Error)[]
  builds?: readonly (XrplTx | Error | Rejection)[]
} = {}) {
  return buildingNamespaces(
    approvingNamespaces(recordingNamespaces(), {
      granted,
      infos: { xrpl: infos },
    }),
    { xrpl: builds },
  )
}

describe('XRPL', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the Payment', () => {
    test('is signed once on xrpl, with no chain ID in the request and no network gate, given a Blockchain list with a XRPL chain with no chain ID, and ends SUCCESS', async () => {
      const port = switchingNamespaces()
      const { client } = await start(port)

      expect(port.requests).toEqual([['xrpl', 'sign', { tx: xrplTx() }]])
      expect(port.wallet.evm.getChainId).not.toHaveBeenCalled()
      expect(port.wallet.evm.switchChain).not.toHaveBeenCalled()
      expect(port.wallet.hyperliquid.getChainId).not.toHaveBeenCalled()
      expect(port.wallet.hyperliquid.switchChain).not.toHaveBeenCalled()
      expect(httpClient.checkStatus).toHaveBeenCalledWith({
        requestId: 'request-1',
        step: 1,
        txId: '0xhash1',
      })
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions.s1?.execution).toEqual({
        status: 'completed',
        result: {
          walletResult: { hash: '0xhash1' },
          checkResult: {
            outputAmount: '2990',
            explorerUrl: [],
            diagnosisUrl: null,
          },
        },
      })
    })

    test('fails CLIENT_UNEXPECTED_BEHAVIOUR, stored and not reported, with no port call, given a Blockchain list with no XRPL chain', async () => {
      const port = switchingNamespaces()
      const { client, events } = await start(port, [], evmBlockchains)

      expect(port.requests).toEqual([])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: XRPL is not in the Blockchain list.',
        detail: null,
      })
      expectNotReported(events)
    })

    test('a trustline fails CLIENT_UNEXPECTED_BEHAVIOUR before it is read, with no port call, given a Blockchain list with no XRPL chain', async () => {
      const port = xrplWallet()
      const { client } = await start(port, [xrplTrustline()], evmBlockchains)

      expect(port.requests).toEqual([])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: XRPL is not in the Blockchain list.',
        detail: null,
      })
    })

    test('is not handed to wait, which v14 has only on evm', async () => {
      const port = waitingNamespaces()
      const { client } = await start(port)

      expect(port.requests.map(callOf)).toEqual(['sign:Payment'])
      expect(port.wallet.evm.wait).not.toHaveBeenCalled()
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })
  })

  test('the Payment is gated on its connection: getAccount answering null blocks NOT_CONNECTED with nothing signed', async () => {
    const port = recordingNamespaces(undefined, { XRPL: null })
    const { client } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'XRPL', address: 'rXRPLfrom' },
    })
    expect(port.wallet.xrpl.getAccount.mock.calls).toEqual([[]])
    expect(port.requests).toEqual([])
  })

  describe('XRPL_CHANGE_TRUSTLINE Prerequisites', () => {
    const met: [string, string][] = [
      ['at', TRUSTLINE_LIMIT],
      ['above', '10000000000000.5'],
    ]

    test.each(met)(
      'a trustline read %s the limit is stored completed without a sign, and the Payment is signed next',
      async (_name, granted) => {
        const port = xrplWallet({ granted: [granted] })
        const { client, events } = await start(port, [xrplTrustline()])

        expect(port.requests.map(callOf)).toEqual(['read:USD', 'sign:Payment'])
        expect(port.requests[0]).toEqual([
          'xrpl',
          'getTrustline',
          { prerequisite: xrplTrustline() },
        ])
        const view = await historyOf(client)
        expect(view?._queue.status).toBe('SUCCESS')
        expect(view?._storage.transactions['s1.p0']?.execution).toEqual({
          status: 'completed',
          result: { walletResult: null, checkResult: null },
        })
        expect(port.wallet.xrpl.buildTransaction).not.toHaveBeenCalled()
        expect(events.map(nameOf)).not.toContain('step1:approval_tx_succeeded')
      },
    )

    const unmet: [string, string | null][] = [
      ['below the limit', '9999999999999.9'],
      ['as null', null],
    ]

    test.each(unmet)(
      'a trustline read %s is built once by the port with the limit, right before the sign, and signed as built',
      async (_name, granted) => {
        const port = xrplWallet({ granted: [granted] })
        const prerequisite = xrplTrustline({ wallet: 'rTrustlineOwner' })
        const { client } = await start(port, [prerequisite])

        expect(port.requests.map(callOf)).toEqual([
          'read:USD',
          'build:USD',
          'sign:TrustSet',
          'info:0xhash1',
          'sign:Payment',
        ])
        expect(port.wallet.xrpl.buildTransaction.mock.calls).toEqual([
          [{ prerequisite, limit: TRUSTLINE_LIMIT }],
        ])
        expect(signsOf(port.requests)[0]).toEqual({ tx: xrplTrustSetTx() })
        expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      },
    )

    test.each(portRejections('Could not get account lines from XRPL.'))(
      'a getTrustline rejected with %s in the met test ends the swap with its failure, and nothing is signed',
      async (_, error, failure) => {
        const port = xrplWallet({ granted: [error] })
        const { client } = await start(port, [xrplTrustline()])

        await expectPrerequisiteFailed(client, failure)
        expect(port.requests.map(callOf)).toEqual(['read:USD'])
      },
    )

    test.each(
      portRejections('Could not build the XRPL trustline transaction.'),
    )(
      'a buildTransaction rejected with %s ends the swap with its failure, and nothing is signed',
      async (_, error, failure) => {
        const port = xrplWallet({ builds: [error] })
        const { client } = await start(port, [xrplTrustline()])

        await expectPrerequisiteFailed(client, failure)
        expect(port.requests.map(callOf)).toEqual(['read:USD', 'build:USD'])
        expect(
          (await historyOf(client))?._storage.transactions['s1.p0']?.execution
            .status,
        ).toBe('not_started')
      },
    )

    test('the TrustSet is gated on its account: another address blocks ACCOUNT_MISMATCH before the met test', async () => {
      const port = xrplWallet()
      port.wallet.xrpl.getAccount.mockResolvedValue('rOther')
      const { client } = await start(port, [xrplTrustline()])

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'ACCOUNT_MISMATCH',
        metadata: { blockchain: 'XRPL', address: 'rXRPLfrom' },
      })
      expect(port.wallet.xrpl.getAccount.mock.calls).toEqual([[]])
      expect(port.requests).toEqual([])
      expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
        'not_started',
      )
    })

    test('the built TrustSet is never stored: the entry keeps the Prerequisite', async () => {
      const port = xrplWallet({ infos: [XRPL_INFO.pending] })
      const { client } = await start(port, [xrplTrustline()])

      const view = await historyOf(client)
      expect(view?._storage.transactions['s1.p0']).toMatchObject({
        data: { type: 'prerequisite', value: xrplTrustline() },
        execution: {
          status: 'signed',
          result: { walletResult: { hash: '0xhash1' } },
        },
      })
      expect(JSON.stringify(view)).not.toContain('TrustSet')
    })

    test('the Payment is signed only after getTransactionInfo answers a validated tesSUCCESS, a rejected or pending read polling again after 5 s', async () => {
      const port = xrplWallet({
        infos: [
          new Error('Ledger unreachable'),
          XRPL_INFO.pending,
          XRPL_INFO.success,
        ],
      })
      const { client } = await start(port, [xrplTrustline()])

      const proof = ['read:USD', 'build:USD', 'sign:TrustSet', 'info:0xhash1']
      expect(port.requests.map(callOf)).toEqual(proof)

      await advance(POLL_INTERVAL_MS - 1)
      expect(port.requests.map(callOf)).toEqual(proof)

      await advance(1)
      expect(port.requests.map(callOf)).toEqual([...proof, 'info:0xhash1'])

      await advance(POLL_INTERVAL_MS)
      expect(port.requests.map(callOf).slice(proof.length)).toEqual([
        'info:0xhash1',
        'info:0xhash1',
        'sign:Payment',
      ])
      expect(port.wallet.xrpl.getTransactionInfo).toHaveBeenCalledWith({
        hash: '0xhash1',
      })
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })

    test('a trustline that failed on chain ends the swap with CLIENT_UNEXPECTED_BEHAVIOUR and the Payment is never signed', async () => {
      const port = xrplWallet({ infos: [XRPL_INFO.failed] })
      const { client } = await start(port, [xrplTrustline()])

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toMatchObject({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Prerequisite transaction failed on chain.',
      })
      expect(view?._storage.transactions.s1?.execution.status).toBe(
        'not_started',
      )
      expect(port.requests.map(callOf)).toEqual([
        'read:USD',
        'build:USD',
        'sign:TrustSet',
        'info:0xhash1',
      ])
      expect(httpClient.reportFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 1,
          eventType: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        }),
      )
    })

    test('a proved trustline is stored completed with no allowance reads and emits no approval_tx_succeeded, and the main transaction is signed next', async () => {
      const port = xrplWallet()
      const { client, events } = await start(port, [xrplTrustline()])

      expect(port.wallet.xrpl.getTrustline).toHaveBeenCalledTimes(1)
      const names = events.map(nameOf)
      expect(names).not.toContain('step1:approval_tx_succeeded')
      expect(names.filter((name) => name === 'step1:send_tx')).toHaveLength(2)
      const view = await historyOf(client)
      expect(view?._storage.transactions['s1.p0']?.execution).toEqual({
        status: 'completed',
        result: { walletResult: { hash: '0xhash1' }, checkResult: null },
      })
      expect(
        view?._storage.transactions.s1?.execution.result.walletResult,
      ).toEqual({ hash: '0xhash2' })
      expect(view?._queue.status).toBe('SUCCESS')
    })
  })
})
