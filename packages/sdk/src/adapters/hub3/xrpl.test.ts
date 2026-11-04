// The hub3 XRPL adapter, driven through the public client over real hub3 providers with stubbed actions and node.
import 'fake-indexeddb/auto'

import type { XrplTrustline, XrplTx } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'
import type { XRPLActions } from '@hub3js/xrpl'
import type { GenericSigner, SignerFactory } from 'rango-types'
import type * as Xrpl from 'xrpl'

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
import { RippledError } from 'xrpl'

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
  xrplChain,
  xrplTrustline,
  xrplTx,
} from '../../../tests/support.js'

import { hub3XrplAdapter } from './xrpl.js'

type AccountLinesOptions = Parameters<XRPLActions['accountLines']>[1]
// What the stubbed node answers as a `tx` response's `result`.
type TxResult = {
  validated?: boolean
  meta?: { TransactionResult: string } | string
}

/*
 * The stubbed XRPL node: every `Client` the adapter opens logs what it is asked, in order, here. `answers` answers each
 * `tx` request with the next one, then the last one; an Error rejects. `connectError` makes `connect` reject.
 */
const node = vi.hoisted(() => ({
  log: [] as unknown[][],
  answers: [] as unknown[],
  connectError: undefined as Error | undefined,
}))

vi.mock('xrpl', async (importOriginal) => {
  const original = await importOriginal<typeof Xrpl>()
  class Client {
    constructor(url: string) {
      node.log.push(['new', url])
    }
    async connect() {
      node.log.push(['connect'])
      if (node.connectError !== undefined) {
        throw node.connectError
      }
    }
    async request(request: unknown) {
      node.log.push(['request', request])
      const answer =
        node.answers.length > 1 ? node.answers.shift() : node.answers[0]
      if (answer instanceof Error) {
        throw answer
      }
      return { result: answer }
    }
    async disconnect() {
      node.log.push(['disconnect'])
    }
  }
  return { ...original, Client }
})

const PROVIDER_ID = 'test-wallet'
const NODE_URL = 'wss://xrplcluster.com/'
const CHAINS = [...evmBlockchains, xrplChain()]
// How often the SDK polls a TrustSet's transaction.
const POLL_INTERVAL_MS = 5_000
// The limit the SDK gives the TrustSet build, and needs a trustline to have.
const TRUSTLINE_LIMIT = '10000000000000'
const TRUST_SET_HASH = 'trust-set-hash'
const SWAP_HASH = '0xhash1'
const NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'XRPL', address: 'rXRPLfrom' },
}
const TX_RESULT = {
  pending: { validated: false },
  success: { validated: true, meta: { TransactionResult: 'tesSUCCESS' } },
  failed: { validated: true, meta: { TransactionResult: 'tecNO_LINE' } },
} satisfies Record<string, TxResult>

function txnNotFound(): RippledError {
  return new RippledError('Transaction not found.', {
    error: 'txnNotFound',
    error_code: 29,
    error_message: 'Transaction not found.',
    status: 'error',
    type: 'response',
  })
}

// A trustline the wallet holds, to USD from `rIssuer` with the SDK's limit unless overridden.
function line(
  overrides: Partial<Xrpl.AccountLinesTrustline> = {},
): Xrpl.AccountLinesTrustline {
  return {
    account: 'rIssuer',
    balance: '0',
    currency: 'USD',
    limit: TRUSTLINE_LIMIT,
    limit_peer: '0',
    quality_in: 0,
    quality_out: 0,
    ...overrides,
  }
}

/*
 * What the stubbed hub3 wallet holds and was asked. `signers` is read on each call. `lines` answers each
 * `accountLines` call with the next one, then the last one; an Error rejects.
 */
type Wallet = {
  connected: boolean
  accounts: string[] | null
  signers: SignerFactory
  lines: (Xrpl.AccountLinesTrustline[] | Error)[]
  lineReads: [string, AccountLinesOptions][]
  connects: number
}

// A signer that answers TRUST_SET_HASH for a TrustSet and SWAP_HASH for the swap, and the mock its `signAndSendTx` is.
function buildSigner() {
  const signAndSendTx = vi.fn<GenericSigner<XrplTx>['signAndSendTx']>(
    async (tx) => {
      const hash =
        tx.data.TransactionType === 'TrustSet' ? TRUST_SET_HASH : SWAP_HASH
      return { hash, response: { hash } }
    },
  )
  const signer: GenericSigner<XrplTx> = {
    signMessage: async () => '',
    signAndSendTx,
  }
  return { signer, signAndSendTx }
}

// A signer factory with `signer` registered for XRPL, and a signer that must not be used for EVM.
function buildSigners(signer: GenericSigner<XrplTx>): SignerFactory {
  const signers = new DefaultSignerFactory()
  signers.registerSigner(TransactionType.EVM, {
    signMessage: async () => '',
    signAndSendTx: async () => {
      throw new Error('The EVM signer was used for an XRPL transaction.')
    },
  })
  signers.registerSigner(TransactionType.XRPL, signer)
  return signers
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    connected: true,
    accounts: ['xrpl:mainnet:rXRPLfrom', 'xrpl:mainnet:rXRPLother'],
    signers: buildSigners(buildSigner().signer),
    lines: [[line()]],
    lineReads: [],
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

/*
 * A real hub3 provider whose `xrpl` namespace is stubbed by `wallet`: its state holds `wallet`'s connection and
 * accounts, set once the provider is built, `connect` counts a connect, and `accountLines` records its arguments and
 * answers `wallet`'s next lines. Its `signers` metadata property answers `wallet.signers`.
 */
function buildProvider(wallet: Wallet) {
  const namespace = new NamespaceBuilder<XRPLActions>('XRPL', PROVIDER_ID)
    .action('connect', async () => {
      wallet.connects += 1
      return []
    })
    .action('accountLines', async (_context, account, options) => {
      wallet.lineReads.push([account, options])
      return next<Xrpl.AccountLinesTrustline[]>(wallet.lines)
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
    .add('xrpl', namespace)
    .build()
  const [, setState] = namespace.state()
  setState('connected', wallet.connected)
  setState('accounts', wallet.accounts)
  return provider
}

// Executes a one-Step Route over `wallet`, whose XRPL Payment carries these Prerequisites, with every pending step run.
async function start(
  wallet: Wallet,
  prerequisites: XrplTrustline[] = [],
): Promise<Sdk.RangoClient> {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(xrplTx({ prerequisites })),
  )
  const { client } = await createExecutionClient(
    { wallet: { xrpl: hub3XrplAdapter(buildProvider(wallet)) }, requests: [] },
    CHAINS,
  )
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return client
}

// The TrustSet the adapter builds from `wallet` for `currency` from `issuer`, the default trustline's unless given.
function trustSet({
  wallet = 'rXRPLfrom',
  currency = 'USD',
  issuer = 'rIssuer',
  limit = TRUSTLINE_LIMIT,
} = {}): XrplTx {
  return xrplTx({
    data: {
      TransactionType: 'TrustSet',
      Account: wallet,
      LimitAmount: { currency, issuer, value: limit },
    },
  })
}

// The transaction type of each transaction the signer was asked to sign, in order.
function signedTypes(
  signAndSendTx: ReturnType<typeof buildSigner>['signAndSendTx'],
) {
  return signAndSendTx.mock.calls.map(([tx]) => tx.data.TransactionType)
}

// The log of one `tx` read of `hash` over its own connection.
function txRead(hash: string): unknown[][] {
  return [
    ['new', NODE_URL],
    ['connect'],
    ['request', { command: 'tx', transaction: hash }],
    ['disconnect'],
  ]
}

let factory = new IDBFactory()

describe('hub3XrplAdapter', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
    node.log = []
    node.answers = [TX_RESULT.success]
    node.connectError = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('an XRPL swap runs to success, signed by the XRPL signer with the first account and no chain ID, without connecting', async () => {
    const { signer, signAndSendTx } = buildSigner()
    const wallet = buildWallet({ signers: buildSigners(signer) })

    const client = await start(wallet)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([[xrplTx(), 'rXRPLfrom', null]])
    expect(httpClient.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, txId: SWAP_HASH }),
    )
    expect(wallet.connects).toBe(0)
    expect(node.log).toEqual([])
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
    const adapter = hub3XrplAdapter(buildProvider(wallet))
    wallet.signers = buildSigners(second.signer)

    await adapter.sign({ tx: xrplTx() })

    expect(first.signAndSendTx).not.toHaveBeenCalled()
    expect(second.signAndSendTx.mock.calls).toEqual([
      [xrplTx(), 'rXRPLfrom', null],
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

  test('a sign while the provider has no connected account rejects as a SignerError UNEXPECTED_BEHAVIOUR, without asking the signer', async () => {
    const { signer, signAndSendTx } = buildSigner()
    const adapter = hub3XrplAdapter(
      buildProvider(
        buildWallet({ accounts: [], signers: buildSigners(signer) }),
      ),
    )

    const rejection: unknown = await adapter
      .sign({ tx: xrplTx() })
      .catch(identity)

    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  describe('a swap to an XRPL token', () => {
    test('whose trustline the wallet already holds with enough limit signs no TrustSet: the lines are read for the Prerequisite’s wallet with its issuer as peer, and the swap succeeds', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        lines: [[line({ currency: 'EUR' }), line()]],
      })

      const client = await start(wallet, [xrplTrustline({ wallet: 'rOwner' })])

      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(wallet.lineReads).toEqual([['rOwner', { peer: 'rIssuer' }]])
      expect(signedTypes(signAndSendTx)).toEqual(['Payment'])
      expect(node.log).toEqual([])
    })

    test.each<[string, Xrpl.AccountLinesTrustline[]]>([
      ['no line', []],
      [
        'only a line with the same currency from another issuer',
        [line({ account: 'rOtherIssuer' })],
      ],
      ['only a line to another currency', [line({ currency: 'EUR' })]],
      ['a line whose limit is too small', [line({ limit: '1000' })]],
    ])(
      'whose wallet holds %s signs the TrustSet, reads it off the ledger until validated, then signs the swap and succeeds',
      async (_, lines) => {
        const { signer, signAndSendTx } = buildSigner()
        const wallet = buildWallet({
          signers: buildSigners(signer),
          lines: [lines],
        })

        const client = await start(wallet, [xrplTrustline()])

        const view = await historyOf(client)
        expect(view?._queue.status).toBe('SUCCESS')
        expect(signAndSendTx.mock.calls).toEqual([
          [trustSet(), 'rXRPLfrom', null],
          [xrplTx({ prerequisites: [xrplTrustline()] }), 'rXRPLfrom', null],
        ])
        expect(node.log).toEqual(txRead(TRUST_SET_HASH))
        expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
          'completed',
        )
      },
    )

    test('whose trustline is missing signs the TrustSet built from the Prerequisite’s wallet, currency and issuer with the SDK’s limit', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({ signers: buildSigners(signer), lines: [[]] })

      const client = await start(wallet, [
        xrplTrustline({
          wallet: 'rOwner',
          currency: 'EUR',
          issuer: 'rOtherIssuer',
        }),
      ])

      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(signAndSendTx.mock.calls[0]).toEqual([
        trustSet({
          wallet: 'rOwner',
          currency: 'EUR',
          issuer: 'rOtherIssuer',
        }),
        'rXRPLfrom',
        null,
      ])
    })

    test('whose TrustSet is not validated yet, then unknown to the node, then unreachable, keeps polling over a new connection each time, and continues once it is validated with tesSUCCESS', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({ signers: buildSigners(signer), lines: [[]] })
      node.answers = [
        TX_RESULT.pending,
        txnNotFound(),
        new Error('The node is unreachable.'),
        TX_RESULT.success,
      ]

      const client = await start(wallet, [xrplTrustline()])

      const pending = await historyOf(client)
      expect(pending?._queue.status).toBe('RUNNING')
      expect(pending?._storage.transactions['s1.p0']?.execution.status).toBe(
        'signed',
      )
      await advance(POLL_INTERVAL_MS)
      expect((await historyOf(client))?._queue.status).toBe('RUNNING')
      await advance(POLL_INTERVAL_MS)
      expect((await historyOf(client))?._queue.status).toBe('RUNNING')
      expect(signedTypes(signAndSendTx)).toEqual(['TrustSet'])
      await advance(POLL_INTERVAL_MS)
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(signedTypes(signAndSendTx)).toEqual(['TrustSet', 'Payment'])
      expect(node.log).toEqual([
        ...txRead(TRUST_SET_HASH),
        ...txRead(TRUST_SET_HASH),
        ...txRead(TRUST_SET_HASH),
        ...txRead(TRUST_SET_HASH),
      ])
    })

    test.each<[string, TxResult]>([
      ['with a result other than tesSUCCESS', TX_RESULT.failed],
      ['with its `meta` as a string', { validated: true, meta: '201C00' }],
      ['with no `meta`', { validated: true }],
    ])(
      'whose TrustSet is validated %s fails the Execution with the Prerequisite’s on-chain failure, and the swap is never signed',
      async (_, result) => {
        const { signer, signAndSendTx } = buildSigner()
        node.answers = [result]

        const client = await start(
          buildWallet({ signers: buildSigners(signer), lines: [[]] }),
          [xrplTrustline()],
        )

        const view = await historyOf(client)
        expect(view?._queue.status).toBe('FAILED')
        expect(view?._storage.failure).toMatchObject({
          reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
          message: 'Prerequisite transaction failed on chain.',
        })
        expect(signedTypes(signAndSendTx)).toEqual(['TrustSet'])
      },
    )

    test('whose trustline read rejects, even with hub3’s user-rejected error, fails with the SDK’s own failure for it, and nothing is signed', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        lines: [new SecondCopyHub3Error('The wallet said no.')],
      })

      const client = await start(wallet, [xrplTrustline()])

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Could not get account lines from XRPL.',
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    })
  })

  test('`buildTransaction` builds the TrustSet with the `limit` it is given, without connecting or looking up a signer', async () => {
    const wallet = buildWallet()
    const getSigner = vi.spyOn(wallet.signers, 'getSigner')
    const adapter = hub3XrplAdapter(buildProvider(wallet))

    const built = await adapter.buildTransaction({
      prerequisite: xrplTrustline(),
      limit: '5',
    })

    expect(built).toEqual(trustSet({ limit: '5' }))
    expect(getSigner).not.toHaveBeenCalled()
    expect(wallet.connects).toBe(0)
    expect(node.log).toEqual([])
  })

  describe('`getTransactionInfo`', () => {
    test('answers `validated` and the result off the `tx` response, over a connection it closes', async () => {
      node.answers = [
        { ...TX_RESULT.failed, hash: 'h', ledger_index: 3, tx_json: {} },
      ]
      const adapter = hub3XrplAdapter(buildProvider(buildWallet()))

      await expect(adapter.getTransactionInfo({ hash: 'h' })).resolves.toEqual({
        validated: true,
        meta: { TransactionResult: 'tecNO_LINE' },
      })
      expect(node.log).toEqual(txRead('h'))
    })

    test.each<
      [
        string,
        TxResult,
        Awaited<ReturnType<Sdk.XrplWallet['getTransactionInfo']>>,
      ]
    >([
      [
        'no `validated`',
        { meta: { TransactionResult: 'tesSUCCESS' } },
        { validated: false, meta: { TransactionResult: 'tesSUCCESS' } },
      ],
      [
        'a string `meta`',
        { validated: true, meta: '201C00' },
        { validated: true },
      ],
    ])('reads a response with %s', async (_, result, expected) => {
      node.answers = [result]
      const adapter = hub3XrplAdapter(buildProvider(buildWallet()))

      await expect(adapter.getTransactionInfo({ hash: 'h' })).resolves.toEqual(
        expected,
      )
    })

    test('answers `{ validated: false }` for a transaction the node does not know', async () => {
      node.answers = [txnNotFound()]
      const adapter = hub3XrplAdapter(buildProvider(buildWallet()))

      await expect(adapter.getTransactionInfo({ hash: 'h' })).resolves.toEqual({
        validated: false,
      })
      expect(node.log).toEqual(txRead('h'))
    })

    test.each<[string, Error]>([
      [
        'another node error',
        new RippledError('Invalid hash.', { error: 'notImpl' }),
      ],
      ['a non-node error', new Error('The socket closed.')],
    ])('rejects with %s as it is, and still disconnects', async (_, error) => {
      node.answers = [error]
      const adapter = hub3XrplAdapter(buildProvider(buildWallet()))

      const rejection = await adapter
        .getTransactionInfo({ hash: 'h' })
        .catch(identity)

      expect(rejection).toBe(error)
      expect(node.log).toEqual(txRead('h'))
    })

    test('rejects with the connect error as it is, and still disconnects', async () => {
      const error = new Error('Cannot reach the node.')
      node.connectError = error
      const adapter = hub3XrplAdapter(buildProvider(buildWallet()))

      const rejection = await adapter
        .getTransactionInfo({ hash: 'h' })
        .catch(identity)

      expect(rejection).toBe(error)
      expect(node.log).toEqual([['new', NODE_URL], ['connect'], ['disconnect']])
    })
  })

  test('`getTrustline` answers the matching line’s limit as it is, and rejects with the hub3 namespace’s own error, not a SignerError', async () => {
    const error = new Hub3Error(
      'PROVIDER_USER_REJECTED_REQUEST',
      'The wallet said no.',
    )
    const wallet = buildWallet({ lines: [[line({ limit: '12.5' })], error] })
    const adapter = hub3XrplAdapter(buildProvider(wallet))

    await expect(
      adapter.getTrustline({ prerequisite: xrplTrustline() }),
    ).resolves.toBe('12.5')
    await expect(
      adapter.getTrustline({ prerequisite: xrplTrustline() }).catch(identity),
    ).resolves.toBe(error)
  })

  test('a provider without an `xrpl` hub3 namespace does not compile', () => {
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

    // @ts-expect-error The adapter needs an `xrpl` hub3 namespace.
    expect(() => hub3XrplAdapter(provider)).not.toThrow()
  })
})
