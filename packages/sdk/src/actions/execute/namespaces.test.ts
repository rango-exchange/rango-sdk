// The wallets by namespace: each entry goes to its own namespace, and a missing namespace fails the Execution as no wallet does, over fake-indexeddb.
import 'fake-indexeddb/auto'

import type {
  NamespacePort,
  Namespaces,
  RecordedEvent,
} from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  activeAccounts,
  BSC_ASSET,
  cacheQuote,
  chain,
  confirmQuote,
  confirmResponse,
  createExecutionClient,
  createTxResponse,
  distinctQueries,
  evmBlockchains,
  evmChain,
  evmTx,
  EXECUTION_OPTIONS,
  expectNotReported,
  hang,
  historyOf,
  httpClient,
  httpError,
  loadSdk,
  nameOf,
  onEthAndBsc,
  recordingEmitter,
  recordingNamespaces,
  reloadOn,
  scriptCreateTransaction,
  SELECTED_WALLETS,
  settle,
  succeeded,
  swap,
  transferTx,
  tronChain,
  waitingNamespaces,
} from '../../../tests/support.js'

const SERVICE_UNAVAILABLE = 503
const TWO_STEPS = [swap(), swap({ from: BSC_ASSET, to: BSC_ASSET })]

// An EVM entry on each blockchain, for an evm map with only `default`.
const TX_BY_DEFAULT_BLOCKCHAIN: [string, LegacySdk.Transaction][] = [
  ['ETH', evmTx()],
  ['BSC', evmTx({ blockChain: 'BSC', from: '0xto' })],
]

type TxOf<T extends LegacySdk.TransactionType> = Extract<
  LegacySdk.Transaction,
  { type: T }
>

// A Blockchain list entry for `name`, with no chain ID: the SDK picks the namespace by the transaction's type, not this.
function chainOf(name: string): Sdk.BlockchainMeta {
  return chain(name, [])
}

const solanaTx: TxOf<LegacySdk.TransactionType.SOLANA> = {
  type: LegacySdk.TransactionType.SOLANA,
  blockChain: 'SOLANA',
  prerequisites: [],
  txType: 'LEGACY',
  from: 'SoLfrom',
  identifier: 'solana-tx',
  recentBlockhash: null,
  signatures: [],
  serializedMessage: null,
  instructions: [],
}
const starknetTx: TxOf<LegacySdk.TransactionType.STARKNET> = {
  type: LegacySdk.TransactionType.STARKNET,
  blockChain: 'STARKNET',
  prerequisites: [],
  isApprovalTx: false,
  calls: [],
}
const tonTx: TxOf<LegacySdk.TransactionType.TON> = {
  type: LegacySdk.TransactionType.TON,
  blockChain: 'TON',
  prerequisites: [],
  validUntil: 1_700_000_000,
  messages: [],
}
const suiTx: TxOf<LegacySdk.TransactionType.SUI> = {
  type: LegacySdk.TransactionType.SUI,
  blockChain: 'SUI',
  prerequisites: [],
  unsignedPtbBase64: 'AAAA',
}

// The single-chain namespaces' wallets, beside the support ones.
const WALLETS = {
  ...SELECTED_WALLETS,
  SOLANA: { address: 'SoLfrom', walletId: 'phantom' },
  STARKNET: { address: '0xstarknet', walletId: 'argent' },
  TON: { address: 'UQton', walletId: 'tonkeeper' },
  SUI: { address: '0xsui', walletId: 'suiet' },
}
const chains = [
  ...evmBlockchains,
  tronChain(),
  chainOf('SOLANA'),
  chainOf('STARKNET'),
  chainOf('TON'),
  chainOf('SUI'),
]

let factory = new IDBFactory()

// A recording port whose `getAccount` answers every wallet in WALLETS.
function namespacesPort() {
  return recordingNamespaces(undefined, {
    ...activeAccounts(),
    ...Object.fromEntries(
      Object.entries(WALLETS).map(([blockchain, { address }]) => [
        blockchain,
        address,
      ]),
    ),
  })
}

// Confirms a one-Step Route with WALLETS whose transaction is `tx`, executes it and runs every pending step.
async function start(client: Sdk.RangoClient, tx: LegacySdk.Transaction) {
  httpClient.createTransaction.mockResolvedValue(createTxResponse(tx))
  await cacheQuote(client)
  httpClient.confirmRoute.mockResolvedValueOnce(confirmResponse('request-1'))
  await client.confirm('request-1', WALLETS)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
}

/*
 * A client whose `execution` has a recording emitter and a `getWallet` that answers from `wallets()` on every
 * call, on a Blockchain list of `blockchains`.
 */
async function connectingClient(
  wallets: () => Partial<Sdk.WalletByNamespace>,
  blockchains: readonly Sdk.BlockchainMeta[] = chains,
) {
  const { RangoClient } = await loadSdk()
  httpClient.getBlockchains.mockResolvedValue([...blockchains])
  const { emitter, events } = recordingEmitter()
  const client = new RangoClient({
    apiKey: 'test-key',
    execution: { emitter, getWallet: ({ namespace }) => wallets()[namespace] },
  })
  return { client, events }
}

// Expects the Execution failed, unreported, on getWallet answering no `namespace` wallet for `blockchain`.
async function expectFailedOnNoWallet(
  client: Sdk.RangoClient,
  events: RecordedEvent[],
  namespace: Sdk.Namespace,
  blockchain: string,
): Promise<void> {
  const view = await historyOf(client)
  expect(view?._queue.status).toBe('FAILED')
  expect(view?._queue.blocked).toBeNull()
  expect(view?._storage.failure).toEqual({
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message: `Unexpected Error: getWallet answered no ${namespace} wallet for ${blockchain}.`,
    detail: null,
  })
  expectNotReported(events)
}

describe('the wallets by namespace', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a route on BSC is gated and signed on a flat evm wallet on BSC with only the transaction and no chain ID', async () => {
    const port = recordingNamespaces(
      { ETH: '0x38' },
      { ...activeAccounts(), ETH: '0xto' },
    )
    const { client } = await createExecutionClient(port, chains)
    const tx = evmTx({ blockChain: 'BSC', from: '0xto' })

    await start(client, tx)

    expect(port.wallet.evm.getAccount).toHaveBeenCalledWith()
    expect(port.requests).toEqual([
      ['evm', 'getChainId', undefined],
      ['evm', 'signAndSend', { tx }],
    ])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  const singleChain: [string, LegacySdk.Transaction][] = [
    ['solana', solanaTx],
    ['starknet', starknetTx],
    ['ton', tonTx],
    ['sui', suiTx],
  ]

  test.each(singleChain)(
    'a %s entry is gated and signed on its own namespace with only the transaction, and ends SUCCESS',
    async (namespace, tx) => {
      const port = namespacesPort()
      const { client } = await createExecutionClient(port, chains)

      await start(client, tx)

      expect(port.requests).toEqual([[namespace, 'signAndSend', { tx }]])
      expect(port.wallet.evm.getAccount).not.toHaveBeenCalled()
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    },
  )

  test('a route whose namespace the port lacks fails, unreported, with no port call', async () => {
    const port = namespacesPort()
    const { client, events } = await connectingClient(() => ({
      evm: port.wallet.evm,
      tron: port.wallet.tron,
    }))

    await start(client, solanaTx)

    await expectFailedOnNoWallet(client, events, 'solana', 'SOLANA')
    expect(port.requests).toEqual([])
    expect(port.wallet.evm.getAccount).not.toHaveBeenCalled()
    expect(port.wallet.solana.getAccount).not.toHaveBeenCalled()
  })

  describe('a signed EVM main entry reloaded', () => {
    // Signs the EVM main entry on a `wait` that never resolves, then reloads.
    async function signedThenReloaded() {
      httpClient.checkStatus.mockImplementation(hang)
      const first = waitingNamespaces()
      first.wallet.evm.wait.mockImplementation(hang)
      const { client } = await createExecutionClient(first)
      await confirmQuote(client)
      httpClient.createTransaction.mockResolvedValue(createTxResponse(evmTx()))
      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()
      expect(
        (await historyOf(client))?._storage.transactions.s1?.execution.status,
      ).toBe('signed')
      reloadOn(factory)
      httpClient.checkStatus.mockReset()
      httpClient.checkStatus.mockResolvedValue(succeeded)
      httpClient.reportFailure.mockResolvedValue(undefined)
    }

    test('on a port without evm fails, unreported, with no port call and no status check', async () => {
      await signedThenReloaded()
      const port = waitingNamespaces()
      const { client: loaded, events } = await connectingClient(
        () => ({ tron: port.wallet.tron }),
        evmBlockchains,
      )
      await loaded.history.getAll()
      await settle()

      await expectFailedOnNoWallet(loaded, events, 'evm', 'ETH')
      expect(port.requests).toEqual([])
      expect(httpClient.checkStatus).not.toHaveBeenCalled()
    })

    test('on a Blockchain list whose entry has no chain ID is handed to wait, and its same hash is polled to SUCCESS', async () => {
      await signedThenReloaded()
      const port = waitingNamespaces()
      const { client: loaded } = await connectingClient(
        () => port.wallet,
        [evmChain('ETH', ''), evmChain('BSC', '0x38')],
      )
      await loaded.history.getAll()
      await settle()

      expect(port.requests).toEqual([
        ['evm', 'wait', { hash: '0xhash1', response: undefined }],
      ])
      expect(httpClient.checkStatus.mock.calls.map(([req]) => req)).toEqual([
        { requestId: 'request-1', step: 1, txId: '0xhash1' },
      ])
      expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
    })
  })

  describe('a wallet per blockchain on evm and bip122, as getWallet answers by the queried blockchain', () => {
    // `port` with `evm` and `bip122` as given, keeping its other namespaces and its requests.
    function withWallets(
      port: ReturnType<typeof namespacesPort>,
      wallets: Pick<Namespaces, 'evm' | 'bip122'>,
    ): NamespacePort {
      return { wallet: { ...port.wallet, ...wallets }, requests: port.requests }
    }

    const ltcTransfer = transferTx({
      blockChain: 'LTC',
      asset: { blockchain: 'LTC', symbol: 'LTC', address: null, ticker: 'LTC' },
      fromWalletAddress: 'ltc1from',
      recipientAddress: 'ltc1to',
    })

    const utxoChains = [
      ...chains,
      chain('BTC', ['^bc1']),
      chain('LTC', ['^ltc1']),
    ]

    // A `wait` that records nothing and resolves with the hash it got.
    function passingWait() {
      return vi.fn(async (req: { hash: string; response?: unknown }) => ({
        hash: req.hash,
      }))
    }

    test("an evm map with ETH and BSC wallets signs each step with its own blockchain's wallet, and the other gets no call for it", async () => {
      const port = onEthAndBsc(namespacesPort())
      const { eth, bsc } = port
      const { client } = await createExecutionClient(port, chains)
      scriptCreateTransaction()
      await confirmQuote(client, 'request-1', TWO_STEPS)
      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()

      const step2 = evmTx({ blockChain: 'BSC', from: '0xto', data: '0xdata2' })
      expect(eth.getAccount).toHaveBeenCalledTimes(1)
      expect(eth.signAndSend.mock.calls).toEqual([[{ tx: evmTx() }]])
      expect(bsc.getAccount).toHaveBeenCalledTimes(1)
      expect(bsc.signAndSend.mock.calls).toEqual([[{ tx: step2 }]])
      expect(port.requests).toEqual([
        ['evm', 'getChainId', undefined],
        ['evm', 'signAndSend', { tx: evmTx() }],
        ['evm', 'getChainId', undefined],
        ['evm', 'signAndSend', { tx: step2 }],
      ])
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })

    test.each(TX_BY_DEFAULT_BLOCKCHAIN)(
      'an evm map with only default signs an entry on %s with it',
      async (blockchain, tx) => {
        const port = namespacesPort()
        const wallet = port.evmOn(blockchain)
        const { client } = await createExecutionClient(
          withWallets(port, { evm: { default: wallet } }),
          chains,
        )

        await start(client, tx)

        expect(wallet.signAndSend.mock.calls).toEqual([[{ tx }]])
        expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      },
    )

    test("an evm map with neither the entry's blockchain nor default fails as a missing evm does, with no port call", async () => {
      const port = namespacesPort()
      const bsc = port.evmOn('BSC')
      const { client, events } = await createExecutionClient(
        withWallets(port, { evm: { BSC: bsc } }),
        chains,
      )

      await start(client, evmTx())

      await expectFailedOnNoWallet(client, events, 'evm', 'ETH')
      expect(bsc.getAccount).not.toHaveBeenCalled()
      expect(port.requests).toEqual([])
    })

    test("a bip122 map with BTC and LTC wallets signs each TRANSFER with its own blockchain's wallet", async () => {
      const port = recordingNamespaces(undefined, {
        ...activeAccounts(),
        LTC: 'ltc1from',
      })
      const btc = port.bip122On('BTC')
      const ltc = port.bip122On('LTC')
      const { client } = await createExecutionClient(
        withWallets(port, { bip122: { BTC: btc, LTC: ltc } }),
        utxoChains,
      )
      const onBtc = transferTx()
      const onLtc = ltcTransfer
      httpClient.createTransaction.mockImplementation(
        async ({ step }: { step: number }) =>
          createTxResponse(step === 1 ? onBtc : onLtc),
      )
      await confirmQuote(client, 'request-1', TWO_STEPS)
      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()

      expect(btc.getAccount).toHaveBeenCalledTimes(1)
      expect(btc.signAndSend.mock.calls).toEqual([[{ tx: onBtc }]])
      expect(ltc.getAccount).toHaveBeenCalledTimes(1)
      expect(ltc.signAndSend.mock.calls).toEqual([[{ tx: onLtc }]])
      expect(port.wallet.bip122.getAccount).not.toHaveBeenCalled()
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })

    test("a flat bip122 wallet whose address differs from a second UTXO blockchain's selected address Blocks that entry ACCOUNT_MISMATCH, with nothing signed", async () => {
      const port = namespacesPort()
      const { client } = await createExecutionClient(port, utxoChains)

      await start(client, ltcTransfer)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'ACCOUNT_MISMATCH',
        metadata: { blockchain: 'LTC', address: 'ltc1from' },
      })
      expect(port.wallet.bip122.getAccount).toHaveBeenCalledTimes(1)
      expect(port.requests).toEqual([])
    })

    test("an EVM entry under an evm map waits on the wallet that signed it, not on another blockchain's", async () => {
      const port = namespacesPort()
      const eth = { ...port.evmOn('ETH'), wait: passingWait() }
      const bsc = { ...port.evmOn('BSC'), wait: passingWait() }
      const { client } = await createExecutionClient(
        withWallets(port, { evm: { ETH: eth, BSC: bsc } }),
        chains,
      )

      await start(client, evmTx())

      expect(eth.wait.mock.calls).toEqual([
        [{ hash: '0xhash1', response: undefined }],
      ])
      expect(bsc.wait).not.toHaveBeenCalled()
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })

    test("an EVM entry under an evm map whose signing wallet has no wait polls its hash as it is, though another blockchain's wallet has wait", async () => {
      const port = namespacesPort()
      const eth = port.evmOn('ETH')
      const bsc = { ...port.evmOn('BSC'), wait: passingWait() }
      const { client } = await createExecutionClient(
        withWallets(port, { evm: { ETH: eth, BSC: bsc } }),
        chains,
      )

      await start(client, evmTx())

      expect(eth.signAndSend).toHaveBeenCalledTimes(1)
      expect(bsc.wait).not.toHaveBeenCalled()
      expect(httpClient.checkStatus.mock.calls.map(([req]) => req)).toEqual([
        { requestId: 'request-1', step: 1, txId: '0xhash1' },
      ])
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    })
  })

  /*
   * Only an EVM entry reads the Blockchain list at the gate: every other namespace's gate runs first, and its list read
   * comes after the gate passes, before `sign_requested`.
   */
  describe('the Blockchain list against the gate', () => {
    // Makes every Blockchain list load from here on reject.
    function failListLoads(): void {
      httpClient.getBlockchains.mockReset()
      httpClient.getBlockchains.mockRejectedValue(
        httpError(SERVICE_UNAVAILABLE, { error: 'meta API down' }),
      )
    }

    test('a SOLANA entry whose active account is another address Blocks while the list fails to load, with no failure stored', async () => {
      const connected = recordingNamespaces(undefined, {
        ...activeAccounts(),
        SOLANA: 'SoLother',
      }).wallet
      const { client } = await connectingClient(() => connected)
      failListLoads()

      await start(client, solanaTx)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'ACCOUNT_MISMATCH',
        metadata: { blockchain: 'SOLANA', address: 'SoLfrom' },
      })
      expect(view?._storage.failure).toBeNull()
      expect(view?._storage.transactions.s1?.execution.status).toBe(
        'not_started',
      )
    })

    test("a SOLANA entry that passes the gate fails CLIENT_UNEXPECTED_BEHAVIOUR with the load's message, before sign_requested and send_tx, with no sign call", async () => {
      const port = namespacesPort()
      const { client, events } = await createExecutionClient(port, chains)
      failListLoads()

      await start(client, solanaTx)

      expect(port.wallet.solana.getAccount).toHaveBeenCalledTimes(1)
      expect(port.wallet.solana.signAndSend).not.toHaveBeenCalled()
      expect(port.requests).toEqual([])
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'meta API down',
        detail: null,
      })
      expect(view?._storage.transactions.s1?.execution.status).toBe(
        'not_started',
      )
      expect(events.map(nameOf)).not.toContain('step1:send_tx')
    })

    test("an EVM entry on a port with no evm namespace fails with getWallet's message, not the list's, and never fetches the list", async () => {
      const port = namespacesPort()
      const { client, events } = await connectingClient(() => ({
        solana: port.wallet.solana,
      }))
      failListLoads()

      await start(client, evmTx())

      await expectFailedOnNoWallet(client, events, 'evm', 'ETH')
      expect(httpClient.getBlockchains).not.toHaveBeenCalled()
    })
  })
})

describe('getWallet', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("is asked for the entry's namespace and blockchain and that blockchain's selected Wallet ID", async () => {
    const { client, queries } = await createExecutionClient(
      namespacesPort(),
      chains,
    )

    await start(client, evmTx())

    expect(distinctQueries(queries)).toEqual(['evm:ETH:metamask'])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test("is asked for a TRANSFER on its own blockchain, with that blockchain's selected Wallet ID", async () => {
    const { client, queries } = await createExecutionClient(namespacesPort(), [
      ...chains,
      chain('BTC', ['^bc1']),
    ])

    await start(client, transferTx())

    expect(distinctQueries(queries)).toEqual(['bip122:BTC:xverse'])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('answering undefined fails the Execution, unreported, naming the namespace and blockchain', async () => {
    const { client, events } = await connectingClient(() => ({}))

    await start(client, evmTx())

    await expectFailedOnNoWallet(client, events, 'evm', 'ETH')
  })

  test('is called on every use, so a wallet swapped between calls is the one the next execute() signs with', async () => {
    const port = namespacesPort()
    const first = port.evmOn('ETH')
    first.getAccount.mockResolvedValue(null)
    const host = { ...port, wallet: { ...port.wallet, evm: first } }
    const { client } = await createExecutionClient(host, chains)
    await start(client, evmTx())
    expect((await historyOf(client))?._queue.status).toBe('BLOCKED')

    const second = port.evmOn('ETH')
    host.wallet = { ...host.wallet, evm: second }
    await client.execute('request-1')
    await settle()

    expect(second.signAndSend.mock.calls).toEqual([[{ tx: evmTx() }]])
    expect(first.signAndSend).not.toHaveBeenCalled()
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })
})
