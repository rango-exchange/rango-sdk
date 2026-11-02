// Stellar: the main transaction signed with no network gate, and the port-built trustline with its met test, proved by its `sign`, driven through the public client over fake-indexeddb, with the timers faked.
import 'fake-indexeddb/auto'

import type {
  NamespaceRequest,
  PrerequisiteFailure,
  Rejection,
  StellarTrustline,
} from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  approvingNamespaces,
  buildingNamespaces,
  callOf,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  EVM_INFO,
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
  stellarChain,
  stellarTrustline,
  stellarTx,
  succeeded,
  switchingNamespaces,
  TRON_INFO,
  waitingNamespaces,
  XRPL_INFO,
} from '../../../tests/support.js'

const TRUSTLINE_LIMIT = '922337203685.4775807'

const chains = [...evmBlockchains, stellarChain()]

// What the port builds for the trustline: a `changeTrust`, signed as it is.
const BUILT = stellarTx('change-trust-op')

let factory = new IDBFactory()

// Confirms a one-Step Route whose Stellar transaction carries these Prerequisites, executes it and runs every pending step.
async function start(
  port: ReturnType<typeof recordingNamespaces>,
  prerequisites: StellarTrustline[] = [],
  blockchains: readonly Sdk.BlockchainMeta[] = chains,
) {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(stellarTx('payment-op', { prerequisites })),
  )
  const execution = await createExecutionClient(port, blockchains)
  await confirmQuote(execution.client)
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return execution
}

/*
 * A port that grants no trustline and builds BUILT, with a `getTransactionInfo` on each namespace that has one that must
 * stay unused: it would answer a failure.
 */
function stellarWallet(
  granted: readonly (string | null | Error | Rejection)[] = [null],
  builds: readonly (ReturnType<typeof stellarTx> | Error | Rejection)[] = [
    BUILT,
  ],
) {
  return buildingNamespaces(
    approvingNamespaces(recordingNamespaces(), {
      granted,
      infos: {
        evm: [EVM_INFO.failed],
        tron: [TRON_INFO.failed],
        xrpl: [XRPL_INFO.failed],
      },
    }),
    { stellar: builds },
  )
}

// What every failed trustline read or build leaves: this failure, nothing signed.
async function expectFailed(
  client: Sdk.RangoClient,
  port: { requests: readonly NamespaceRequest[] },
  failure: PrerequisiteFailure,
): Promise<void> {
  const view = await expectPrerequisiteFailed(client, failure)
  expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
    'not_started',
  )
  expect(
    port.requests.map(callOf).filter((call) => call.startsWith('sign')),
  ).toEqual([])
}

describe('Stellar', () => {
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

  describe('the main transaction', () => {
    test('is signed once on stellar, with no chain ID in the request and no network gate, given a Blockchain list with a Stellar chain with no chain ID, and ends SUCCESS', async () => {
      const port = switchingNamespaces()
      const { client } = await start(port)

      expect(port.requests).toEqual([['stellar', 'sign', { tx: stellarTx() }]])
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

    test('fails CLIENT_UNEXPECTED_BEHAVIOUR, stored and not reported, with no port call, given a Blockchain list with no Stellar chain', async () => {
      const port = switchingNamespaces()
      const { client, events } = await start(port, [], evmBlockchains)

      expect(port.requests).toEqual([])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: STELLAR is not in the Blockchain list.',
        detail: null,
      })
      expectNotReported(events)
    })

    test('is not handed to wait, which v14 has only on evm', async () => {
      const port = waitingNamespaces()
      const { client } = await start(port)

      expect(port.requests.map(callOf)).toEqual(['sign:payment-op'])
      expect(port.wallet.evm.wait).not.toHaveBeenCalled()
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })
  })

  test('the main transaction is gated on its connection: getAccounts answering null blocks NOT_CONNECTED with nothing signed', async () => {
    const port = recordingNamespaces(undefined, { STELLAR: null })
    const { client } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'STELLAR', address: 'GSTELLARFROM' },
    })
    expect(port.wallet.stellar.getAccounts.mock.calls).toEqual([[]])
    expect(port.requests).toEqual([])
  })

  describe('STELLAR_CHANGE_TRUSTLINE Prerequisites', () => {
    const met: [string, string][] = [
      ['at', TRUSTLINE_LIMIT],
      ['above', '922337203685.4775808'],
    ]

    test.each(met)(
      'a trustline read %s the limit is stored completed without a build or a sign, and the main transaction is signed next',
      async (_name, granted) => {
        const port = stellarWallet([granted])
        const { client, events } = await start(port, [stellarTrustline()])

        expect(port.requests.map(callOf)).toEqual([
          'read:USDC',
          'sign:payment-op',
        ])
        expect(port.requests[0]).toEqual([
          'stellar',
          'getTrustline',
          { prerequisite: stellarTrustline() },
        ])
        expect(port.wallet.stellar.buildTransaction).not.toHaveBeenCalled()
        const view = await historyOf(client)
        expect(view?._queue.status).toBe('SUCCESS')
        expect(view?._storage.transactions['s1.p0']?.execution).toEqual({
          status: 'completed',
          result: { walletResult: null, checkResult: null },
        })
        expect(events.map(nameOf)).not.toContain('step1:approval_tx_succeeded')
      },
    )

    const unmet: [string, string | null][] = [
      ['just below the limit', '922337203685.4775806'],
      ['as null', null],
    ]

    test.each(unmet)(
      'a trustline read %s is built once by the port with the Stellar limit, right before its sign, which gets exactly what was built',
      async (_name, granted) => {
        const port = stellarWallet([granted])
        const { client } = await start(port, [stellarTrustline()])

        expect(port.requests.map(callOf)).toEqual([
          'read:USDC',
          'build:USDC',
          'sign:change-trust-op',
          'sign:payment-op',
        ])
        expect(port.wallet.evm.getChainId).not.toHaveBeenCalled()
        expect(port.wallet.hyperliquid.getChainId).not.toHaveBeenCalled()
        expect(port.wallet.stellar.buildTransaction).toHaveBeenCalledTimes(1)
        expect(port.requests[1]).toEqual([
          'stellar',
          'buildTransaction',
          { prerequisite: stellarTrustline(), limit: TRUSTLINE_LIMIT },
        ])
        expect(signsOf(port.requests)[0]).toEqual({ tx: BUILT })
        expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      },
    )

    test('the built changeTrust is never stored: the entry keeps the Prerequisite', async () => {
      const port = stellarWallet()
      const { client } = await start(port, [stellarTrustline()])

      const view = await historyOf(client)
      expect(view?._storage.transactions['s1.p0']?.data).toEqual({
        type: 'prerequisite',
        value: stellarTrustline(),
      })
      expect(JSON.stringify(view)).not.toContain('change-trust-op')
    })

    test('a resolved trustline sign is the proof: the entry is stored completed with no status or allowance read and no approval_tx_succeeded, and the main transaction is signed next', async () => {
      const port = stellarWallet()
      const { client, events } = await start(port, [stellarTrustline()])

      expect(port.wallet.evm.getTransactionInfo).not.toHaveBeenCalled()
      expect(port.wallet.tron.getTransactionInfo).not.toHaveBeenCalled()
      expect(port.wallet.xrpl.getTransactionInfo).not.toHaveBeenCalled()
      expect(port.wallet.stellar.getTrustline).toHaveBeenCalledTimes(1)
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

    test.each(portRejections('Could not get account lines from Stellar.'))(
      'a getTrustline rejected with %s in the met test ends the swap with its failure, and nothing is built or signed',
      async (_, error, failure) => {
        const port = stellarWallet([error])
        const { client } = await start(port, [stellarTrustline()])

        await expectFailed(client, port, failure)
        expect(port.requests.map(callOf)).toEqual(['read:USDC'])
      },
    )

    test.each(
      portRejections('Could not build the Stellar trustline transaction.'),
    )(
      'a buildTransaction rejected with %s ends the swap with its failure, and nothing is signed',
      async (_, error, failure) => {
        const port = stellarWallet([null], [error])
        const { client } = await start(port, [stellarTrustline()])

        await expectFailed(client, port, failure)
        expect(port.requests.map(callOf)).toEqual(['read:USDC', 'build:USDC'])
      },
    )
  })
})
