// The gate (connection, account, then network), the switch, `BLOCKED` and unblock, driven through the public client over fake-indexeddb.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import { SignerErrorCode } from 'rango-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  chain,
  confirmQuote,
  connectedAccounts,
  createExecutionClient,
  createTxResponse,
  DEFAULT_ETH_CHAIN_DESCRIPTION,
  describedChain,
  evmBlockchains,
  evmChain,
  evmTx,
  EXECUTION_OPTIONS,
  expectNotReported,
  httpClient,
  httpError,
  MAINNET_ETH_CHAIN_DESCRIPTION,
  nameOf,
  recordingNamespaces,
  reloadOn,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  signerError,
  statusResponse,
  stubWindow,
  succeeded,
  switchingNamespaces,
  viewOf,
} from '../../../tests/support.js'

// What every evm request names besides its own fields: v14's evm namespace takes the blockchain, and no address.
const TARGET = { blockchain: 'ETH' }
const MISMATCH: Sdk.BlockReason = {
  reason: 'NETWORK_MISMATCH',
  metadata: { blockchain: 'ETH', address: '0xfrom', requiredChainId: '0x1' },
}
// Options that differ from the stored ones in every field.
const OTHER_OPTIONS: Sdk.ExecutionOptions = {
  transactionOptions: {
    slippage: '3',
    infiniteApprove: true,
    validations: { balance: false, fee: false },
  },
  walletTypes: { ETH: { walletType: 'other' } },
  swapMode: 'swap',
}
const NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'ETH', address: '0xfrom' },
}
const ACCOUNT_MISMATCH: Sdk.BlockReason = {
  reason: 'ACCOUNT_MISMATCH',
  metadata: { blockchain: 'ETH', address: '0xfrom' },
}
const BLOCKED_EVENT = 'step1:waiting_for_network_change'
const NOT_CONNECTED_EVENT = 'step1:waiting_for_wallet_connect'
const ACCOUNT_MISMATCH_EVENT = 'step1:waiting_for_change_wallet_account'
const SWITCH_EVENT = 'step1:switch_network'

const POLL_INTERVAL_MS = 5_000
const SERVICE_UNAVAILABLE = 503

let factory = new IDBFactory()

// What a signer rejects with, with a `cause` whose message a report would carry.
const signerRejection = (): Error =>
  signerError(SignerErrorCode.SIGN_TX_ERROR, 'Wallet said no', {
    message: 'provider gone',
  })

// A wallet on BSC whose `switchChain` resolves without moving it: the chain stays wrong.
function stuckWallet(
  chainIds: Record<string, string | null> = { ETH: '0x38' },
) {
  const port = switchingNamespaces(chainIds)
  port.wallet.evm.switchChain.mockImplementation(async () => undefined)
  return port
}

// Confirms a one-Step Route and executes it, with every pending step run.
async function start(client: Sdk.RangoClient): Promise<void> {
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
}

// A view's `blocked` is set while it is `BLOCKED` and `null` otherwise.
function expectBlockedOnlyWhileBlocked(views: Sdk.HistoryItem[]): void {
  for (const view of views) {
    expect(view._queue.blocked).toEqual(
      view._queue.status === 'BLOCKED' ? MISMATCH : null,
    )
  }
}

describe('the network gate', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a wallet already on the chain is not asked to switch, and the swap signs', async () => {
    const port = switchingNamespaces()
    const { client, events } = await createExecutionClient(port)

    await start(client)

    expect(port.wallet.evm.switchChain).not.toHaveBeenCalled()
    expect(port.requests.map(([, method]) => method)).toEqual([
      'getChainId',
      'sign',
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._queue.blocked).toBeNull()
    expect(events.map(nameOf)).not.toContain(SWITCH_EVENT)
    expectBlockedOnlyWhileBlocked(events.map(viewOf))
  })

  test.each([
    ['0x1', '1'],
    ['1', '0x1'],
  ])(
    'getChainId answering %s passes a step whose chain ID is %s',
    async (answer, listed) => {
      const port = switchingNamespaces({ ETH: answer })
      const { client } = await createExecutionClient(port)
      httpClient.getBlockchains.mockResolvedValue([
        evmChain('ETH', listed),
        evmChain('BSC', '0x38'),
      ])

      await start(client)

      expect(port.wallet.evm.switchChain).not.toHaveBeenCalled()
      expect(port.wallet.evm.sign).toHaveBeenCalledWith({
        ...TARGET,
        tx: evmTx(),
      })
      expect((await client.history.get('request-1'))?._queue.status).toBe(
        'SUCCESS',
      )
    },
  )

  test('on a mismatch switch_network is emitted, with no metadata, before the wallet is asked to switch', async () => {
    const chainIds: Record<string, string | null> = { ETH: '0x38' }
    const port = switchingNamespaces(chainIds)
    const { client, events } = await createExecutionClient(port)
    const pending = Promise.withResolvers<void>()
    const seenAtSwitch: string[] = []
    port.wallet.evm.switchChain.mockImplementationOnce(async () => {
      seenAtSwitch.push(...events.map(nameOf))
      return pending.promise
    })

    await start(client)

    expect(port.wallet.evm.switchChain).toHaveBeenCalledWith({
      ...TARGET,
      chainId: '0x1',
      chain: DEFAULT_ETH_CHAIN_DESCRIPTION,
    })
    expect(seenAtSwitch.at(-1)).toBe(SWITCH_EVENT)
    const switched = events.filter((event) => nameOf(event) === SWITCH_EVENT)
    expect(switched).toEqual([
      [
        'stepEvent',
        {
          event: { type: 'tx_execution', status: 'switch_network' },
          step: 1,
          transactionId: 's1',
          view: expect.objectContaining({
            _queue: expect.objectContaining({ status: 'RUNNING' }),
          }),
        },
      ],
    ])
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'RUNNING',
    )
    expect(port.wallet.evm.sign).not.toHaveBeenCalled()

    chainIds.ETH = '0x1'
    pending.resolve()
    await settle()

    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
    expect(port.wallet.evm.sign).toHaveBeenCalledTimes(1)
    expect(
      events.filter((event) => nameOf(event) === SWITCH_EVENT),
    ).toHaveLength(1)
  })

  test('a switch that resolves onto the chain lets the swap sign', async () => {
    const port = switchingNamespaces({ ETH: '0x38' })
    const { client } = await createExecutionClient(port)

    await start(client)

    expect(port.requests).toEqual([
      ['evm', 'getChainId', TARGET],
      [
        'evm',
        'switchChain',
        { ...TARGET, chainId: '0x1', chain: DEFAULT_ETH_CHAIN_DESCRIPTION },
      ],
      ['evm', 'getChainId', TARGET],
      ['evm', 'sign', { ...TARGET, tx: evmTx() }],
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
  })

  test("the switch describes the chain with the Blockchain list's chain name, native currency, RPC and explorer URLs, and the list loads once", async () => {
    const port = switchingNamespaces({ ETH: '0x38' })
    const { client } = await createExecutionClient(port, [
      describedChain(evmChain('ETH', '0x1'), MAINNET_ETH_CHAIN_DESCRIPTION),
      evmChain('BSC', '0x38'),
    ])

    await start(client)

    expect(port.wallet.evm.switchChain.mock.calls).toEqual([
      [
        {
          ...TARGET,
          chainId: '0x1',
          chain: {
            ...DEFAULT_ETH_CHAIN_DESCRIPTION,
            ...MAINNET_ETH_CHAIN_DESCRIPTION,
          },
        },
      ],
    ])
    expect(httpClient.getBlockchains).toHaveBeenCalledTimes(1)
  })

  test('a rejected switch followed by a matching re-read signs', async () => {
    const chainIds: Record<string, string | null> = { ETH: '0x38' }
    const port = switchingNamespaces(chainIds)
    const { client } = await createExecutionClient(port)
    port.wallet.evm.switchChain.mockImplementationOnce(async () => {
      chainIds.ETH = '0x1'
      throw new Error('the prompt was closed')
    })

    await start(client)

    expect(port.wallet.evm.sign).toHaveBeenCalledTimes(1)
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.failure).toBeNull()
  })

  test('a chain still wrong after the switch blocks the Execution, then emits tx_execution_blocked', async () => {
    const port = stuckWallet()
    const { client, events } = await createExecutionClient(port)

    await start(client)

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual(MISMATCH)
    expect(view?._storage.failure).toBeNull()
    expect(view?._storage.transactions.s1?.execution.status).toBe('not_started')
    expect(port.wallet.evm.sign).not.toHaveBeenCalled()
    expect(httpClient.reportFailure).not.toHaveBeenCalled()

    const blocked = events.find((event) => nameOf(event) === BLOCKED_EVENT)
    expect(blocked).toEqual([
      'stepEvent',
      {
        event: {
          type: 'tx_execution_blocked',
          status: 'waiting_for_network_change',
        },
        step: 1,
        transactionId: 's1',
        view: expect.objectContaining({
          _queue: expect.objectContaining({
            status: 'BLOCKED',
            blocked: MISMATCH,
          }),
        }),
      },
    ])
    expect(events.map(nameOf).at(-1)).toBe(BLOCKED_EVENT)
    expectBlockedOnlyWhileBlocked(events.map(viewOf))
  })

  const cannotSwitch: [string, () => Promise<void>][] = [
    [
      'rejects with a signer code',
      async () => {
        throw signerRejection()
      },
    ],
    [
      'rejects with an error',
      async () => {
        throw new Error('cannot switch')
      },
    ],
    ['resolves without switching', async () => undefined],
  ]

  test.each(cannotSwitch)(
    'a wallet that cannot switch, whose switchChain %s, blocks NETWORK_MISMATCH after switch_network and a second read, with nothing failed or reported',
    async (_, switchChain) => {
      const port = recordingNamespaces({ ETH: '0x38' })
      port.wallet.evm.switchChain.mockImplementation(switchChain)
      const { client, events } = await createExecutionClient(port)

      await start(client)

      expect(port.wallet.evm.getChainId).toHaveBeenCalledTimes(2)
      expect(port.wallet.evm.switchChain.mock.calls).toEqual([
        [{ ...TARGET, chainId: '0x1', chain: DEFAULT_ETH_CHAIN_DESCRIPTION }],
      ])
      expect(
        events.filter((event) => nameOf(event) === SWITCH_EVENT),
      ).toHaveLength(1)
      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(MISMATCH)
      expect(view?._storage.failure).toBeNull()
      expect(port.wallet.evm.sign).not.toHaveBeenCalled()
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
    },
  )

  const blockers: [string, () => ReturnType<typeof recordingNamespaces>][] = [
    [
      'a null chain',
      () => {
        const port = switchingNamespaces({ ETH: null })
        port.wallet.evm.getChainId.mockResolvedValue(null)
        return port
      },
    ],
    ['a chain BigInt cannot read', () => stuckWallet({ ETH: 'mainnet' })],
    [
      'a first getChainId rejected with an error, still wrong after the switch',
      () => {
        const port = stuckWallet()
        port.wallet.evm.getChainId.mockRejectedValueOnce(
          new Error('no provider'),
        )
        return port
      },
    ],
    [
      'a first getChainId rejected with a signer code, still wrong after the switch',
      () => {
        const port = stuckWallet()
        port.wallet.evm.getChainId.mockRejectedValueOnce(signerRejection())
        return port
      },
    ],
    [
      'a getChainId rejected with an error on the re-read after a switch',
      () => {
        const port = switchingNamespaces({ ETH: '0x38' })
        port.wallet.evm.getChainId
          .mockResolvedValueOnce('0x38')
          .mockRejectedValue(new Error('no provider'))
        return port
      },
    ],
    [
      'a getChainId rejected with a signer code on the re-read after a switch',
      () => {
        const port = switchingNamespaces({ ETH: '0x38' })
        port.wallet.evm.getChainId
          .mockResolvedValueOnce('0x38')
          .mockRejectedValue(signerRejection())
        return port
      },
    ],
  ]

  test.each(blockers)(
    '%s blocks with NETWORK_MISMATCH and never fails the swap',
    async (_, arrange) => {
      const port = arrange()
      const { client } = await createExecutionClient(port)

      await start(client)

      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(MISMATCH)
      expect(view?._storage.failure).toBeNull()
      expect(port.wallet.evm.sign).not.toHaveBeenCalled()
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
    },
  )

  test('a rejected first getChainId emits switch_network, asks the wallet to switch once, and a matching re-read signs', async () => {
    const port = switchingNamespaces({ ETH: '0x38' })
    port.wallet.evm.getChainId.mockRejectedValueOnce(new Error('no provider'))
    const { client, events } = await createExecutionClient(port)

    await start(client)

    expect(port.wallet.evm.getChainId).toHaveBeenCalledTimes(2)
    expect(port.requests).toEqual([
      [
        'evm',
        'switchChain',
        { ...TARGET, chainId: '0x1', chain: DEFAULT_ETH_CHAIN_DESCRIPTION },
      ],
      ['evm', 'getChainId', TARGET],
      ['evm', 'sign', { ...TARGET, tx: evmTx() }],
    ])
    expect(
      events.filter((event) => nameOf(event) === SWITCH_EVENT),
    ).toHaveLength(1)
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.failure).toBeNull()
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
  })

  test('execute() on an Execution blocked by a rejected getChainId whose chain now reads right signs', async () => {
    const port = recordingNamespaces()
    port.wallet.evm.getChainId
      .mockRejectedValueOnce(new Error('no provider'))
      .mockRejectedValueOnce(new Error('no provider'))
    const { client } = await createExecutionClient(port)
    await start(client)
    expect((await client.history.get('request-1'))?._queue.blocked).toEqual(
      MISMATCH,
    )

    await client.execute('request-1')
    await settle()

    expect(port.requests).toEqual([
      [
        'evm',
        'switchChain',
        { ...TARGET, chainId: '0x1', chain: DEFAULT_ETH_CHAIN_DESCRIPTION },
      ],
      ['evm', 'getChainId', TARGET],
      ['evm', 'sign', { ...TARGET, tx: evmTx() }],
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._queue.blocked).toBeNull()
    expect(view?._storage.failure).toBeNull()
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
  })

  test('getChainId is never called for a non-EVM entry, which is still gated on its connection and account', async () => {
    const port = switchingNamespaces()
    const { client } = await createExecutionClient(port, [
      ...evmBlockchains,
      chain('BTC', ['^bc1']),
    ])
    const transfer: LegacySdk.Transfer = {
      type: LegacySdk.TransactionType.TRANSFER,
      blockChain: 'BTC',
      prerequisites: [],
      method: 'transfer',
      asset: { blockchain: 'BTC', symbol: 'BTC', address: null, ticker: 'BTC' },
      amount: '100000',
      decimals: 8,
      fromWalletAddress: 'bc1from',
      recipientAddress: 'bc1to',
      memo: null,
      psbt: null,
    }
    httpClient.createTransaction.mockReset()
    httpClient.createTransaction.mockResolvedValue(createTxResponse(transfer))

    await start(client)

    expect(port.requests).toEqual([
      [
        'bip122',
        'sign',
        {
          blockchain: 'BTC',
          tx: transfer,
        },
      ],
    ])
    expect(port.wallet.bip122.getAccounts.mock.calls).toEqual([
      [{ blockchain: 'BTC' }],
    ])
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test('a transfer on a blockchain with no walletTypes entry is gated and signed for its blockchain and address', async () => {
    const port = switchingNamespaces(undefined, {
      ...connectedAccounts(),
      DOGE: ['Dfrom'],
    })
    const { client } = await createExecutionClient(port, [
      ...evmBlockchains,
      chain('DOGE', ['^D']),
    ])
    const transfer: LegacySdk.Transfer = {
      type: LegacySdk.TransactionType.TRANSFER,
      blockChain: 'DOGE',
      prerequisites: [],
      method: 'transfer',
      asset: {
        blockchain: 'DOGE',
        symbol: 'DOGE',
        address: null,
        ticker: 'DOGE',
      },
      amount: '100000',
      decimals: 8,
      fromWalletAddress: 'Dfrom',
      recipientAddress: 'Dto',
      memo: null,
      psbt: null,
    }
    httpClient.createTransaction.mockReset()
    httpClient.createTransaction.mockResolvedValue(createTxResponse(transfer))

    await start(client)

    expect(port.wallet.bip122.getAccounts.mock.calls).toEqual([
      [{ blockchain: 'DOGE' }],
    ])
    expect(port.requests).toEqual([
      [
        'bip122',
        'sign',
        {
          blockchain: 'DOGE',
          tx: transfer,
        },
      ],
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.options.walletTypes).not.toHaveProperty('DOGE')
  })

  test('an EVM entry whose blockchain has no chain ID in the list fails CLIENT_UNEXPECTED_BEHAVIOUR, stored and not reported, without signing', async () => {
    const port = switchingNamespaces()
    const { client, events } = await createExecutionClient(port)
    httpClient.getBlockchains.mockResolvedValue([
      { ...evmChain('ETH', '0x1'), chainId: null },
      evmChain('BSC', '0x38'),
    ])

    await start(client)

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'Unexpected Error: ETH has no chain ID.',
      detail: null,
    })
    expectNotReported(events)
    expect(port.requests).toEqual([])
  })

  test('an entry whose blockchain is not in the Blockchain list fails CLIENT_UNEXPECTED_BEHAVIOUR, stored and not reported, without signing', async () => {
    const port = switchingNamespaces()
    const { client, events } = await createExecutionClient(port)
    httpClient.getBlockchains.mockResolvedValue([evmChain('BSC', '0x38')])

    await start(client)

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'Unexpected Error: ETH is not in the Blockchain list.',
      detail: null,
    })
    expectNotReported(events)
    expect(port.requests).toEqual([])
  })

  test('a Blockchain list that fails to load fails CLIENT_UNEXPECTED_BEHAVIOUR with its message, stored and not reported, without signing, and is not retried', async () => {
    const port = switchingNamespaces()
    const { client, events } = await createExecutionClient(port)
    httpClient.getBlockchains.mockReset()
    httpClient.getBlockchains.mockRejectedValue(
      httpError(SERVICE_UNAVAILABLE, { error: 'meta API down' }),
    )

    await start(client)
    await advance(POLL_INTERVAL_MS * 2)

    expect(httpClient.getBlockchains).toHaveBeenCalledTimes(1)
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'meta API down',
      detail: null,
    })
    expectNotReported(events)
    expect(port.requests).toEqual([])
  })
})

describe('execute() on a stored Execution', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('with no options, unblocks a BLOCKED Execution, emits one change for the unblock, and a now-matching chain signs', async () => {
    const chainIds: Record<string, string | null> = { ETH: '0x38' }
    const port = stuckWallet(chainIds)
    const { client, events } = await createExecutionClient(port)
    await start(client)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'BLOCKED',
    )
    const mark = events.length
    port.requests.length = 0
    chainIds.ETH = '0x1'

    await client.execute('request-1')

    /*
     * One `changed` for the unblock, from core's queue update, then one for the queue update of the task core runs
     * again at once. `execute()` emits none of its own.
     */
    const unblocked = events.slice(mark)
    expect(unblocked.map(([name]) => name)).toEqual(['changed', 'changed'])
    expect(unblocked.map(viewOf)).toMatchObject([
      { _queue: { status: 'RUNNING', blocked: null } },
      { _queue: { status: 'RUNNING', blocked: null } },
    ])

    await settle()

    expect(port.requests).toEqual([
      ['evm', 'getChainId', TARGET],
      ['evm', 'sign', { ...TARGET, tx: evmTx() }],
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._queue.blocked).toBeNull()
    expectBlockedOnlyWhileBlocked(events.map(viewOf))
  })

  test('with other options, unblocks a BLOCKED Execution that keeps its stored options and wallet types', async () => {
    const chainIds: Record<string, string | null> = { ETH: '0x38' }
    const port = stuckWallet(chainIds)
    const { client } = await createExecutionClient(port)
    await start(client)
    port.requests.length = 0
    chainIds.ETH = '0x1'

    await client.execute('request-1', OTHER_OPTIONS)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.options).toEqual(EXECUTION_OPTIONS)
    expect(port.requests).toEqual([
      ['evm', 'getChainId', TARGET],
      ['evm', 'sign', { ...TARGET, tx: evmTx() }],
    ])
  })

  test('a still-wrong chain blocks again after the unblock', async () => {
    const port = stuckWallet()
    const { client, events } = await createExecutionClient(port)
    await start(client)

    await client.execute('request-1')
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual(MISMATCH)
    expect(port.wallet.evm.switchChain).toHaveBeenCalledTimes(2)
    expect(port.wallet.evm.sign).not.toHaveBeenCalled()
    expect(
      events.map(nameOf).filter((name) => name === BLOCKED_EVENT),
    ).toHaveLength(2)
    expectBlockedOnlyWhileBlocked(events.map(viewOf))
  })

  type Arrange = (port: ReturnType<typeof recordingNamespaces>) => void
  const states: [string, Arrange, Sdk.HistoryItem['_queue']['status']][] = [
    [
      'a running',
      () => {
        httpClient.checkStatus.mockResolvedValue(statusResponse())
      },
      'RUNNING',
    ],
    ['a SUCCESS', () => undefined, 'SUCCESS'],
    [
      'a FAILED',
      (port) => {
        port.wallet.evm.sign.mockRejectedValueOnce(new Error('wallet exploded'))
      },
      'FAILED',
    ],
  ]
  const calls: [string, Sdk.ExecutionOptions | undefined][] = [
    ['no options', undefined],
    ['other options', OTHER_OPTIONS],
  ]

  const cases = states.flatMap(([name, arrange, status]) =>
    calls.map(
      ([given, options]): [
        string,
        string,
        Arrange,
        Sdk.HistoryItem['_queue']['status'],
        Sdk.ExecutionOptions | undefined,
      ] => [name, given, arrange, status, options],
    ),
  )

  test.each(cases)(
    'on %s Execution, with %s, changes nothing',
    async (_, __, arrange, status, options) => {
      const port = switchingNamespaces()
      const { client, events } = await createExecutionClient(port)
      arrange(port)
      await start(client)
      const before = structuredClone(await client.history.get('request-1'))
      expect(before?._queue.status).toBe(status)
      const eventCount = events.length
      const requestCount = port.requests.length
      httpClient.createTransaction.mockClear()
      httpClient.checkStatus.mockClear()
      httpClient.reportFailure.mockClear()
      httpClient.confirmRoute.mockClear()

      await expect(
        client.execute('request-1', options),
      ).resolves.toBeUndefined()
      await settle()

      expect(await client.history.get('request-1')).toEqual(before)
      expect(httpClient.createTransaction).not.toHaveBeenCalled()
      expect(httpClient.checkStatus).not.toHaveBeenCalled()
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
      expect(httpClient.confirmRoute).not.toHaveBeenCalled()
      expect(port.requests).toHaveLength(requestCount)
      expect(events).toHaveLength(eventCount)
      expect(before?._queue.blocked).toBeNull()
    },
  )
})

describe('execute() on a BLOCKED Execution in a paused tab', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    reloadOn(factory)
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
    stubWindow()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // A page that stored a BLOCKED Execution, then reloaded as a paused tab with a wallet now on the chain.
  async function pausedTab() {
    const { client: blocking } = await createExecutionClient(stuckWallet())
    await start(blocking)
    expect((await blocking.history.get('request-1'))?._queue.blocked).toEqual(
      MISMATCH,
    )
    reloadOn(factory)
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
    const port = switchingNamespaces()
    const paused = await createExecutionClient(port, evmBlockchains, {
      pauseOnStart: true,
    })
    await settle()
    return paused
  }

  test('resolves with no error, emits nothing, and leaves it BLOCKED with its blocked', async () => {
    const { client, all, requests } = await pausedTab()
    const before = await client.history.get('request-1')
    expect(before?._queue.status).toBe('BLOCKED')
    const eventCount = all.length

    await expect(client.execute('request-1')).resolves.toBeUndefined()
    await settle()

    expect(all).toHaveLength(eventCount)
    expect(requests).toEqual([])
    expect(httpClient.createTransaction).not.toHaveBeenCalled()
    const view = await client.history.get('request-1')
    expect(view).toEqual(before)
    expect(view?._queue.blocked).toEqual(MISMATCH)
  })

  test('resume() alone leaves it BLOCKED, and a later execute() in the Active tab continues it', async () => {
    const { client, requests } = await pausedTab()
    await client.execute('request-1')
    await settle()

    await client.resume()
    await settle()

    expect(requests).toEqual([])
    expect((await client.history.get('request-1'))?._queue.blocked).toEqual(
      MISMATCH,
    )

    await client.execute('request-1')
    await settle()

    expect(requests).toEqual([
      ['evm', 'getChainId', TARGET],
      ['evm', 'sign', { ...TARGET, tx: evmTx() }],
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._queue.blocked).toBeNull()
  })
})

describe('the connection and account gate', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('getAccounts is asked with the blockchain alone before getChainId, and a held address signs', async () => {
    const port = switchingNamespaces()
    const { client } = await createExecutionClient(port)

    await start(client)

    expect(port.wallet.evm.getAccounts.mock.calls).toEqual([
      [{ blockchain: 'ETH' }],
    ])
    const [accountsOrder] = port.wallet.evm.getAccounts.mock.invocationCallOrder
    const [chainOrder] = port.wallet.evm.getChainId.mock.invocationCallOrder
    expect(accountsOrder).toBeLessThan(chainOrder ?? 0)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test.each([
    ['null', null],
    ['no account', []],
  ])(
    'getAccounts answering %s blocks NOT_CONNECTED, emits waiting_for_wallet_connect, and asks nothing more',
    async (_, answer) => {
      const port = switchingNamespaces({ ETH: '0x38' }, { ETH: answer })
      const { client, events } = await createExecutionClient(port)

      await start(client)

      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
      expect(view?._storage.failure).toBeNull()
      expect(view?._storage.transactions.s1?.execution.status).toBe(
        'not_started',
      )
      expect(port.requests).toEqual([])
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
      expect(
        events.find((event) => nameOf(event) === NOT_CONNECTED_EVENT),
      ).toEqual([
        'stepEvent',
        {
          event: {
            type: 'tx_execution_blocked',
            status: 'waiting_for_wallet_connect',
          },
          step: 1,
          transactionId: 's1',
          view: expect.objectContaining({
            _queue: expect.objectContaining({
              status: 'BLOCKED',
              blocked: NOT_CONNECTED,
            }),
          }),
        },
      ])
      expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)
    },
  )

  test('accounts without the address block ACCOUNT_MISMATCH before the chain, even on a wrong chain', async () => {
    const port = switchingNamespaces({ ETH: '0x38' }, { ETH: ['0xother'] })
    const { client, events } = await createExecutionClient(port)

    await start(client)

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual(ACCOUNT_MISMATCH)
    expect(view?._storage.failure).toBeNull()
    expect(port.requests).toEqual([])
    expect(port.wallet.evm.switchChain).not.toHaveBeenCalled()
    expect(events.map(nameOf)).not.toContain(SWITCH_EVENT)
    expect(
      events.find((event) => nameOf(event) === ACCOUNT_MISMATCH_EVENT),
    ).toEqual([
      'stepEvent',
      {
        event: {
          type: 'tx_execution_blocked',
          status: 'waiting_for_change_wallet_account',
        },
        step: 1,
        transactionId: 's1',
        view: expect.objectContaining({
          _queue: expect.objectContaining({
            status: 'BLOCKED',
            blocked: ACCOUNT_MISMATCH,
          }),
        }),
      },
    ])
  })

  test('accounts are matched in lower case: an address differing only in case signs', async () => {
    const port = switchingNamespaces(
      { ETH: '0x1' },
      { ETH: ['0xOTHER', '0xFROM'] },
    )
    const { client } = await createExecutionClient(port)

    await start(client)

    expect(port.wallet.evm.sign).toHaveBeenCalledTimes(1)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test('a wrong chain on a connected account still blocks NETWORK_MISMATCH with requiredChainId in the metadata', async () => {
    const port = stuckWallet()
    const { client } = await createExecutionClient(port)

    await start(client)

    const view = await client.history.get('request-1')
    expect(view?._queue.blocked).toEqual(MISMATCH)
    expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(1)
  })

  const unblocks: [string, string[] | null, Sdk.BlockReason][] = [
    ['connected', null, NOT_CONNECTED],
    ['on the account', ['0xother'], ACCOUNT_MISMATCH],
  ]

  test.each(unblocks)(
    'execute() on a blocked Execution whose wallet is now %s signs',
    async (_, answer, blocked) => {
      const accounts: Record<string, string[] | null> = { ETH: answer }
      const port = switchingNamespaces(undefined, accounts)
      const { client } = await createExecutionClient(port)
      await start(client)
      expect((await client.history.get('request-1'))?._queue.blocked).toEqual(
        blocked,
      )
      accounts.ETH = ['0xfrom']

      await client.execute('request-1')
      await settle()

      expect(port.requests).toEqual([
        ['evm', 'getChainId', TARGET],
        ['evm', 'sign', { ...TARGET, tx: evmTx() }],
      ])
      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._queue.blocked).toBeNull()
    },
  )

  test('execute() on a blocked Execution whose wallet is still not connected blocks again', async () => {
    const port = switchingNamespaces(undefined, { ETH: null })
    const { client, events } = await createExecutionClient(port)
    await start(client)

    await client.execute('request-1')
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
    expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(2)
    expect(port.wallet.evm.sign).not.toHaveBeenCalled()
    expect(
      events.map(nameOf).filter((name) => name === NOT_CONNECTED_EVENT),
    ).toHaveLength(2)
  })

  const accountsRejections: [string, () => Error][] = [
    ['an error', () => new Error('no provider')],
    ['a signer code', signerRejection],
  ]

  test.each(accountsRejections)(
    'a getAccounts rejected with %s blocks NOT_CONNECTED, emits waiting_for_wallet_connect, and fails nothing',
    async (_, rejection) => {
      const port = switchingNamespaces()
      port.wallet.evm.getAccounts.mockRejectedValue(rejection())
      const { client, events } = await createExecutionClient(port)

      await start(client)

      const view = await client.history.get('request-1')
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
      expect(view?._storage.failure).toBeNull()
      expect(view?._storage.transactions.s1?.execution.status).toBe(
        'not_started',
      )
      expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(1)
      expect(port.wallet.evm.getChainId).not.toHaveBeenCalled()
      expect(port.wallet.evm.sign).not.toHaveBeenCalled()
      expect(port.requests).toEqual([])
      expect(httpClient.reportFailure).not.toHaveBeenCalled()
      expect(
        events.find((event) => nameOf(event) === NOT_CONNECTED_EVENT),
      ).toEqual([
        'stepEvent',
        {
          event: {
            type: 'tx_execution_blocked',
            status: 'waiting_for_wallet_connect',
          },
          step: 1,
          transactionId: 's1',
          view: expect.objectContaining({
            _queue: expect.objectContaining({
              status: 'BLOCKED',
              blocked: NOT_CONNECTED,
            }),
          }),
        },
      ])
      expect(events.map(nameOf).at(-1)).toBe(NOT_CONNECTED_EVENT)
      expect(events.map(nameOf)).not.toContain('step1:failed')
      expect(events.map(nameOf)).not.toContain('route:failed')
    },
  )

  test('execute() on an Execution blocked by a rejected getAccounts that now answers the address signs', async () => {
    const port = switchingNamespaces()
    port.wallet.evm.getAccounts.mockRejectedValueOnce(new Error('no provider'))
    const { client } = await createExecutionClient(port)
    await start(client)
    expect((await client.history.get('request-1'))?._queue.blocked).toEqual(
      NOT_CONNECTED,
    )

    await client.execute('request-1')
    await settle()

    expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(2)
    expect(port.requests).toEqual([
      ['evm', 'getChainId', TARGET],
      ['evm', 'sign', { ...TARGET, tx: evmTx() }],
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._queue.blocked).toBeNull()
    expect(view?._storage.failure).toBeNull()
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
  })

  test('a cancel while getAccounts is pending stores no block and asks the port nothing more', async () => {
    const port = switchingNamespaces(undefined, { ETH: [] })
    const pending = Promise.withResolvers<string[] | null>()
    port.wallet.evm.getAccounts.mockImplementationOnce(
      async () => pending.promise,
    )
    const { client, events } = await createExecutionClient(port)
    await start(client)
    expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(1)

    await client.cancel('request-1')
    await settle()
    pending.resolve([])
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('CANCELED')
    expect(view?._queue.blocked).toBeNull()
    expect(view?._storage.failure?.reasonCode).toBe('USER_CANCEL')
    expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(1)
    expect(port.requests).toEqual([])
    expect(events.map(nameOf)).not.toContain(NOT_CONNECTED_EVENT)
  })

  test('a cancel while getAccounts is pending, which then rejects, stores no block and asks the port nothing more', async () => {
    const port = switchingNamespaces()
    const pending = Promise.withResolvers<string[] | null>()
    port.wallet.evm.getAccounts.mockImplementationOnce(
      async () => pending.promise,
    )
    const { client, events } = await createExecutionClient(port)
    await start(client)
    expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(1)

    await client.cancel('request-1')
    await settle()
    const settled = events.length
    const reports = httpClient.reportFailure.mock.calls.length
    pending.reject(new Error('no provider'))
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('CANCELED')
    expect(view?._queue.blocked).toBeNull()
    expect(view?._storage.failure?.reasonCode).toBe('USER_CANCEL')
    expect(port.wallet.evm.getAccounts).toHaveBeenCalledTimes(1)
    expect(port.requests).toEqual([])
    expect(events).toHaveLength(settled)
    expect(httpClient.reportFailure).toHaveBeenCalledTimes(reports)
  })
})
