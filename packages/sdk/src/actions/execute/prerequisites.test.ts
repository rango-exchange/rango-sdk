// EVM approve Prerequisites: the met test, the built approve, its gate, proof and allowance confirmation, driven through the public client over fake-indexeddb, with the timers faked.
import 'fake-indexeddb/auto'

import type {
  EvmApprove,
  EvmInfo,
  NamespaceRequest,
  PrerequisiteFailure,
} from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'

import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  advance,
  approvingNamespaces,
  callOf,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  DEFAULT_ETH_CHAIN_DESCRIPTION,
  describedChain,
  EVM_INFO,
  evmApprove,
  evmChain,
  evmTx,
  EXECUTION_OPTIONS,
  expectPrerequisiteFailed,
  historyOf,
  httpClient,
  MAINNET_ETH_CHAIN_DESCRIPTION,
  nameOf,
  portRejections,
  recordingNamespaces,
  resetHttpClient,
  settle,
  signsOf,
  succeeded,
  switchingNamespaces,
  UNLIMITED,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
const ALLOWANCE_READ_INTERVAL_MS = 3_000
const ALLOWANCE_TIMEOUT_MS = 30_000
const ALLOWANCE_CONSECUTIVE_SUFFICIENT_READS = 2
// The met test, then the confirmation's reads.
const READS_TO_CONFIRM = 1 + ALLOWANCE_CONSECUTIVE_SUFFICIENT_READS
// The met test, then a confirmation read every ALLOWANCE_READ_INTERVAL_MS from 0 to ALLOWANCE_TIMEOUT_MS.
const READS_TO_TIME_OUT =
  1 + ALLOWANCE_TIMEOUT_MS / ALLOWANCE_READ_INTERVAL_MS + 1
// How long a slow node takes to answer a read.
const READ_TIME = 1_000
// An ABI word, in hex characters.
const ABI_WORD_HEX_LENGTH = 64

// What every evm request names besides its own fields: v14's evm namespace takes the blockchain, and no address.
const ON_ETH = { blockchain: 'ETH' }

// Above Number.MAX_SAFE_INTEGER, where a float comparison can't tell these apart.
const LARGE_AMOUNT = '9007199254740993'
const LARGE_AMOUNT_LESS_ONE = '9007199254740992'

let factory = new IDBFactory()

// Confirms a one-Step Route whose transaction carries these Prerequisites, executes it and runs every pending step.
async function start(
  port: ReturnType<typeof recordingNamespaces>,
  prerequisites: EvmApprove[] = [evmApprove()],
) {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(evmTx({ prerequisites })),
  )
  const execution = await createExecutionClient(port)
  await confirmQuote(execution.client)
  await execution.client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return execution
}

// What every failed Prerequisite leaves: this failure, the approve never followed by the main transaction.
async function expectFailed(
  client: Sdk.RangoClient,
  port: { requests: readonly NamespaceRequest[] },
  failure: PrerequisiteFailure,
): Promise<void> {
  await expectPrerequisiteFailed(client, failure)
  expect(port.requests.map(callOf)).not.toContain('sign:0xcontract')
}

describe('EVM approve Prerequisites', () => {
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

  test('two approvals run in order before the main transaction, stored as s1.p0, s1.p1 and s1 with step 1', async () => {
    const port = approvingNamespaces(recordingNamespaces(), {
      granted: [null, UNLIMITED, UNLIMITED, null, UNLIMITED, UNLIMITED],
    })
    const { client } = await start(port, [
      evmApprove({ token: '0xtoken0' }),
      evmApprove({ token: '0xtoken1' }),
    ])
    await advance(ALLOWANCE_READ_INTERVAL_MS)
    await advance(ALLOWANCE_READ_INTERVAL_MS)

    expect(port.requests.map(callOf)).toEqual([
      'getChainId',
      'read:0xtoken0',
      'sign:0xtoken0',
      'info:0xhash1',
      'read:0xtoken0',
      'read:0xtoken0',
      'getChainId',
      'read:0xtoken1',
      'sign:0xtoken1',
      'info:0xhash2',
      'read:0xtoken1',
      'read:0xtoken1',
      'getChainId',
      'sign:0xcontract',
    ])
    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    const transactions = view?._storage.transactions ?? {}
    expect(Object.keys(transactions).sort()).toEqual(['s1', 's1.p0', 's1.p1'])
    expect(transactions['s1.p0']).toMatchObject({
      step: 1,
      data: { type: 'prerequisite', value: evmApprove({ token: '0xtoken0' }) },
      execution: { status: 'completed' },
    })
    expect(transactions['s1.p1']).toMatchObject({
      step: 1,
      data: { type: 'prerequisite', value: evmApprove({ token: '0xtoken1' }) },
      execution: { status: 'completed' },
    })
    expect(transactions['s1']).toMatchObject({
      step: 1,
      data: { type: 'tx' },
      execution: { status: 'completed' },
    })
  })

  const metAnswers: [string, string, string][] = [
    ['the amount itself', '1000000', '1000000'],
    ['more than the amount', '1000000', '1000001'],
    ['a large amount itself', LARGE_AMOUNT, LARGE_AMOUNT],
    ['an unlimited allowance', LARGE_AMOUNT, UNLIMITED],
  ]

  test.each(metAnswers)(
    'getAllowance answering %s stores the approval completed with no sign',
    async (_name, amount, granted) => {
      const port = approvingNamespaces(recordingNamespaces(), {
        granted: [granted],
      })
      const { client, events } = await start(port, [evmApprove({ amount })])

      expect(port.requests.map(callOf)).toEqual([
        'getChainId',
        'read:0xtoken',
        'getChainId',
        'sign:0xcontract',
      ])
      expect(port.requests[1]).toEqual([
        'evm',
        'getAllowance',
        { ...ON_ETH, prerequisite: evmApprove({ amount }) },
      ])
      expect(port.wallet.evm.getTransactionInfo).not.toHaveBeenCalled()
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions['s1.p0']?.execution).toEqual({
        status: 'completed',
        result: { walletResult: null, checkResult: null },
      })
      expect(events.map(nameOf)).not.toContain('step1:approval_tx_succeeded')
    },
  )

  const unmetAnswers: [string, string, string | null][] = [
    ['null', '1000000', null],
    ['less than the amount', '1000000', '999999'],
    ['zero', '1000000', '0'],
    ['one less than a large amount', LARGE_AMOUNT, LARGE_AMOUNT_LESS_ONE],
  ]

  test.each(unmetAnswers)(
    'getAllowance answering %s signs the approve',
    async (_name, amount, granted) => {
      const port = approvingNamespaces(recordingNamespaces(), {
        granted: [granted, UNLIMITED],
      })
      await start(port, [evmApprove({ amount })])

      const calls = ['getChainId', 'read:0xtoken', 'sign:0xtoken']
      expect(port.requests.map(callOf).slice(0, calls.length)).toEqual(calls)
    },
  )

  const SPENDER = 'abcdef0123456789abcdef0123456789abcdef01'
  const spenders: [string, string][] = [
    ['without 0x', SPENDER],
    ['with 0x', `0x${SPENDER}`],
    ['in upper case', `0x${SPENDER.toUpperCase()}`],
    ['in upper case with 0X', `0X${SPENDER.toUpperCase()}`],
  ]

  test.each(spenders)(
    'the signed approve is the ERC-20 approve call, with the spender given %s',
    async (_name, spender) => {
      const port = approvingNamespaces(recordingNamespaces())
      const prerequisite = evmApprove({
        spender,
        amount: LARGE_AMOUNT,
        token: '0xusdt',
      })
      const { client } = await start(port, [prerequisite])

      const [approve] = signsOf(port.requests)
      expect(approve).toEqual({
        ...ON_ETH,
        tx: {
          type: LegacySdk.TransactionType.EVM,
          blockChain: 'ETH',
          from: '0xfrom',
          to: '0xusdt',
          data: `0x095ea7b3${SPENDER.padStart(ABI_WORD_HEX_LENGTH, '0')}${'20000000000001'.padStart(ABI_WORD_HEX_LENGTH, '0')}`,
          value: null,
          nonce: null,
          gasLimit: null,
          gasPrice: null,
          maxPriorityFeePerGas: null,
          maxFeePerGas: null,
          isApprovalTx: true,
          prerequisites: [],
        },
      })

      await advance(ALLOWANCE_READ_INTERVAL_MS)
      const view = await historyOf(client)
      expect(view?._storage.transactions['s1.p0']?.data).toEqual({
        type: 'prerequisite',
        value: prerequisite,
      })
      expect(JSON.stringify(view)).not.toContain('095ea7b3')
    },
  )

  test('the approve is gated on its connection: getAccounts answering null blocks NOT_CONNECTED before the met test', async () => {
    const port = approvingNamespaces(
      recordingNamespaces(undefined, { ETH: null }),
    )
    const { client } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'ETH', address: '0xfrom' },
    })
    expect(port.wallet.evm.getAccounts.mock.calls).toEqual([
      [{ blockchain: 'ETH' }],
    ])
    expect(port.requests).toEqual([])
    expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
      'not_started',
    )
  })

  test('the approve is gated: on a wrong chain the wallet is asked to switch before it is signed', async () => {
    const port = approvingNamespaces(switchingNamespaces({ ETH: '0x38' }))
    await start(port)

    const calls = [
      'getChainId',
      'switchChain',
      'getChainId',
      'read:0xtoken',
      'sign:0xtoken',
    ]
    expect(port.requests.map(callOf).slice(0, calls.length)).toEqual(calls)
    expect(port.requests[1]).toEqual([
      'evm',
      'switchChain',
      { ...ON_ETH, chainId: '0x1', chain: DEFAULT_ETH_CHAIN_DESCRIPTION },
    ])
  })

  test("the approve's switch describes the chain with the Blockchain list's chain name, native currency, RPC and explorer URLs, and the list loads once", async () => {
    const port = approvingNamespaces(switchingNamespaces({ ETH: '0x38' }))
    httpClient.createTransaction.mockResolvedValue(
      createTxResponse(evmTx({ prerequisites: [evmApprove()] })),
    )
    const { client } = await createExecutionClient(port, [
      describedChain(evmChain('ETH', '0x1'), MAINNET_ETH_CHAIN_DESCRIPTION),
      evmChain('BSC', '0x38'),
    ])

    await confirmQuote(client)
    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(port.wallet.evm.switchChain.mock.calls).toEqual([
      [
        {
          ...ON_ETH,
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

  test('the approve is gated: on a wrong chain the switch does not move, the Execution blocks before the met test', async () => {
    const port = approvingNamespaces(recordingNamespaces({ ETH: '0x38' }))
    const { client } = await start(port)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NETWORK_MISMATCH',
      metadata: {
        blockchain: 'ETH',
        address: '0xfrom',
        requiredChainId: '0x1',
      },
    })
    expect(view?._storage.failure).toBeNull()
    expect(port.requests.map(callOf)).toEqual([
      'getChainId',
      'switchChain',
      'getChainId',
    ])
    expect(httpClient.reportFailure).not.toHaveBeenCalled()
  })

  test('getTransactionInfo is polled every POLL_INTERVAL_MS, and a rejected poll reads as pending', async () => {
    const infos: (EvmInfo | Error)[] = [
      EVM_INFO.pending,
      new Error('RPC down'),
      EVM_INFO.success,
    ]
    const port = approvingNamespaces(recordingNamespaces(), {
      infos: { evm: infos },
    })
    const { client } = await start(port)
    const polls = () => port.wallet.evm.getTransactionInfo.mock.calls.length

    expect(polls()).toBe(1)
    expect(port.wallet.evm.getTransactionInfo).toHaveBeenCalledWith({
      ...ON_ETH,
      hash: '0xhash1',
    })
    expect(
      (await historyOf(client))?._storage.transactions['s1.p0'],
    ).toMatchObject({
      execution: {
        status: 'signed',
        result: { walletResult: { hash: '0xhash1' } },
      },
    })

    await advance(POLL_INTERVAL_MS - 1)
    expect(polls()).toBe(1)
    await advance(1)
    expect(polls()).toBe(2)
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')

    await advance(POLL_INTERVAL_MS)
    expect(polls()).toBe(infos.length)
    expect(port.requests.map(callOf).at(-1)).toBe('read:0xtoken')
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(2)
  })

  test('a failed receipt from getTransactionInfo ends the swap and the main transaction is never signed', async () => {
    const port = approvingNamespaces(recordingNamespaces(), {
      infos: { evm: [EVM_INFO.pending, EVM_INFO.failed] },
    })
    const { client } = await start(port)
    await advance(POLL_INTERVAL_MS)

    await expectFailed(client, port, {
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'Prerequisite transaction failed on chain.',
    })
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(1)
    expect(signsOf(port.requests)).toHaveLength(1)
  })

  test('on success, two met reads 3 s apart store the approval completed and emit approval_tx_succeeded, then the main transaction is signed', async () => {
    const port = approvingNamespaces(recordingNamespaces())
    const { client, events } = await start(port)

    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(2)
    expect(
      (await historyOf(client))?._storage.transactions['s1.p0']?.execution
        .status,
    ).toBe('signed')
    expect(signsOf(port.requests)).toHaveLength(1)
    expect(events.map(nameOf)).not.toContain('step1:approval_tx_succeeded')

    await advance(ALLOWANCE_READ_INTERVAL_MS - 1)
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(2)
    expect(signsOf(port.requests)).toHaveLength(1)

    await advance(1)
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(READS_TO_CONFIRM)
    expect(signsOf(port.requests)).toHaveLength(2)
    const names = events.map(nameOf)
    const succeededAt = names.indexOf('step1:approval_tx_succeeded')
    expect(succeededAt).toBeGreaterThan(-1)
    expect(names.lastIndexOf('step1:send_tx')).toBeGreaterThan(succeededAt)
    expect(events[succeededAt]).toEqual([
      'stepEvent',
      expect.objectContaining({
        event: { type: 'approval_tx_succeeded' },
        step: 1,
        transactionId: 's1.p0',
        view: expect.objectContaining({
          _storage: expect.objectContaining({
            transactions: expect.objectContaining({
              's1.p0': expect.objectContaining({
                execution: expect.objectContaining({ status: 'completed' }),
              }),
            }),
          }),
        }),
      }),
    ])
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('a met read, then an unmet one, then two met reads still confirms', async () => {
    const granted = [null, UNLIMITED, '0', UNLIMITED, UNLIMITED]
    const port = approvingNamespaces(recordingNamespaces(), { granted })
    const { client } = await start(port)

    await advance(ALLOWANCE_READ_INTERVAL_MS * 2)
    expect(
      (await historyOf(client))?._storage.transactions['s1.p0']?.execution
        .status,
    ).toBe('signed')
    expect(signsOf(port.requests)).toHaveLength(1)

    await advance(ALLOWANCE_READ_INTERVAL_MS)
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(granted.length)
    expect(
      (await historyOf(client))?._storage.transactions['s1.p0']?.execution
        .status,
    ).toBe('completed')
    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
  })

  test('reads that never meet twice in a row end the swap with INSUFFICIENT_APPROVE after 30 s', async () => {
    const port = approvingNamespaces(recordingNamespaces(), {
      granted: [null, UNLIMITED, '0', UNLIMITED, new Error('RPC down')],
    })
    const { client } = await start(port)

    await advance(ALLOWANCE_TIMEOUT_MS - 1)
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')

    await advance(1)
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(
      READS_TO_TIME_OUT,
    )
    await expectFailed(client, port, {
      reasonCode: 'INSUFFICIENT_APPROVE',
      message: 'Insufficient approve, please try again.',
    })

    await advance(ALLOWANCE_TIMEOUT_MS)
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(
      READS_TO_TIME_OUT,
    )
  })

  test('reads that never meet twice in a row end the swap with INSUFFICIENT_APPROVE after 30 s, counting the time reads take toward the 30 s', async () => {
    const port = approvingNamespaces(recordingNamespaces(), {
      granted: [null, UNLIMITED, '0'],
    })
    const scripted = port.wallet.evm.getAllowance.getMockImplementation()
    if (scripted === undefined) {
      throw new Error('getAllowance has no implementation')
    }
    port.wallet.evm.getAllowance.mockImplementation(async (req) => {
      const answer = scripted(req)
      await new Promise((resolve) => {
        setTimeout(resolve, READ_TIME)
      })
      return answer
    })
    const { client } = await start(port)
    // The met test's read; the confirmation's first read starts now.
    await advance(READ_TIME)

    /*
     * A read starts every READ_TIME + ALLOWANCE_READ_INTERVAL_MS: the one starting at 28 s ends at 29 s, short of the 30 s,
     * and the one starting at 32 s ends at 33 s, past them. Counting only the waits would take 11 reads, ending at 41 s.
     */
    const lastReadAt = 32_000
    const giveUpAfter = lastReadAt + READ_TIME
    // The met test, then the confirmation's reads from 0 s to the last.
    const reads = 1 + lastReadAt / (READ_TIME + ALLOWANCE_READ_INTERVAL_MS) + 1
    await advance(giveUpAfter - 1)
    expect((await historyOf(client))?._queue.status).toBe('RUNNING')

    await advance(1)
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(reads)
    await expectFailed(client, port, {
      reasonCode: 'INSUFFICIENT_APPROVE',
      message: 'Insufficient approve, please try again.',
    })

    await advance(ALLOWANCE_TIMEOUT_MS)
    expect(port.wallet.evm.getAllowance).toHaveBeenCalledTimes(reads)
  })

  test.each(
    portRejections('Could not read the current allowance from the node.'),
  )(
    'a getAllowance rejected with %s in the met test ends the swap with its failure, and nothing is signed',
    async (_, error, failure) => {
      const port = approvingNamespaces(recordingNamespaces(), {
        granted: [error],
      })
      const { client } = await start(port)

      await expectFailed(client, port, failure)
      expect(signsOf(port.requests)).toEqual([])
    },
  )
})
