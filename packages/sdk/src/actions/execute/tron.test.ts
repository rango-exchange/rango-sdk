// TRON: the main transaction signed with no network gate, and the port-built approve with its met test, proof and allowance confirmation, driven through the public client over fake-indexeddb, with the timers faked.
import 'fake-indexeddb/auto'

import type { TronApprove } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  callOf,
  chain,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmBlockchains,
  EXECUTION_OPTIONS,
  expectNotReported,
  historyOf,
  httpClient,
  recordingNamespaces,
  resetHttpClient,
  settle,
  succeeded,
  switchingNamespaces,
  TRON_CHAIN_ID,
  tronChain,
  tronTx,
  waitingNamespaces,
} from '../../../tests/support.js'

const chains = [...evmBlockchains, tronChain()]

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
})
