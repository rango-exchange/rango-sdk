// The hub3 Tron adapter, driven through the public client over real hub3 providers with stubbed actions.
import 'fake-indexeddb/auto'

import type { TronApprove, TronInfo } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'
import type { TronActions } from '@hub3js/tron'
import type { GenericSigner, mainAPI, SignerFactory } from 'rango-types'

import {
  createStore,
  Hub3Error,
  NamespaceBuilder,
  ProviderBuilder,
} from '@hub3js/core'
import { IDBFactory } from 'fake-indexeddb'
import {
  DefaultSignerFactory,
  SignerErrorCode,
  TransactionType,
} from 'rango-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { identity, SecondCopyHub3Error } from '../../../tests/hub3.js'
import {
  advance,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmBlockchains,
  EXECUTION_OPTIONS,
  expectPrerequisiteFailed,
  historyOf,
  httpClient,
  resetHttpClient,
  settle,
  succeeded,
  TRON_INFO,
  tronApprove,
  tronChain,
  tronTx,
  UNLIMITED,
} from '../../../tests/support.js'

import { hub3TronAdapter } from './tron.js'

type TronTransaction = mainAPI.TronTransaction
type AllowanceParams = Parameters<TronActions['getAllowance']>[0]
type ApproveParams = Parameters<TronActions['buildApproveTransaction']>[0]
type Built = Awaited<ReturnType<TronActions['buildApproveTransaction']>>

const PROVIDER_ID = 'test-wallet'
const CHAINS = [...evmBlockchains, tronChain()]
// How often the SDK polls an approve's info, and reads the allowance once the approve is proved.
const POLL_INTERVAL_MS = 5_000
const ALLOWANCE_READ_INTERVAL_MS = 3_000
const APPROVE_HASH = 'approve-hash'
const SWAP_HASH = '0xhash1'
// A TronWeb-built approve's raw data, with a field the Rango types leave out.
const RAW_DATA = {
  contract: [
    {
      parameter: {
        value: { data: '095ea7b3', owner_address: '41from' },
        type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
      },
      type: 'TriggerSmartContract',
    },
  ],
  ref_block_bytes: 'abcd',
  ref_block_hash: '0123456789abcdef',
  expiration: 1_700_000_060_000,
  timestamp: 1_700_000_000_000,
  fee_limit: 100_000_000,
}
const PAYLOAD = {
  type: 'WEB',
  owner_address: '41from',
  call_value: 0,
  contract_address: '41trc20',
  fee_limit: 100_000_000,
  function_selector: 'approve(address,uint256)',
  parameter: '00',
  chainType: null,
}
// What hub3 builds for the approve, with every field.
const BUILT: Built = {
  txID: 'approve-tx',
  raw_data: RAW_DATA,
  raw_data_hex: '0a02abcd',
  visible: true,
  __payload__: PAYLOAD,
}
const NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'TRON', address: 'TXfrom' },
}

/*
 * What the stubbed hub3 wallet holds and was asked. `signers` is read on each call. `allowances`, `builds` and `infos`
 * answer each call with the next one, then the last one; an Error rejects.
 */
type Wallet = {
  connected: boolean
  accounts: string[] | null
  signers: SignerFactory
  allowances: (string | Error)[]
  builds: (Built | Error)[]
  infos: (TronInfo | Error)[]
  allowanceReads: AllowanceParams[]
  buildCalls: ApproveParams[]
  infoReads: string[]
  connects: number
}

// A signer that answers APPROVE_HASH for an approve and SWAP_HASH for the swap, and the mock its `signAndSendTx` is.
function buildSigner() {
  const signAndSendTx = vi.fn<GenericSigner<TronTransaction>['signAndSendTx']>(
    async (tx) => {
      const hash = tx.isApprovalTx ? APPROVE_HASH : SWAP_HASH
      return { hash, response: { hash } }
    },
  )
  const signer: GenericSigner<TronTransaction> = {
    signMessage: async () => '',
    signAndSendTx,
  }
  return { signer, signAndSendTx }
}

// A signer factory with `signer` registered for TRON, and a signer that must not be used for EVM.
function buildSigners(signer: GenericSigner<TronTransaction>): SignerFactory {
  const signers = new DefaultSignerFactory()
  signers.registerSigner(TransactionType.EVM, {
    signMessage: async () => '',
    signAndSendTx: async () => {
      throw new Error('The EVM signer was used for a TRON transaction.')
    },
  })
  signers.registerSigner(TransactionType.TRON, signer)
  return signers
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    connected: true,
    accounts: ['tron:0x2b6653dc:TXfrom', 'tron:0x2b6653dc:TXother'],
    signers: buildSigners(buildSigner().signer),
    allowances: [UNLIMITED],
    builds: [BUILT],
    infos: [TRON_INFO.success],
    allowanceReads: [],
    buildCalls: [],
    infoReads: [],
    connects: 0,
    ...overrides,
  }
}

// The next of `answers`, then the last one: an Error rejects.
async function next<T>(answers: (T | Error)[]): Promise<T> {
  const answer = answers.length > 1 ? answers.shift() : answers[0]
  if (answer === undefined) {
    throw new Error('No scripted answer')
  }
  if (answer instanceof Error) {
    throw answer
  }
  return answer
}

// `built` as hub3 may answer it, without `raw_data_hex`, `visible` and `__payload__`. Removed at runtime, with no cast.
function withoutOptionalFields(built: Built): Built {
  const bare = { ...built }
  for (const key of ['raw_data_hex', 'visible', '__payload__']) {
    Reflect.deleteProperty(bare, key)
  }
  return bare
}

/*
 * A real hub3 provider whose `tron` namespace is stubbed by `wallet`: its state holds `wallet`'s connection and
 * accounts, set once the provider is built, `connect` counts a connect, and `getAllowance`, `buildApproveTransaction`
 * and `getTransactionInfo` record their argument and answer `wallet`'s next answer. Its `signers` metadata property
 * answers `wallet.signers`.
 */
function buildProvider(wallet: Wallet) {
  const namespace = new NamespaceBuilder<TronActions>('tron', PROVIDER_ID)
    .action('connect', async () => {
      wallet.connects += 1
      return []
    })
    .action('getAllowance', async (_context, params) => {
      wallet.allowanceReads.push(params)
      return next<string>(wallet.allowances)
    })
    .action('buildApproveTransaction', async (_context, params) => {
      wallet.buildCalls.push(params)
      return next<Built>(wallet.builds)
    })
    .action('getTransactionInfo', async (_context, txID) => {
      wallet.infoReads.push(txID)
      return next<TronInfo>(wallet.infos)
    })
    .build()
  const provider = new ProviderBuilder(PROVIDER_ID, { store: createStore() })
    .config('metadata', {
      name: 'Test wallet',
      icon: '',
      extensions: {},
      properties: [
        { name: 'signers', value: { getSigners: async () => wallet.signers } },
      ],
    })
    .add('tron', namespace)
    .build()
  const [, setState] = namespace.state()
  setState('connected', wallet.connected)
  setState('accounts', wallet.accounts)
  return provider
}

// Executes a one-Step Route over `wallet`, its TRON transaction carrying these Prerequisites, every pending step run.
async function start(
  wallet: Wallet,
  prerequisites: TronApprove[] = [],
): Promise<Sdk.RangoClient> {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(tronTx({ prerequisites })),
  )
  const { client } = await createExecutionClient(
    { wallet: { tron: hub3TronAdapter(buildProvider(wallet)) }, requests: [] },
    CHAINS,
  )
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return client
}

// The approve the SDK signs from `built`, a Prerequisite on TRON.
function signedApprove(fields: Partial<TronTransaction>): TronTransaction {
  return tronTx({ isApprovalTx: true, txID: 'approve-tx', ...fields })
}

let factory = new IDBFactory()

describe('hub3TronAdapter', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('a TRON swap runs to success, signed by the TRON signer with the first account and no chain ID, without connecting', async () => {
    const { signer, signAndSendTx } = buildSigner()
    const wallet = buildWallet({ signers: buildSigners(signer) })

    const client = await start(wallet)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([[tronTx(), 'TXfrom', null]])
    expect(httpClient.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, txId: SWAP_HASH }),
    )
    expect(wallet.connects).toBe(0)
  })

  test.each<[string, Partial<Wallet>]>([
    ['never connected', { connected: false, accounts: null }],
    ['connected with no accounts', { connected: true, accounts: [] }],
  ])(
    'a provider %s Blocks the run NOT_CONNECTED, without signing or connecting',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        ...overrides,
        signers: buildSigners(signer),
      })

      const client = await start(wallet)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
      expect(signAndSendTx).not.toHaveBeenCalled()
      expect(wallet.connects).toBe(0)
    },
  )

  test('the signer is looked up again on each sign: one the wallet registers after the adapter is built is the one that signs', async () => {
    const first = buildSigner()
    const second = buildSigner()
    const wallet = buildWallet({ signers: buildSigners(first.signer) })
    httpClient.createTransaction.mockResolvedValue(createTxResponse(tronTx()))
    const adapter = hub3TronAdapter(buildProvider(wallet))
    wallet.signers = buildSigners(second.signer)

    await adapter.sign({ tx: tronTx() })

    expect(first.signAndSendTx).not.toHaveBeenCalled()
    expect(second.signAndSendTx.mock.calls).toEqual([
      [tronTx(), 'TXfrom', null],
    ])
  })

  test.each<[string, Error]>([
    [
      'from a second copy of hub3',
      new SecondCopyHub3Error('The wallet said no.'),
    ],
    [
      'from this copy of hub3',
      new Hub3Error('PROVIDER_USER_REJECTED_REQUEST', 'The wallet said no.'),
    ],
  ])(
    'hub3’s user-rejected error %s, thrown by the signer, fails the Execution USER_REJECT',
    async (_, error) => {
      const { signer, signAndSendTx } = buildSigner()
      signAndSendTx.mockRejectedValue(error)

      const client = await start(buildWallet({ signers: buildSigners(signer) }))

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'USER_REJECT',
        message: 'User rejected the transaction',
        detail: 'User rejected the transaction',
      })
    },
  )

  describe('a TRC-20 swap', () => {
    test('whose allowance is already enough skips the approve: the allowance is read with the Prerequisite’s token, spender and wallet as owner, nothing is built, and the swap succeeds', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: [UNLIMITED],
      })

      const client = await start(wallet, [
        tronApprove({
          wallet: 'TXowner',
          token: '0xusdt',
          spender: '0xrouter',
        }),
      ])

      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(wallet.allowanceReads).toEqual([
        { token: '0xusdt', owner: 'TXowner', spender: '0xrouter' },
      ])
      expect(wallet.buildCalls).toEqual([])
      expect(signAndSendTx.mock.calls.map(([tx]) => tx.isApprovalTx)).toEqual([
        false,
      ])
    })

    test('with too little allowance builds the approve with no fee limit, signs it as hub3 built it, proves it by its info, confirms the allowance, then signs the swap and succeeds', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['999999', UNLIMITED],
      })

      const client = await start(wallet, [
        tronApprove({
          wallet: 'TXowner',
          token: '0xusdt',
          spender: '0xrouter',
          amount: '1000000',
        }),
      ])

      expect(wallet.buildCalls).toEqual([
        {
          token: '0xusdt',
          owner: 'TXowner',
          spender: '0xrouter',
          amount: '1000000',
        },
      ])
      expect(signAndSendTx.mock.calls).toEqual([
        [
          signedApprove({
            raw_data: RAW_DATA,
            raw_data_hex: '0a02abcd',
            visible: true,
            __payload__: PAYLOAD,
          }),
          'TXfrom',
          null,
        ],
      ])
      expect(signAndSendTx.mock.calls[0]?.[0].raw_data).toBe(RAW_DATA)
      expect(wallet.infoReads).toEqual([APPROVE_HASH])
      await advance(ALLOWANCE_READ_INTERVAL_MS)
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(signAndSendTx.mock.calls.map(([tx]) => tx.isApprovalTx)).toEqual([
        true,
        false,
      ])
      expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
        'completed',
      )
      expect(httpClient.checkStatus).toHaveBeenCalledWith(
        expect.objectContaining({ step: 1, txId: SWAP_HASH }),
      )
    })

    test('whose approve hub3 builds without `raw_data_hex`, `visible` and `__payload__` signs it with `null`, `false` and `{}` for them', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['0', UNLIMITED],
        builds: [withoutOptionalFields(BUILT)],
      })

      await start(wallet, [tronApprove()])

      expect(signAndSendTx.mock.calls[0]).toEqual([
        signedApprove({
          raw_data: RAW_DATA,
          raw_data_hex: null,
          visible: false,
          __payload__: {},
        }),
        'TXfrom',
        null,
      ])
    })

    test('whose approve’s info is pending keeps polling it, and the SDK’s own rules read the info that follows', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['0', UNLIMITED],
        infos: [TRON_INFO.pending, { blockNumber: 7 }],
      })

      const client = await start(wallet, [tronApprove()])

      const pending = await historyOf(client)
      expect(pending?._queue.status).toBe('RUNNING')
      expect(pending?._storage.transactions['s1.p0']?.execution.status).toBe(
        'signed',
      )
      await advance(POLL_INTERVAL_MS)
      await advance(ALLOWANCE_READ_INTERVAL_MS)
      expect(wallet.infoReads).toEqual([APPROVE_HASH, APPROVE_HASH])
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(signAndSendTx.mock.calls.map(([tx]) => tx.isApprovalTx)).toEqual([
        true,
        false,
      ])
    })

    test('whose approve’s info has a receipt result other than SUCCESS fails the Execution with the Prerequisite’s on-chain failure, and the swap is never signed', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['0'],
        infos: [TRON_INFO.failed],
      })

      const client = await start(wallet, [tronApprove()])

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Prerequisite transaction failed on chain.',
      })
      expect(signAndSendTx.mock.calls.map(([tx]) => tx.isApprovalTx)).toEqual([
        true,
      ])
    })

    test.each<[string, Partial<Wallet>, string]>([
      [
        'whose allowance read rejects',
        { allowances: [new SecondCopyHub3Error('The wallet said no.')] },
        'Could not read the current allowance from the node.',
      ],
      [
        'whose approve build rejects',
        {
          allowances: ['0'],
          builds: [new SecondCopyHub3Error('The wallet said no.')],
        },
        'Could not build the Tron approve transaction.',
      ],
      [
        'whose approve hub3 builds with a `raw_data` that is not a Tron transaction’s',
        {
          allowances: ['0'],
          builds: [{ ...BUILT, raw_data: { contract: 1 } }],
        },
        'Could not build the Tron approve transaction.',
      ],
    ])(
      '%s, even with hub3’s user-rejected error, fails with the SDK’s own failure for it, and nothing is signed',
      async (_, overrides, message) => {
        const { signer, signAndSendTx } = buildSigner()
        const wallet = buildWallet({
          signers: buildSigners(signer),
          ...overrides,
        })

        const client = await start(wallet, [tronApprove()])

        await expectPrerequisiteFailed(client, {
          reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
          message,
        })
        expect(signAndSendTx).not.toHaveBeenCalled()
      },
    )
  })

  test('`buildTransaction` takes the transaction’s blockchain from the Prerequisite, and passes a `null` `raw_data` as it is', async () => {
    const adapter = hub3TronAdapter(
      buildProvider(buildWallet({ builds: [{ ...BUILT, raw_data: null }] })),
    )

    const built = await adapter.buildTransaction({
      prerequisite: tronApprove({ blockChain: 'TRON_TESTNET' }),
    })

    expect(built).toMatchObject({ blockChain: 'TRON_TESTNET', raw_data: null })
  })

  test.each<[string, unknown]>([
    ['not an object', 'raw'],
    ['missing `ref_block_hash`', { ...RAW_DATA, ref_block_hash: undefined }],
    ['a `timestamp` that is not a number', { ...RAW_DATA, timestamp: '1' }],
    [
      'a contract with no `type_url`',
      { ...RAW_DATA, contract: [{ type: 'T', parameter: { value: {} } }] },
    ],
    ['a contract that is `null`', { ...RAW_DATA, contract: [null] }],
  ])(
    '`buildTransaction` rejects a `raw_data` that is %s',
    async (_, rawData) => {
      const adapter = hub3TronAdapter(
        buildProvider(
          buildWallet({ builds: [{ ...BUILT, raw_data: rawData }] }),
        ),
      )

      await expect(
        adapter.buildTransaction({ prerequisite: tronApprove() }),
      ).rejects.toThrow('is not a Tron transaction')
    },
  )

  test('`getTransactionInfo` answers the hub3 namespace’s info unchanged, for the hash it is given', async () => {
    const info = { blockNumber: 3, receipt: { result: 'OUT_OF_ENERGY' } }
    const wallet = buildWallet({ infos: [info] })
    const adapter = hub3TronAdapter(buildProvider(wallet))

    await expect(
      adapter.getTransactionInfo({ hash: 'approve-tx' }),
    ).resolves.toBe(info)
    expect(wallet.infoReads).toEqual(['approve-tx'])
  })

  test('`getAllowance`, `buildTransaction` and `getTransactionInfo` reject with the hub3 namespace’s own error, not a SignerError', async () => {
    const error = new Hub3Error(
      'PROVIDER_USER_REJECTED_REQUEST',
      'The wallet said no.',
    )
    const adapter = hub3TronAdapter(
      buildProvider(
        buildWallet({ allowances: [error], builds: [error], infos: [error] }),
      ),
    )

    const rejections = await Promise.all([
      adapter.getAllowance({ prerequisite: tronApprove() }).catch(identity),
      adapter.buildTransaction({ prerequisite: tronApprove() }).catch(identity),
      adapter.getTransactionInfo({ hash: APPROVE_HASH }).catch(identity),
    ])

    expect(rejections).toEqual([error, error, error])
    for (const rejection of rejections) {
      expect(rejection).toBe(error)
    }
  })

  test('a sign while the provider has no connected account rejects as a SignerError UNEXPECTED_BEHAVIOUR, without asking the signer', async () => {
    const { signer, signAndSendTx } = buildSigner()
    const adapter = hub3TronAdapter(
      buildProvider(
        buildWallet({ accounts: [], signers: buildSigners(signer) }),
      ),
    )

    const rejection: unknown = await adapter
      .sign({ tx: tronTx() })
      .catch(identity)

    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  test('a provider without a `tron` hub3 namespace does not compile', () => {
    const provider = new ProviderBuilder('evm-only', { store: createStore() })
      .config('metadata', { name: 'EVM only', icon: '', extensions: {} })
      .add(
        'evm',
        new NamespaceBuilder<{ connect: () => Promise<string[]> }>(
          'eip155',
          'evm-only',
        )
          .action('connect', async () => [])
          .build(),
      )
      .build()

    // @ts-expect-error The adapter needs a `tron` hub3 namespace.
    expect(() => hub3TronAdapter(provider)).not.toThrow()
  })
})
