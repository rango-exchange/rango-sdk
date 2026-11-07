// Hyperliquid: the action signed through `signTypedData` on its `signatureChainId`, posted to the exchange and found in the explorer by its nonce, driven through the public client over fake-indexeddb, with the timers and `fetch` faked.
import 'fake-indexeddb/auto'

import type { HyperliquidTx } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  callOf,
  chain,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmBlockchains,
  EXECUTION_OPTIONS,
  expectNotReported,
  explorerAnswer,
  historyOf,
  httpClient,
  httpError,
  HYPERLIQUID_EXCHANGE_URL,
  HYPERLIQUID_EXPLORER_URL,
  HYPERLIQUID_NONCE,
  hyperliquidTx,
  hyperliquidTypedData,
  nameOf,
  recordingNamespaces,
  resetHttpClient,
  SELECTED_WALLETS,
  settle,
  SIGNATURE_CHAIN_ID,
  SIGNATURE_R,
  SIGNATURE_S,
  signatureWith,
  stubHyperliquid,
  succeeded,
  switchingNamespaces,
  typedSigningNamespaces,
  waitingNamespaces,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000

const HASH = '0xhyperhash'

const SERVICE_UNAVAILABLE = 503

// The `v` a signature's recovery byte is posted as.
const V_EVEN = 27
const V_ODD = 28

// Four explorer misses, then the answer holding the action.
const EXPLORER_ANSWERS = 5

// A Blockchain list whose Hyperliquid chain has no chain ID.
const chains = [
  ...evmBlockchains,
  chain('HYPERLIQUID', ['^(0x)[0-9A-Fa-f]{40}$']),
]

let factory = new IDBFactory()

// A fresh module graph and `httpClient` mock, on this database.
function freshStart(on: IDBFactory): void {
  vi.resetModules()
  resetHttpClient()
  globalThis.indexedDB = on
  httpClient.checkStatus.mockResolvedValue(succeeded)
  httpClient.reportFailure.mockResolvedValue(undefined)
}

// A port on `signatureChainId` with `signTypedData` on hyperliquid and `wait` on evm, whose evm `sign` and `wait` must stay unused.
function hyperliquidWallet(
  signatures?: Parameters<typeof typedSigningNamespaces>[1],
) {
  return typedSigningNamespaces(
    waitingNamespaces({ HYPERLIQUID: SIGNATURE_CHAIN_ID }),
    signatures,
  )
}

// Confirms a one-Step Route whose transaction is `tx`, executes it and runs every pending step.
async function start(
  port: ReturnType<typeof recordingNamespaces>,
  tx: HyperliquidTx = hyperliquidTx(),
  blockchains: readonly Sdk.BlockchainMeta[] = chains,
) {
  httpClient.createTransaction.mockResolvedValue(createTxResponse(tx))
  const execution = await createExecutionClient(port, blockchains)
  await confirmQuote(execution.client)
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return execution
}

describe('Hyperliquid', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    freshStart(factory)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const actions: [HyperliquidTx['action']['type'], string][] = [
    ['withdraw3', 'HyperliquidTransaction:Withdraw'],
    ['usdSend', 'HyperliquidTransaction:UsdSend'],
  ]

  test.each(actions)(
    'a %s is signed through signTypedData on its signatureChainId, posted, found by its nonce and ends SUCCESS',
    async (type, primaryType) => {
      const hyperliquid = stubHyperliquid({
        explorer: [explorerAnswer(HASH, type)],
      })
      const port = hyperliquidWallet()
      const tx = hyperliquidTx(type)
      const { client } = await start(port, tx)

      const typedData = hyperliquidTypedData(primaryType)
      expect(port.requests).toEqual([
        ['hyperliquid', 'getChainId', undefined],
        [
          'hyperliquid',
          'signTypedData',
          {
            typedData: {
              domain: typedData.domain,
              types: { [primaryType]: typedData.types[primaryType] },
              value: typedData.message,
            },
            chainId: SIGNATURE_CHAIN_ID,
          },
        ],
      ])
      expect(hyperliquid.posts).toEqual([
        {
          url: HYPERLIQUID_EXCHANGE_URL,
          body: {
            action: tx.action,
            signature: {
              r: SIGNATURE_R,
              s: SIGNATURE_S,
              v: V_EVEN,
            },
            nonce: HYPERLIQUID_NONCE,
          },
        },
        {
          url: HYPERLIQUID_EXPLORER_URL,
          body: { type: 'userDetails', user: '0xhyperliquid' },
        },
      ])
      expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
      expect(httpClient.checkStatus).toHaveBeenCalledWith({
        requestId: 'request-1',
        step: 1,
        txId: HASH,
      })
      expect(port.wallet.evm.sign).not.toHaveBeenCalled()
      expect(port.wallet.evm.wait).not.toHaveBeenCalled()
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions.s1?.execution).toEqual({
        status: 'completed',
        result: {
          walletResult: { hash: HASH },
          checkResult: {
            outputAmount: '2990',
            explorerUrl: [],
            diagnosisUrl: null,
          },
        },
      })
    },
  )

  test.each([
    ['00', V_EVEN],
    ['01', V_ODD],
    ['1b', V_EVEN],
    ['1c', V_ODD],
  ])('a signature ending in %s is posted with v %i', async (ending, v) => {
    const hyperliquid = stubHyperliquid()
    await start(hyperliquidWallet([signatureWith(ending)]))

    expect(hyperliquid.posts[0]?.body).toMatchObject({ signature: { v } })
  })

  test('the action is gated on its connection: getAccounts is asked on hyperliquid, and null blocks NOT_CONNECTED with nothing signed or posted', async () => {
    const port = hyperliquidWallet()
    port.wallet.hyperliquid.getAccounts.mockResolvedValue(null)
    const hyperliquid = stubHyperliquid()
    const { client } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'HYPERLIQUID', address: '0xhyperliquid' },
    })
    expect(port.wallet.hyperliquid.getAccounts.mock.calls).toEqual([[]])
    expect(port.requests).toEqual([])
    expect(hyperliquid.posts).toEqual([])
  })

  describe('the network gate', () => {
    test('a wrong chain is switched to the signatureChainId on hyperliquid, then signed', async () => {
      stubHyperliquid()
      const port = typedSigningNamespaces(
        switchingNamespaces({ HYPERLIQUID: '0x1' }),
      )
      const { client } = await start(port)

      expect(port.requests.map(callOf)).toEqual([
        'getChainId',
        'switchChain',
        'getChainId',
        'signTypedData',
      ])
      expect(port.requests[1]).toEqual([
        'hyperliquid',
        'switchChain',
        { chainId: SIGNATURE_CHAIN_ID },
      ])
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })

    test('a chain still wrong blocks NETWORK_MISMATCH on the signatureChainId, with nothing signed or posted', async () => {
      const hyperliquid = stubHyperliquid()
      const stuck = recordingNamespaces({ HYPERLIQUID: '0x1' })
      const port = typedSigningNamespaces({
        wallet: {
          ...stuck.wallet,
          hyperliquid: {
            ...stuck.wallet.hyperliquid,
            switchChain: vi.fn(async () => undefined),
          },
        },
        requests: stuck.requests,
      })
      const { client } = await start(port)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'NETWORK_MISMATCH',
        metadata: {
          blockchain: 'HYPERLIQUID',
          address: '0xhyperliquid',
          requiredChainId: SIGNATURE_CHAIN_ID,
        },
      })
      expect(view?._storage.failure).toBeNull()
      expect(port.wallet.hyperliquid.signTypedData).not.toHaveBeenCalled()
      expect(hyperliquid.posts).toEqual([])
    })

    test('a rejected first getChainId is switched to the signatureChainId on hyperliquid, read again, then signed', async () => {
      stubHyperliquid()
      const port = typedSigningNamespaces(
        switchingNamespaces({ HYPERLIQUID: '0x1' }),
      )
      port.wallet.hyperliquid.getChainId.mockRejectedValueOnce(
        new Error('no provider'),
      )
      const { client } = await start(port)

      expect(port.requests.map(callOf)).toEqual([
        'switchChain',
        'getChainId',
        'signTypedData',
      ])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.failure).toBeNull()
    })

    test('a rejected getChainId, after one switch, blocks NETWORK_MISMATCH on the signatureChainId, with nothing failed, reported, signed or posted', async () => {
      const hyperliquid = stubHyperliquid()
      const port = hyperliquidWallet()
      port.wallet.hyperliquid.getChainId.mockRejectedValue(
        new Error('no provider'),
      )
      const { client } = await start(port)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'NETWORK_MISMATCH',
        metadata: {
          blockchain: 'HYPERLIQUID',
          address: '0xhyperliquid',
          requiredChainId: SIGNATURE_CHAIN_ID,
        },
      })
      expect(view?._storage.failure).toBeNull()
      const { getChainId, switchChain } = port.wallet.hyperliquid
      const [first, second] = getChainId.mock.invocationCallOrder
      const [switched] = switchChain.mock.invocationCallOrder
      expect(getChainId).toHaveBeenCalledTimes(2)
      expect(switchChain.mock.calls).toEqual([
        [{ chainId: SIGNATURE_CHAIN_ID }],
      ])
      expect(first).toBeLessThan(switched)
      expect(switched).toBeLessThan(second)
      expect(port.wallet.hyperliquid.signTypedData).not.toHaveBeenCalled()
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
      expect(hyperliquid.posts).toEqual([])
    })

    test('a Blockchain list whose Hyperliquid chain has no chain ID does not fail the entry: it gates on the signatureChainId', async () => {
      stubHyperliquid()
      const port = hyperliquidWallet()
      const { client } = await start(port, hyperliquidTx(), chains)

      expect(port.requests.map(callOf)).toEqual(['getChainId', 'signTypedData'])
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })

    test('a Blockchain list with no Hyperliquid chain signs and posts the entry, then fails CLIENT_UNEXPECTED_BEHAVIOUR once its hash is found, stored and not reported, with the hash not stored', async () => {
      const hyperliquid = stubHyperliquid()
      const port = hyperliquidWallet()
      const { client, events } = await start(
        port,
        hyperliquidTx(),
        evmBlockchains,
      )

      expect(port.requests.map(callOf)).toEqual(['getChainId', 'signTypedData'])
      expect(hyperliquid.posts.map(({ url }) => url)).toEqual([
        HYPERLIQUID_EXCHANGE_URL,
        HYPERLIQUID_EXPLORER_URL,
      ])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: HYPERLIQUID is not in the Blockchain list.',
        detail: null,
      })
      expect(
        view?._storage.transactions.s1?.execution.result.walletResult,
      ).toBeNull()
      expect(httpClient.checkStatus).not.toHaveBeenCalled()
      expectNotReported(events)
    })

    test('a Blockchain list that fails to load signs and posts the entry, then fails CLIENT_UNEXPECTED_BEHAVIOUR with its message once its hash is found, stored and not reported, with the hash not stored', async () => {
      const hyperliquid = stubHyperliquid()
      const port = hyperliquidWallet()
      httpClient.createTransaction.mockResolvedValue(
        createTxResponse(hyperliquidTx()),
      )
      const { client, events } = await createExecutionClient(port, chains)
      httpClient.getBlockchains.mockReset()
      httpClient.getBlockchains.mockRejectedValue(
        httpError(SERVICE_UNAVAILABLE, { error: 'meta API down' }),
      )
      await confirmQuote(client)
      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()

      expect(port.requests.map(callOf)).toEqual(['getChainId', 'signTypedData'])
      expect(hyperliquid.posts.map(({ url }) => url)).toEqual([
        HYPERLIQUID_EXCHANGE_URL,
        HYPERLIQUID_EXPLORER_URL,
      ])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'meta API down',
        detail: null,
      })
      expect(
        view?._storage.transactions.s1?.execution.result.walletResult,
      ).toBeNull()
      expect(httpClient.checkStatus).not.toHaveBeenCalled()
      expectNotReported(events)
    })
  })

  test('the posted entry is signed with a null hash until the explorer has its nonce, retried every POLL_INTERVAL_MS, then polled with that hash', async () => {
    const hyperliquid = stubHyperliquid({
      explorer: [
        { type: 'userDetails', txs: [] },
        new Error('Explorer down'),
        explorerAnswer('0xearlier', 'withdraw3', HYPERLIQUID_NONCE - 1),
        explorerAnswer('0xspot', 'spotSend'),
        explorerAnswer(HASH),
      ],
    })
    const port = hyperliquidWallet()
    const { client, events } = await start(port)

    const explorerCalls = () =>
      hyperliquid.posts.filter(({ url }) => url === HYPERLIQUID_EXPLORER_URL)
    expect(explorerCalls()).toHaveLength(1)
    expect(
      (await historyOf(client))?._storage.transactions.s1?.execution,
    ).toEqual({
      status: 'signed',
      result: { walletResult: null, checkResult: null },
    })
    expect(
      events.map(nameOf).filter((name) => name.startsWith('step1:')),
    ).toEqual([
      'step1:started',
      'step1:create_tx',
      'step1:send_tx',
      'step1:tx_sent',
      'step1:check_status',
    ])

    // The first answer had no transactions; then a rejection, an earlier nonce and another action type.
    for (const misses of ['rejected', 'earlier', 'spotSend']) {
      const before = explorerCalls().length
      await advance(POLL_INTERVAL_MS)
      expect(explorerCalls(), misses).toHaveLength(before + 1)
      expect(httpClient.checkStatus).not.toHaveBeenCalled()
    }

    await advance(POLL_INTERVAL_MS)
    expect(explorerCalls()).toHaveLength(EXPLORER_ANSWERS)
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)
    expect(httpClient.checkStatus).toHaveBeenCalledWith({
      requestId: 'request-1',
      step: 1,
      txId: HASH,
    })
    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: HASH })
  })

  test('a port without hyperliquid Blocks NOT_CONNECTED with no port call, and nothing posted', async () => {
    const hyperliquid = stubHyperliquid()
    const { wallet, requests } = waitingNamespaces({
      HYPERLIQUID: SIGNATURE_CHAIN_ID,
    })
    const port = { wallet: { evm: wallet.evm }, requests }
    httpClient.createTransaction.mockResolvedValue(
      createTxResponse(hyperliquidTx()),
    )
    const { client } = await createExecutionClient(port, chains)
    await confirmQuote(client)
    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'HYPERLIQUID', address: '0xhyperliquid' },
    })
    expect(view?._storage.failure).toBeNull()
    expect(requests).toEqual([])
    expect(wallet.evm.getAccounts).not.toHaveBeenCalled()
    expect(hyperliquid.posts).toEqual([])
  })

  test("an exchange answer that is not ok fails CLIENT_UNEXPECTED_BEHAVIOUR, reported with the HYPERLIQUID wallet's Wallet ID and with no hash looked up", async () => {
    const hyperliquid = stubHyperliquid({
      exchange: { status: 'err', response: 'Insufficient balance' },
    })
    const port = hyperliquidWallet()
    const { client } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toMatchObject({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'Unexpected Error: Failed to initiate withdrawal.',
    })
    expect(hyperliquid.posts.map(({ url }) => url)).toEqual([
      HYPERLIQUID_EXCHANGE_URL,
    ])
    expect(httpClient.checkStatus).not.toHaveBeenCalled()
    expect(httpClient.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 1,
        eventType: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        tags: { wallet: SELECTED_WALLETS.HYPERLIQUID.walletId },
      }),
    )
  })

  test('a plain Error rejection of signTypedData is stored as CLIENT_UNEXPECTED_BEHAVIOUR with its message and a null detail, and is not reported', async () => {
    const hyperliquid = stubHyperliquid()
    const port = hyperliquidWallet([new Error('wallet exploded')])
    const { client, events } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'wallet exploded',
      detail: null,
    })
    expect(hyperliquid.posts).toEqual([])
    expectNotReported(events)
  })

  describe('after a reload', () => {
    test('an entry left sign_requested fails TX_EXPIRED and is reported, with signTypedData never called again', async () => {
      const hyperliquid = stubHyperliquid()
      const first = hyperliquidWallet()
      // The prompt never settles: the queue stays RUNNING with its entry sign_requested.
      first.wallet.hyperliquid.signTypedData.mockReturnValue(
        new Promise(() => undefined),
      )
      const { client } = await start(first)
      expect(
        (await historyOf(client))?._storage.transactions.s1?.execution,
      ).toEqual({
        status: 'sign_requested',
        result: { walletResult: null, checkResult: null },
      })

      freshStart(factory)
      const port = hyperliquidWallet()
      const { client: loaded } = await createExecutionClient(port, chains)
      await loaded.history.getAll()
      await settle()

      const view = await historyOf(loaded)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toMatchObject({
        reasonCode: 'TX_EXPIRED',
        message: 'Transaction is expired. Please try again.',
      })
      expect(httpClient.reportFailure).toHaveBeenCalledWith(
        expect.objectContaining({ step: 1, eventType: 'TX_EXPIRED' }),
      )
      expect(port.wallet.hyperliquid.signTypedData).not.toHaveBeenCalled()
      expect(hyperliquid.posts).toEqual([])
    })

    test('a posted entry with no hash yet looks it up by its nonce and is polled, with nothing signed or posted again', async () => {
      const first = stubHyperliquid({
        explorer: [{ type: 'userDetails', txs: [] }],
      })
      const { client } = await start(hyperliquidWallet())
      expect(
        (await historyOf(client))?._storage.transactions.s1?.execution,
      ).toEqual({
        status: 'signed',
        result: { walletResult: null, checkResult: null },
      })
      expect(first.posts.map(({ url }) => url)).toEqual([
        HYPERLIQUID_EXCHANGE_URL,
        HYPERLIQUID_EXPLORER_URL,
      ])

      freshStart(factory)
      const hyperliquid = stubHyperliquid()
      const port = hyperliquidWallet()
      const { client: loaded } = await createExecutionClient(port, chains)
      await loaded.history.getAll()
      await settle()

      expect(port.requests).toEqual([])
      expect(hyperliquid.posts.map(({ url }) => url)).toEqual([
        HYPERLIQUID_EXPLORER_URL,
      ])
      expect(httpClient.checkStatus).toHaveBeenCalledWith({
        requestId: 'request-1',
        step: 1,
        txId: HASH,
      })
      expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
    })

    test('a posted entry with no hash yet reads the Blockchain list only once its hash is found: one with no Hyperliquid chain fails CLIENT_UNEXPECTED_BEHAVIOUR, stored and not reported, with the hash not stored', async () => {
      stubHyperliquid({ explorer: [{ type: 'userDetails', txs: [] }] })
      await start(hyperliquidWallet())

      freshStart(factory)
      const hyperliquid = stubHyperliquid()
      const port = hyperliquidWallet()
      const { client: loaded, events } = await createExecutionClient(
        port,
        evmBlockchains,
      )
      await loaded.history.getAll()
      await settle()

      expect(port.requests).toEqual([])
      expect(hyperliquid.posts.map(({ url }) => url)).toEqual([
        HYPERLIQUID_EXPLORER_URL,
      ])
      expect(httpClient.getBlockchains).toHaveBeenCalledTimes(1)
      const view = await historyOf(loaded)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Unexpected Error: HYPERLIQUID is not in the Blockchain list.',
        detail: null,
      })
      expect(
        view?._storage.transactions.s1?.execution.result.walletResult,
      ).toBeNull()
      expect(httpClient.checkStatus).not.toHaveBeenCalled()
      expectNotReported(events)
    })
  })
})
