// How the SDK reads a signed Prerequisite's `getTransactionInfo`: the Host's `'pending' | 'success' | 'failed'` on `evm`, the raw info it judges on `tron` and `xrpl`, and a rejection read as pending, driven through the public client over fake-indexeddb, with the timers faked.
import 'fake-indexeddb/auto'

import type { NamespaceRequest } from '../../../tests/support.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  approvingNamespaces,
  buildingNamespaces,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  EVM_INFO,
  evmApprove,
  evmBlockchains,
  evmTx,
  EXECUTION_OPTIONS,
  expectPrerequisiteFailed,
  historyOf,
  httpClient,
  recordingNamespaces,
  resetHttpClient,
  settle,
  signsOf,
  succeeded,
  TRON_INFO,
  tronApprove,
  tronChain,
  tronTx,
  XRPL_INFO,
  xrplChain,
  xrplTrustline,
  xrplTx,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
// Long enough for an approve's allowance confirmation, which follows its proof, to finish.
const ALLOWANCE_READ_INTERVAL_MS = 3_000

const chains = [...evmBlockchains, tronChain(), xrplChain()]

type Namespace = 'evm' | 'tron' | 'xrpl'
type Infos = NonNullable<
  NonNullable<Parameters<typeof approvingNamespaces>[1]>['infos']
>

// The one-Step Route per namespace whose transaction carries the Prerequisite `getTransactionInfo` proves.
const TRANSACTIONS = {
  evm: () => evmTx({ prerequisites: [evmApprove()] }),
  tron: () => tronTx({ prerequisites: [tronApprove()] }),
  xrpl: () => xrplTx({ prerequisites: [xrplTrustline()] }),
} satisfies Record<Namespace, () => unknown>

let factory = new IDBFactory()

/*
 * Confirms `namespace`'s Route, with a port that grants nothing before the Prerequisite and UNLIMITED after it, builds the
 * TRON approve, and answers `getTransactionInfo` from `infos`, then executes it and runs every pending step.
 */
async function start(namespace: Namespace, infos: Infos) {
  const port = buildingNamespaces(
    approvingNamespaces(recordingNamespaces(), { infos }),
    { tron: [tronTx({ txID: 'approve-tx', isApprovalTx: true })] },
  )
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(TRANSACTIONS[namespace]()),
  )
  const execution = await createExecutionClient(port, chains)
  await confirmQuote(execution.client)
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return { ...execution, port }
}

// How many times `namespace`'s `getTransactionInfo` was asked.
function infosAsked(
  requests: readonly NamespaceRequest[],
  namespace: Namespace,
) {
  return requests.filter(
    ([name, method]) => name === namespace && method === 'getTransactionInfo',
  ).length
}

describe('getTransactionInfo, judged by the Host on evm and by the SDK elsewhere', () => {
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

  const pendingThenSuccess: [string, Namespace, Infos][] = [
    ["evm: 'pending'", 'evm', { evm: [EVM_INFO.pending, EVM_INFO.success] }],
    [
      'evm: a rejection',
      'evm',
      { evm: [new Error('RPC down'), EVM_INFO.success] },
    ],
    ['tron: no blockNumber', 'tron', { tron: [{}, TRON_INFO.success] }],
    [
      'tron: a receipt with no blockNumber',
      'tron',
      { tron: [{ receipt: { result: 'REVERT' } }, TRON_INFO.success] },
    ],
    [
      'tron: a rejection',
      'tron',
      { tron: [new Error('Node down'), TRON_INFO.success] },
    ],
    [
      'xrpl: validated false',
      'xrpl',
      { xrpl: [{ validated: false }, XRPL_INFO.success] },
    ],
    [
      'xrpl: validated false with a result',
      'xrpl',
      {
        xrpl: [
          { validated: false, meta: { TransactionResult: 'tecPATH_DRY' } },
          XRPL_INFO.success,
        ],
      },
    ],
    [
      'xrpl: a rejection',
      'xrpl',
      { xrpl: [new Error('Ledger unreachable'), XRPL_INFO.success] },
    ],
  ]

  test.each(pendingThenSuccess)(
    '%s reads as pending and is asked again after POLL_INTERVAL_MS; then a success proves the Prerequisite',
    async (_name, namespace, infos) => {
      const { client, port } = await start(namespace, infos)

      expect(infosAsked(port.requests, namespace)).toBe(1)
      expect(signsOf(port.requests)).toHaveLength(1)
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('RUNNING')
      expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
        'signed',
      )

      await advance(POLL_INTERVAL_MS - 1)
      expect(infosAsked(port.requests, namespace)).toBe(1)
      await advance(1)
      expect(infosAsked(port.requests, namespace)).toBe(2)

      await advance(ALLOWANCE_READ_INTERVAL_MS)
      expect(infosAsked(port.requests, namespace)).toBe(2)
      expect(signsOf(port.requests)).toHaveLength(2)
      const done = await historyOf(client)
      expect(done?._storage.transactions['s1.p0']?.execution.status).toBe(
        'completed',
      )
      expect(done?._queue.status).toBe('SUCCESS')
    },
  )

  const success: [string, Namespace, Infos][] = [
    ["evm: 'success'", 'evm', { evm: [EVM_INFO.success] }],
    [
      "tron: a blockNumber with receipt.result 'SUCCESS'",
      'tron',
      {
        tron: [TRON_INFO.success],
      },
    ],
    [
      'tron: a blockNumber with no receipt',
      'tron',
      {
        tron: [{ blockNumber: 1 }],
      },
    ],
    [
      'tron: a blockNumber with no receipt.result',
      'tron',
      {
        tron: [{ blockNumber: 1, receipt: {} }],
      },
    ],
    [
      "xrpl: validated with 'tesSUCCESS'",
      'xrpl',
      { xrpl: [XRPL_INFO.success] },
    ],
  ]

  test.each(success)(
    '%s is success at once, and the main transaction is signed next',
    async (_name, namespace, infos) => {
      const { client, port } = await start(namespace, infos)
      await advance(ALLOWANCE_READ_INTERVAL_MS)

      expect(infosAsked(port.requests, namespace)).toBe(1)
      expect(signsOf(port.requests)).toHaveLength(2)
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    },
  )

  const failure: [string, Namespace, Infos][] = [
    ["evm: 'failed'", 'evm', { evm: [EVM_INFO.pending, EVM_INFO.failed] }],
    [
      "tron: a blockNumber with receipt.result 'REVERT'",
      'tron',
      {
        tron: [TRON_INFO.pending, TRON_INFO.failed],
      },
    ],
    [
      "tron: a blockNumber with receipt.result 'OUT_OF_ENERGY'",
      'tron',
      {
        tron: [{ blockNumber: 1, receipt: { result: 'OUT_OF_ENERGY' } }],
      },
    ],
    [
      "xrpl: validated with 'tecPATH_DRY'",
      'xrpl',
      {
        xrpl: [XRPL_INFO.pending, XRPL_INFO.failed],
      },
    ],
    ['xrpl: validated with no meta', 'xrpl', { xrpl: [{ validated: true }] }],
  ]

  test.each(failure)(
    '%s fails the swap with CLIENT_UNEXPECTED_BEHAVIOUR, and the main transaction is never signed',
    async (_name, namespace, infos) => {
      const { client, port } = await start(namespace, infos)
      await advance(POLL_INTERVAL_MS)

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Prerequisite transaction failed on chain.',
      })
      expect(signsOf(port.requests)).toHaveLength(1)
    },
  )
})
