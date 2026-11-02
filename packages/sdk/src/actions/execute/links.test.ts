// The explorer link stored with an entry's hash, built from its blockchain's `transactionUrl`, driven through the public client over fake-indexeddb, with the timers and `fetch` faked.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmBlockchains,
  evmChain,
  evmTx,
  EXECUTION_OPTIONS,
  hang,
  httpClient,
  linkedChain,
  nameOf,
  recordingNamespaces,
  resetHttpClient,
  settle,
  statusResponse,
  succeeded,
  viewOf,
  waitingNamespaces,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000

const SCAN = 'https://scan.test/tx'
const SOURCE = [{ url: 'https://explorer/1', description: 'Source' }]

// The Blockchain list with an explorer on ETH, the chain every main EVM entry is signed on.
const linkedEvm = [linkedChain(evmChain('ETH', '0x1'), SCAN), evmBlockchains[1]]

let factory = new IDBFactory()

// A fresh module graph and `httpClient` mock, on this database.
function freshStart(on: IDBFactory): void {
  vi.resetModules()
  resetHttpClient()
  globalThis.indexedDB = on
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// Confirms a one-Step Route whose transaction is `tx`, executes it on `blockchains` and runs every pending step.
async function start(
  port: ReturnType<typeof recordingNamespaces>,
  tx: LegacySdk.Transaction,
  blockchains: readonly Sdk.BlockchainMeta[],
) {
  httpClient.createTransaction.mockResolvedValue(createTxResponse(tx))
  const execution = await createExecutionClient(port, blockchains)
  await confirmQuote(execution.client)
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return execution
}

// The `checkResult` seeded for this link: one explorer link, with no output amount or diagnosis link.
function seeded(url: string, description: 'Approve' | 'Swap') {
  return {
    outputAmount: null,
    explorerUrl: [{ url, description }],
    diagnosisUrl: null,
  }
}

// The main entry as the view of the event named `name` held it.
function entryAt(
  events: Parameters<typeof viewOf>[0][],
  name: string,
): Sdk.ExecutionTransaction | undefined {
  const event = events.find((recorded) => nameOf(recorded) === name)
  return event && viewOf(event)._storage.transactions.s1
}

async function entriesOf(
  client: Sdk.RangoClient,
): Promise<Record<string, Sdk.ExecutionTransaction>> {
  return (await client.history.get('request-1'))?._storage.transactions ?? {}
}

describe('transaction links', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    freshStart(factory)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('a main entry stores its Swap link with its hash, the tx_sent view shows it, and an answer with no links keeps it', async () => {
    const { client, events } = await start(
      recordingNamespaces(),
      evmTx(),
      linkedEvm,
    )

    expect(entryAt(events, 'step1:tx_sent')?.execution).toEqual({
      status: 'signed',
      result: {
        walletResult: { hash: '0xhash1' },
        checkResult: seeded(`${SCAN}/0xhash1`, 'Swap'),
      },
    })
    expect((await entriesOf(client)).s1?.execution).toEqual({
      status: 'completed',
      result: {
        walletResult: { hash: '0xhash1' },
        checkResult: {
          outputAmount: '2990',
          explorerUrl: [{ url: `${SCAN}/0xhash1`, description: 'Swap' }],
          diagnosisUrl: null,
        },
      },
    })
  })

  const templates: [string, string, string][] = [
    ['a plain URL', SCAN, `${SCAN}/0xhash1`],
    [
      "a '/{txHash}' placeholder",
      `${SCAN}/{txHash}?chain=eth`,
      `${SCAN}/0xhash1?chain=eth`,
    ],
    [
      "two '/{txHash}' placeholders",
      `${SCAN}/{txHash}/{txHash}`,
      `${SCAN}/0xhash1/{txHash}`,
    ],
    [
      "a '{txHash}' placeholder with no slash before it",
      `${SCAN}?hash={txHash}`,
      `${SCAN}?hash={txHash}/0xhash1`,
    ],
  ]

  test.each(templates)(
    'a transactionUrl with %s gives its explorer link',
    async (_name, template, url) => {
      const chains = [
        linkedChain(evmChain('ETH', '0x1'), template),
        evmBlockchains[1],
      ]
      const { events } = await start(recordingNamespaces(), evmTx(), chains)

      expect(entryAt(events, 'step1:tx_sent')?.execution.result).toEqual({
        walletResult: { hash: '0xhash1' },
        checkResult: seeded(url, 'Swap'),
      })
    },
  )

  test('the hash goes into the link as the wallet gave it, case kept', async () => {
    const port = recordingNamespaces()
    port.wallet.evm.sign.mockResolvedValueOnce({ hash: '0xAbC' })
    const { events } = await start(port, evmTx(), linkedEvm)

    expect(
      entryAt(events, 'step1:tx_sent')?.execution.result.checkResult,
    ).toEqual(seeded(`${SCAN}/0xAbC`, 'Swap'))
  })

  const unlinked: [string, Sdk.BlockchainMeta[]][] = [
    ['an empty transactionUrl', evmBlockchains],
    // A Cosmos meta may come with no info; the gate reads only its chain ID.
    [
      'no info',
      [
        {
          ...evmChain('ETH', '0x1'),
          type: LegacySdk.TransactionType.COSMOS,
          info: null,
        },
        evmBlockchains[1],
      ],
    ],
  ]

  test.each(unlinked)(
    'a blockchain with %s leaves checkResult null until the first status answer',
    async (_name, chains) => {
      const { client, events } = await start(
        recordingNamespaces(),
        evmTx(),
        chains,
      )

      expect(entryAt(events, 'step1:tx_sent')?.execution.result).toEqual({
        walletResult: { hash: '0xhash1' },
        checkResult: null,
      })
      expect(
        (await entriesOf(client)).s1?.execution.result.checkResult,
      ).toEqual({ outputAmount: '2990', explorerUrl: [], diagnosisUrl: null })
    },
  )

  test('a sign resolving hashRequiringUpdate seeds no link, and the flag is never stored', async () => {
    const port = recordingNamespaces()
    port.wallet.evm.sign.mockResolvedValueOnce({
      hash: '0xprovisional',
      hashRequiringUpdate: true,
    })
    const { client, events } = await start(port, evmTx(), linkedEvm)

    expect(entryAt(events, 'step1:tx_sent')?.execution.result).toEqual({
      walletResult: { hash: '0xprovisional' },
      checkResult: null,
    })
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.transactions.s1?.execution.result).toEqual({
      walletResult: { hash: '0xprovisional' },
      checkResult: {
        outputAmount: '2990',
        explorerUrl: [],
        diagnosisUrl: null,
      },
    })
    expect(JSON.stringify(events)).not.toContain('hashRequiringUpdate')
    expect(JSON.stringify(view)).not.toContain('hashRequiringUpdate')
  })

  test('a status answer with links replaces the seeded list whole, and a later answer with none keeps it', async () => {
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse({ explorerUrl: SOURCE }))
      .mockResolvedValue(succeeded)
    const { client } = await start(recordingNamespaces(), evmTx(), linkedEvm)

    expect((await entriesOf(client)).s1?.execution.result.checkResult).toEqual({
      outputAmount: null,
      explorerUrl: SOURCE,
      diagnosisUrl: null,
    })

    await advance(POLL_INTERVAL_MS)
    expect((await entriesOf(client)).s1?.execution).toEqual({
      status: 'completed',
      result: {
        walletResult: { hash: '0xhash1' },
        checkResult: {
          outputAmount: '2990',
          explorerUrl: SOURCE,
          diagnosisUrl: null,
        },
      },
    })
  })

  test('a link adds no event: the run emits the same events as one with no explorer', async () => {
    const { events: plain } = await start(
      recordingNamespaces(),
      evmTx(),
      evmBlockchains,
    )

    factory = new IDBFactory()
    freshStart(factory)
    const { events } = await start(recordingNamespaces(), evmTx(), linkedEvm)

    expect(events.map(nameOf)).toEqual(plain.map(nameOf))
    expect(events.map(nameOf)).toContain('step1:check_status')
  })

  test('the link builder is not exported', async () => {
    const sdk = await import('../../mod.js')

    expect(Object.keys(sdk)).not.toContain('buildCheckResultWithExplorerLink')
    expect(Object.keys(sdk)).not.toContain('buildExplorerTxUrl')
    expect(Object.keys(sdk)).not.toContain(
      'replaceLastExplorerLinkWithReplacedHash',
    )
  })

  describe('a hash replaced by wait', () => {
    const DESTINATION = [
      ...SOURCE,
      { url: 'https://explorer/2', description: 'Destination' },
    ]

    // A port whose `wait` answers `hash` instead of the signed one.
    function replacingWallet(hash = '0xreplaced') {
      const port = waitingNamespaces()
      port.wallet.evm.wait.mockResolvedValueOnce({ hash })
      return port
    }

    // Confirms and executes the one-Step Route on `blockchains`, and answers the main entry's result as the history held it at each status call.
    async function startRecording(
      port: ReturnType<typeof recordingNamespaces>,
      blockchains: readonly Sdk.BlockchainMeta[],
    ) {
      httpClient.createTransaction.mockResolvedValue(createTxResponse(evmTx()))
      const execution = await createExecutionClient(port, blockchains)
      const seen: unknown[] = []
      httpClient.checkStatus.mockImplementation(async () => {
        seen.push((await entriesOf(execution.client)).s1?.execution.result)
        return succeeded
      })
      await confirmQuote(execution.client)
      await execution.client.execute('request-1', EXECUTION_OPTIONS)
      await settle()
      return { ...execution, seen }
    }

    /*
     * Leaves the swap signed with `0xhash1` on `first`'s blockchains, with `answer` as the only status answer (none for
     * `null`), then reloads with `port` on `blockchains`.
     */
    async function reloadAfter(
      answer: LegacySdk.TransactionStatusResponse | null,
      first: {
        port: ReturnType<typeof recordingNamespaces>
        blockchains: readonly Sdk.BlockchainMeta[]
      },
      port: ReturnType<typeof recordingNamespaces>,
      blockchains: readonly Sdk.BlockchainMeta[],
    ) {
      httpClient.checkStatus.mockReset()
      httpClient.checkStatus.mockImplementation(hang)
      if (answer !== null) {
        httpClient.checkStatus.mockResolvedValueOnce(answer)
      }
      const before = await start(first.port, evmTx(), first.blockchains)
      const stored = (await entriesOf(before.client)).s1?.execution.result

      freshStart(factory)
      const reloaded = await createExecutionClient(port, blockchains)
      await reloaded.client.history.getAll()
      await settle()
      return { ...reloaded, stored }
    }

    test('overwrites the seeded Swap link with the new hash in the same write, and adds no event', async () => {
      // The same replacement on a blockchain with no explorer: the link changes the views, not the events.
      const { events: plain } = await start(
        replacingWallet(),
        evmTx(),
        evmBlockchains,
      )

      factory = new IDBFactory()
      freshStart(factory)
      const { client, events, seen } = await startRecording(
        replacingWallet(),
        linkedEvm,
      )

      const replaced = {
        outputAmount: null,
        explorerUrl: [
          { url: `${SCAN}/0xreplaced`, description: 'Replaced Swap' },
        ],
        diagnosisUrl: null,
      }
      expect(seen).toEqual([
        { walletResult: { hash: '0xreplaced' }, checkResult: replaced },
      ])
      expect(events.map(nameOf)).toEqual(plain.map(nameOf))
      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions.s1?.execution.result).toEqual({
        walletResult: { hash: '0xreplaced' },
        checkResult: { ...replaced, outputAmount: '2990' },
      })
    })

    test('adds no link to a null checkResult, with no other Blockchain list read', async () => {
      const { client, seen } = await startRecording(
        replacingWallet(),
        evmBlockchains,
      )

      expect(seen).toEqual([
        { walletResult: { hash: '0xreplaced' }, checkResult: null },
      ])
      expect(httpClient.getBlockchains).toHaveBeenCalledTimes(1)
      expect((await client.history.get('request-1'))?._queue.status).toBe(
        'SUCCESS',
      )
    })

    test('adds no link in the page run whose sign resolved hashRequiringUpdate', async () => {
      const port = replacingWallet('0xreal')
      port.wallet.evm.sign.mockResolvedValueOnce({
        hash: '0xprovisional',
        hashRequiringUpdate: true,
      })
      const { client, seen } = await startRecording(port, linkedEvm)

      expect(seen).toEqual([
        { walletResult: { hash: '0xreal' }, checkResult: null },
      ])
      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions.s1?.execution.result).toEqual({
        walletResult: { hash: '0xreal' },
        checkResult: {
          outputAmount: '2990',
          explorerUrl: [],
          diagnosisUrl: null,
        },
      })
    })

    test("after a reload, overwrites the last link of a status answer's list, though the first sign resolved hashRequiringUpdate", async () => {
      const first = waitingNamespaces()
      first.wallet.evm.sign.mockResolvedValueOnce({
        hash: '0xhash1',
        hashRequiringUpdate: true,
      })
      const port = replacingWallet('0xreal')
      const { client, stored } = await reloadAfter(
        statusResponse({ explorerUrl: DESTINATION }),
        { port: first, blockchains: linkedEvm },
        port,
        linkedEvm,
      )

      expect(stored?.checkResult?.explorerUrl).toEqual(DESTINATION)
      expect(port.wallet.evm.wait).toHaveBeenCalledTimes(1)
      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions.s1?.execution.result).toEqual({
        walletResult: { hash: '0xreal' },
        checkResult: {
          outputAmount: '2990',
          explorerUrl: [
            ...SOURCE,
            { url: `${SCAN}/0xreal`, description: 'Replaced Swap' },
          ],
          diagnosisUrl: null,
        },
      })
    })

    const noLink: [string, LegacySdk.TransactionStatusResponse | null][] = [
      ['a null checkResult', null],
      ['an empty explorer list', statusResponse()],
    ]

    test.each(noLink)(
      'with %s, a blockchain missing from the Blockchain list after a reload is handed to wait, and its replaced hash is stored and polled with no link added',
      async (_name, answer) => {
        // The first run's blockchain has no explorer, so only a status answer could store a link.
        const port = replacingWallet()
        const { client, stored } = await reloadAfter(
          answer,
          { port: waitingNamespaces(), blockchains: evmBlockchains },
          port,
          [evmBlockchains[1]],
        )

        expect(stored?.checkResult).toEqual(
          answer === null
            ? null
            : { outputAmount: null, explorerUrl: [], diagnosisUrl: null },
        )
        expect(port.wallet.evm.wait).toHaveBeenCalledTimes(1)
        expect(httpClient.checkStatus).toHaveBeenLastCalledWith({
          requestId: 'request-1',
          step: 1,
          txId: '0xreplaced',
        })
        const view = await client.history.get('request-1')
        expect(view?._queue.status).toBe('SUCCESS')
        expect(view?._storage.transactions.s1?.execution.result).toEqual({
          walletResult: { hash: '0xreplaced' },
          checkResult: {
            outputAmount: '2990',
            explorerUrl: [],
            diagnosisUrl: null,
          },
        })
      },
    )

    test('with a stored link, a blockchain missing from the Blockchain list after a reload fails the swap on a replaced hash, with the new hash not stored', async () => {
      const port = replacingWallet()
      const { client, stored } = await reloadAfter(
        statusResponse({ explorerUrl: DESTINATION }),
        { port: waitingNamespaces(), blockchains: linkedEvm },
        port,
        [evmBlockchains[1]],
      )

      expect(port.wallet.evm.wait).toHaveBeenCalledTimes(1)
      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: ETH is not in the Blockchain list.',
        detail: null,
      })
      expect(view?._storage.transactions.s1?.execution.result).toEqual(stored)
    })
  })
})
