// The WalletPort by namespace: each entry goes to its own namespace, and a missing namespace Blocks NOT_CONNECTED as no wallet does, over fake-indexeddb.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  cacheQuote,
  chain,
  confirmQuote,
  confirmResponse,
  connectedAccounts,
  createExecutionClient,
  createTxResponse,
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
  recordingEmitter,
  recordingNamespaces,
  reloadOn,
  SELECTED_WALLETS,
  settle,
  succeeded,
  tronChain,
  waitingNamespaces,
} from '../../../tests/support.js'

const SERVICE_UNAVAILABLE = 503
const NOT_CONNECTED_EVENT = 'step1:waiting_for_wallet_connect'

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
  SOLANA: 'SoLfrom',
  STARKNET: '0xstarknet',
  TON: 'UQton',
  SUI: '0xsui',
}
const chains = [
  ...evmBlockchains,
  tronChain(),
  chainOf('SOLANA'),
  chainOf('STARKNET'),
  chainOf('TON'),
  chainOf('SUI'),
]
const OPTIONS: Sdk.ExecutionOptions = {
  ...EXECUTION_OPTIONS,
  walletTypes: Object.fromEntries(
    Object.keys(WALLETS).map((blockchain) => [
      blockchain,
      { walletType: `${blockchain.toLowerCase()}-wallet` },
    ]),
  ),
}

let factory = new IDBFactory()

// A recording port whose `getAccounts` holds every wallet in WALLETS.
function namespacesPort() {
  return recordingNamespaces(undefined, {
    ...connectedAccounts(),
    ...Object.fromEntries(
      Object.entries(WALLETS).map(([blockchain, address]) => [
        blockchain,
        [address],
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
  await client.execute('request-1', OPTIONS)
  await settle()
}

/*
 * A client whose `execution` has a recording emitter and a `beforeResume` that sets the context's wallet to `wallet()`
 * on every run, and no `wallet` of its own, on a Blockchain list of `blockchains`.
 */
async function connectingClient(
  wallet: () => Sdk.WalletPort | undefined,
  blockchains: readonly Sdk.BlockchainMeta[] = chains,
) {
  const { RangoClient } = await loadSdk()
  httpClient.getBlockchains.mockResolvedValue([...blockchains])
  const { emitter, events } = recordingEmitter()
  const beforeResume = vi.fn<Sdk.BeforeResume>((context, setContext) => {
    setContext({ ...context, wallet: wallet() })
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

  test('a route on BSC is gated and signed on evm with blockchain BSC and no chain ID', async () => {
    const port = namespacesPort()
    const { client } = await createExecutionClient(port, chains)
    const tx = evmTx({ blockChain: 'BSC', from: '0xto' })

    await start(client, tx)

    expect(port.wallet.evm.getAccounts).toHaveBeenCalledWith({
      blockchain: 'BSC',
    })
    expect(port.requests).toEqual([
      ['evm', 'getChainId', { blockchain: 'BSC' }],
      ['evm', 'sign', { blockchain: 'BSC', tx }],
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
      expect(port.wallet.evm.getAccounts).not.toHaveBeenCalled()
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
    expect(port.wallet.evm.getAccounts).not.toHaveBeenCalled()
    expect(port.wallet.solana.getAccounts).not.toHaveBeenCalled()

    connection.wallet = { ...connection.wallet, solana: port.wallet.solana }
    await client.execute('request-1')
    await settle()

    expect(port.wallet.solana.getAccounts).toHaveBeenCalledTimes(1)
    expect(port.requests).toEqual([['solana', 'sign', { tx: solanaTx }]])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
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
        [
          'evm',
          'wait',
          { blockchain: 'ETH', hash: '0xhash1', response: undefined },
        ],
      ])
      expect(httpClient.checkStatus.mock.calls.map(([req]) => req)).toEqual([
        { requestId: 'request-1', step: 1, txId: '0xhash1' },
      ])
      expect((await historyOf(loaded))?._queue.status).toBe('SUCCESS')
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
          'whose accounts lack the address',
          () =>
            recordingNamespaces(undefined, {
              ...connectedAccounts(),
              SOLANA: ['SoLother'],
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

      expect(port.wallet.solana.getAccounts).toHaveBeenCalledTimes(1)
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
  })
})
