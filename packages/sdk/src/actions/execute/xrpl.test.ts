// XRPL: the `Payment` signed with no network gate, and the SDK-built `TrustSet` with its met test and proof, driven through the public client over fake-indexeddb, with the timers faked.
import 'fake-indexeddb/auto'

import type { XrplTrustline } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  callOf,
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
  waitingNamespaces,
  xrplChain,
  xrplTx,
} from '../../../tests/support.js'

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
})
