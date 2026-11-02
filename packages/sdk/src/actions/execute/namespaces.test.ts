// The WalletPort by namespace: each entry goes to its own namespace, and a missing namespace Blocks NOT_CONNECTED as no wallet does, over fake-indexeddb.
import 'fake-indexeddb/auto'

import type { NamespacePort, Namespaces } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  activeAccounts,
  advance,
  approvingNamespaces,
  BSC_ASSET,
  buildingNamespaces,
  cacheQuote,
  callOf,
  chain,
  confirmQuote,
  confirmResponse,
  createExecutionClient,
  createTxResponse,
  evmApprove,
  evmBlockchains,
  evmChain,
  evmTx,
  EXECUTION_OPTIONS,
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
  tronApprove,
  tronChain,
  tronTx,
  UNLIMITED,
  waitingNamespaces,
} from '../../../tests/support.js'

const ALLOWANCE_READ_INTERVAL_MS = 3_000
const SERVICE_UNAVAILABLE = 503
const NOT_CONNECTED_EVENT = 'step1:waiting_for_wallet_connect'
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
 * A client whose `execution` has a recording emitter and a `beforeResume` that sets the wallet to `wallet()`
 * on every run, and no `wallet` of its own, on a Blockchain list of `blockchains`.
 */
async function connectingClient(
  wallet: () => Sdk.WalletPort | undefined,
  blockchains: readonly Sdk.BlockchainMeta[] = chains,
) {
  const { RangoClient } = await loadSdk()
  httpClient.getBlockchains.mockResolvedValue([...blockchains])
  const { emitter, events } = recordingEmitter()
  const beforeResume = vi.fn<Sdk.BeforeResume>((_, setContext) => {
    setContext({ wallet: wallet() })
  })
  const client = new RangoClient({
    apiKey: 'test-key',
    execution: { emitter, beforeResume },
  })
  return { client, events }
}

describe('the WalletPort by namespace', () => {
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
      ['evm', 'sign', { tx }],
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

      expect(port.requests).toEqual([[namespace, 'sign', { tx }]])
      expect(port.wallet.evm.getAccount).not.toHaveBeenCalled()
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    },
  )

  test('a route whose namespace the port lacks Blocks NOT_CONNECTED with no port call, and signs through the namespace once beforeResume adds it', async () => {
    const port = namespacesPort()
    const connection: { wallet: Sdk.WalletPort } = {
      wallet: { evm: port.wallet.evm, tron: port.wallet.tron },
    }
    const { client, events } = await connectingClient(() => connection.wallet)

    await start(client, solanaTx)

    const blocked = await historyOf(client)
    expect(blocked?._queue.status).toBe('BLOCKED')
    expect(blocked?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'SOLANA', address: 'SoLfrom' },
    })
    expect(blocked?._storage.failure).toBeNull()
    expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)
    expect(port.requests).toEqual([])
    expect(port.wallet.evm.getAccount).not.toHaveBeenCalled()
    expect(port.wallet.solana.getAccount).not.toHaveBeenCalled()

    connection.wallet = { ...connection.wallet, solana: port.wallet.solana }
    await client.execute('request-1')
    await settle()

    expect(port.wallet.solana.getAccount).toHaveBeenCalledTimes(1)
    expect(port.requests).toEqual([['solana', 'sign', { tx: solanaTx }]])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('a signed TRON approve reloaded on a port without tron Blocks NOT_CONNECTED, and resumes its proof with no gate once tron is added', async () => {
    const tx = tronTx({ prerequisites: [tronApprove()] })
    const built = tronTx({ txID: 'approve-tx', isApprovalTx: true })
    const first = buildingNamespaces(approvingNamespaces(namespacesPort()), {
      tron: [built],
    })
    first.wallet.tron.getTransactionInfo.mockImplementation(hang)
    const { client } = await createExecutionClient(first, chains)
    await start(client, tx)
    expect(
      (await historyOf(client))?._storage.transactions['s1.p0']?.execution
        .status,
    ).toBe('signed')

    reloadOn(factory)
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
    httpClient.createTransaction.mockResolvedValue(createTxResponse(tx))
    const port = approvingNamespaces(namespacesPort(), { granted: [UNLIMITED] })
    const connection: { wallet: Sdk.WalletPort } = {
      wallet: { evm: port.wallet.evm },
    }
    const { client: loaded, events } = await connectingClient(
      () => connection.wallet,
    )
    await loaded.history.getAll()
    await settle()

    const blocked = await historyOf(loaded)
    expect(blocked?._queue.status).toBe('BLOCKED')
    expect(blocked?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'TRON', address: 'TXfrom' },
    })
    expect(blocked?._storage.failure).toBeNull()
    expect(blocked?._storage.transactions['s1.p0']?.execution.status).toBe(
      'signed',
    )
    expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)
    expect(port.requests).toEqual([])

    connection.wallet = { evm: port.wallet.evm, tron: port.wallet.tron }
    await loaded.execute('request-1')
    await settle()
    expect(port.requests.map(callOf)).toEqual(['info:0xhash1', 'read:0xtrc20'])
    expect(port.wallet.tron.getAccount).not.toHaveBeenCalled()
    await advance(ALLOWANCE_READ_INTERVAL_MS)

    expect(port.requests.map(callOf)).toEqual([
      'info:0xhash1',
      'read:0xtrc20',
      'read:0xtrc20',
      'sign:main-tx',
    ])
    const view = await historyOf(loaded)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
      'completed',
    )
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

    test('on a port without evm skips wait and is polled to SUCCESS', async () => {
      await signedThenReloaded()
      const port = waitingNamespaces()
      const { client: loaded } = await connectingClient(
        () => ({ tron: port.wallet.tron }),
        evmBlockchains,
      )
      await loaded.history.getAll()
      await settle()

      expect(port.requests).toEqual([])
      expect(httpClient.checkStatus.mock.calls.map(([req]) => req)).toEqual([
        { requestId: 'request-1', step: 1, txId: '0xhash1' },
      ])
      expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
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

  describe('a wallet per blockchain on evm and bip122', () => {
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
      expect(eth.sign.mock.calls).toEqual([[{ tx: evmTx() }]])
      expect(bsc.getAccount).toHaveBeenCalledTimes(1)
      expect(bsc.sign.mock.calls).toEqual([[{ tx: step2 }]])
      expect(port.requests).toEqual([
        ['evm', 'getChainId', undefined],
        ['evm', 'sign', { tx: evmTx() }],
        ['evm', 'getChainId', undefined],
        ['evm', 'sign', { tx: step2 }],
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

        expect(wallet.sign.mock.calls).toEqual([[{ tx }]])
        expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      },
    )

    test("an evm map with neither the entry's blockchain nor default Blocks NOT_CONNECTED as a missing evm does, with no port call", async () => {
      const port = namespacesPort()
      const bsc = port.evmOn('BSC')
      const { client, events } = await createExecutionClient(
        withWallets(port, { evm: { BSC: bsc } }),
        chains,
      )

      await start(client, evmTx())

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'NOT_CONNECTED',
        metadata: { blockchain: 'ETH', address: '0xfrom' },
      })
      expect(view?._storage.failure).toBeNull()
      expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)
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
      expect(btc.sign.mock.calls).toEqual([[{ tx: onBtc }]])
      expect(ltc.getAccount).toHaveBeenCalledTimes(1)
      expect(ltc.sign.mock.calls).toEqual([[{ tx: onLtc }]])
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

    describe('an EVM approve on BSC under an evm map', () => {
      const approve = evmApprove({ blockChain: 'BSC', wallet: '0xto' })
      const tx = evmTx({
        blockChain: 'BSC',
        from: '0xto',
        prerequisites: [approve],
      })

      // An ETH and a BSC wallet on `port`, the BSC one granting nothing before the approve and UNLIMITED after it.
      function approvingMap(port: ReturnType<typeof namespacesPort>) {
        const mapped = onEthAndBsc(port)
        mapped.bsc.getAllowance
          .mockResolvedValueOnce(null)
          .mockResolvedValue(UNLIMITED)
        return { eth: mapped.eth, bsc: mapped.bsc, mapped }
      }

      // Every call any of `wallet`'s mocks got.
      function callsOn(
        wallet: ReturnType<ReturnType<typeof namespacesPort>['evmOn']>,
      ) {
        return Object.values(wallet).flatMap(
          (method): readonly unknown[][] => method.mock.calls,
        )
      }

      test('is gated, read, built, signed and proved on the BSC wallet, with no call on the ETH one', async () => {
        const port = namespacesPort()
        const { eth, bsc, mapped } = approvingMap(port)
        const { client } = await createExecutionClient(mapped, chains)

        await start(client, tx)
        await advance(ALLOWANCE_READ_INTERVAL_MS)

        expect(bsc.getAllowance).toHaveBeenCalledWith({ prerequisite: approve })
        expect(bsc.buildTransaction).toHaveBeenCalledWith({
          prerequisite: approve,
        })
        expect(bsc.getTransactionInfo).toHaveBeenCalledWith({
          hash: '0xhash1',
        })
        expect(bsc.sign).toHaveBeenCalledTimes(2)
        expect(callsOn(eth)).toEqual([])
        expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      })

      test('signed and reloaded, is proved on the BSC wallet, with no call on the ETH one', async () => {
        const first = namespacesPort()
        const signing = approvingMap(first)
        signing.bsc.getTransactionInfo.mockImplementation(hang)
        const { client } = await createExecutionClient(signing.mapped, chains)
        await start(client, tx)
        expect(
          (await historyOf(client))?._storage.transactions['s1.p0']?.execution
            .status,
        ).toBe('signed')

        reloadOn(factory)
        httpClient.checkStatus.mockResolvedValue(succeeded)
        httpClient.reportFailure.mockResolvedValue(undefined)
        httpClient.createTransaction.mockResolvedValue(createTxResponse(tx))
        const port = namespacesPort()
        const { eth, bsc, mapped } = approvingMap(port)
        bsc.getAllowance.mockReset()
        bsc.getAllowance.mockResolvedValue(UNLIMITED)
        const { client: loaded } = await connectingClient(() => mapped.wallet)
        await loaded.history.getAll()
        await settle()
        await advance(ALLOWANCE_READ_INTERVAL_MS)

        expect(bsc.getTransactionInfo.mock.calls).toEqual([
          [{ hash: '0xhash1' }],
        ])
        expect(bsc.getAllowance).toHaveBeenCalledWith({ prerequisite: approve })
        expect(bsc.sign.mock.calls).toEqual([[{ tx }]])
        expect(callsOn(eth)).toEqual([])
        expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
      })
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

      expect(eth.sign).toHaveBeenCalledTimes(1)
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

    const blocks: [string, () => Sdk.WalletPort, Sdk.BlockReason['reason']][] =
      [
        [
          'with no solana namespace',
          () => ({ evm: namespacesPort().wallet.evm }),
          'NOT_CONNECTED',
        ],
        [
          'whose active account is another address',
          () =>
            recordingNamespaces(undefined, {
              ...activeAccounts(),
              SOLANA: 'SoLother',
            }).wallet,
          'ACCOUNT_MISMATCH',
        ],
      ]

    test.each(blocks)(
      'a SOLANA entry %s Blocks while the list fails to load, with no failure stored',
      async (_name, wallet, reason) => {
        const connected = wallet()
        const { client } = await connectingClient(() => connected)
        failListLoads()

        await start(client, solanaTx)

        const view = await historyOf(client)
        expect(view?._queue.status).toBe('BLOCKED')
        expect(view?._queue.blocked).toEqual({
          reason,
          metadata: { blockchain: 'SOLANA', address: 'SoLfrom' },
        })
        expect(view?._storage.failure).toBeNull()
        expect(view?._storage.transactions.s1?.execution.status).toBe(
          'not_started',
        )
      },
    )

    test("a SOLANA entry that passes the gate fails CLIENT_UNEXPECTED_BEHAVIOUR with the load's message, before sign_requested and send_tx, with no sign call", async () => {
      const port = namespacesPort()
      const { client, events } = await createExecutionClient(port, chains)
      failListLoads()

      await start(client, solanaTx)

      expect(port.wallet.solana.getAccount).toHaveBeenCalledTimes(1)
      expect(port.wallet.solana.sign).not.toHaveBeenCalled()
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

    test('an EVM entry on a port with no evm namespace Blocks NOT_CONNECTED while the list fails to load', async () => {
      const port = namespacesPort()
      const { client } = await connectingClient(() => ({
        solana: port.wallet.solana,
      }))
      failListLoads()

      await start(client, evmTx())

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'NOT_CONNECTED',
        metadata: { blockchain: 'ETH', address: '0xfrom' },
      })
      expect(view?._storage.failure).toBeNull()
      expect(httpClient.getBlockchains).not.toHaveBeenCalled()
    })

    test('an EVM approve on a port with no evm namespace Blocks NOT_CONNECTED while the list fails to load, and never fetches the list', async () => {
      const port = namespacesPort()
      const { client } = await connectingClient(() => ({
        tron: port.wallet.tron,
      }))
      failListLoads()

      await start(client, evmTx({ prerequisites: [evmApprove()] }))

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'NOT_CONNECTED',
        metadata: { blockchain: 'ETH', address: '0xfrom' },
      })
      expect(view?._storage.failure).toBeNull()
      expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
        'not_started',
      )
      expect(httpClient.getBlockchains).not.toHaveBeenCalled()
    })

    const tronApproveBlocks: [
      string,
      () => Sdk.WalletPort,
      Sdk.BlockReason['reason'],
    ][] = [
      [
        'with no tron namespace',
        () => ({ evm: namespacesPort().wallet.evm }),
        'NOT_CONNECTED',
      ],
      [
        'whose active account is another address',
        () =>
          recordingNamespaces(undefined, {
            ...activeAccounts(),
            TRON: 'TXother',
          }).wallet,
        'ACCOUNT_MISMATCH',
      ],
    ]

    test.each(tronApproveBlocks)(
      'a TRON approve %s Blocks while the list fails to load, with no failure stored',
      async (_name, wallet, reason) => {
        const connected = wallet()
        const { client } = await connectingClient(() => connected)
        failListLoads()

        await start(client, tronTx({ prerequisites: [tronApprove()] }))

        const view = await historyOf(client)
        expect(view?._queue.status).toBe('BLOCKED')
        expect(view?._queue.blocked).toEqual({
          reason,
          metadata: { blockchain: 'TRON', address: 'TXfrom' },
        })
        expect(view?._storage.failure).toBeNull()
        expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
          'not_started',
        )
      },
    )
  })
})
