// The hub3 Stellar adapter, driven through the public client over real hub3 providers with stubbed actions.
import 'fake-indexeddb/auto'

import type { StellarTrustline, StellarTx } from '../../../tests/support.js'
import type * as Sdk from '../../mod.js'
import type { StellarActions } from '@hub3js/stellar'
import type { Horizon } from '@stellar/stellar-sdk'
import type { GenericSigner, SignerFactory } from 'rango-types'

import {
  createStore,
  Hub3Error,
  NamespaceBuilder,
  ProviderBuilder,
} from '@hub3js/core'
import { Asset, NotFoundError, Operation, xdr } from '@stellar/stellar-sdk'
import { IDBFactory } from 'fake-indexeddb'
import {
  DefaultSignerFactory,
  SignerErrorCode,
  TransactionType,
} from 'rango-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { identity, SecondCopyHub3Error } from '../../../tests/hub3.js'
import {
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
  stellarChain,
  stellarTrustline,
  stellarTx,
  succeeded,
} from '../../../tests/support.js'

import { hub3StellarAdapter } from './stellar.js'

type BalanceLine = Horizon.HorizonApi.BalanceLine

const PROVIDER_ID = 'test-wallet'
const CHAINS = [...evmBlockchains, stellarChain()]
// A real issuer's address: the trustline build checks it.
const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const OTHER_ISSUER = 'GADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOZPI'
// The limit the SDK's trustline sets, and needs a trustline to have.
const TRUSTLINE_LIMIT = '922337203685.4775807'
// The fake clock's now, half a second past a whole second.
const NOW_MS = Date.parse('2026-11-03T12:00:00.500Z')
const MS_PER_S = 1000
const ONE_MINUTE_MS = 60_000
const TIME_BOUND_S = 30
const NOW_S = Math.floor(NOW_MS / MS_PER_S)
const TRUSTLINE_HASH = 'trustline-hash'
const SWAP_HASH = '0xhash1'
const NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'STELLAR', address: 'GSTELLARFROM' },
}

// The trustline to USDC from ISSUER, for the selected Stellar wallet unless overridden.
function trustline(overrides: Partial<StellarTrustline> = {}) {
  return stellarTrustline({ issuer: ISSUER, ...overrides })
}

// A trustline the wallet holds, to USDC from ISSUER with the SDK's limit unless overridden.
function line(
  overrides: Partial<Horizon.HorizonApi.BalanceLineAsset> = {},
): BalanceLine {
  return {
    balance: '0',
    limit: TRUSTLINE_LIMIT,
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: ISSUER,
    buying_liabilities: '0',
    selling_liabilities: '0',
    last_modified_ledger: 1,
    is_authorized: true,
    is_authorized_to_maintain_liabilities: true,
    is_clawback_enabled: false,
    ...overrides,
  }
}

function nativeLine(): BalanceLine {
  return {
    balance: '100',
    asset_type: 'native',
    buying_liabilities: '0',
    selling_liabilities: '0',
  }
}

function poolLine(): BalanceLine {
  return {
    liquidity_pool_id: 'pool',
    asset_type: 'liquidity_pool_shares',
    balance: '1',
    limit: TRUSTLINE_LIMIT,
    last_modified_ledger: 1,
    is_authorized: true,
    is_authorized_to_maintain_liabilities: true,
    is_clawback_enabled: false,
  }
}

// The base64 XDR of the `changeTrust` operation to `code` from `issuer` with `limit`, as the Stellar SDK encodes it.
function changeTrustXdr(code: string, issuer: string, limit: string): string {
  return Operation.changeTrust({
    asset: new Asset(code, issuer),
    limit,
  }).toXDR('base64')
}

// The trustline transaction the adapter builds for `trustline()` with the SDK's limit, at `nowS` seconds.
function trustlineTx(nowS = NOW_S): StellarTx {
  return {
    type: TransactionType.STELLAR,
    blockChain: 'STELLAR',
    prerequisites: [],
    data: {
      baseFee: '100',
      memoXdrBase64: null,
      preconditions: {
        timeBounds: { minTime: 0, maxTime: nowS + TIME_BOUND_S },
        ledgerBounds: { minLedger: 0, maxLedger: 0 },
        minSeqNumber: null,
        minSeqAge: null,
        minSeqLedgerGap: null,
        extraSigners: null,
      },
      operationsXdrBase64: [changeTrustXdr('USDC', ISSUER, TRUSTLINE_LIMIT)],
    },
  }
}

/*
 * What the stubbed hub3 wallet holds and was asked. `signers` is read on each call. `lines` answers each
 * `balanceLines` call with the next one, then the last one; an Error rejects.
 */
type Wallet = {
  connected: boolean
  accounts: string[] | null
  signers: SignerFactory
  lines: (BalanceLine[] | Error)[]
  lineReads: string[]
  connects: number
}

// A signer that answers SWAP_HASH for the swap and TRUSTLINE_HASH for anything else, and its `signAndSendTx` mock.
function buildSigner() {
  const signAndSendTx = vi.fn<GenericSigner<StellarTx>['signAndSendTx']>(
    async (tx) => {
      const hash =
        tx.data.operationsXdrBase64[0] === 'payment-op'
          ? SWAP_HASH
          : TRUSTLINE_HASH
      return { hash, response: { hash } }
    },
  )
  const signer: GenericSigner<StellarTx> = {
    signMessage: async () => '',
    signAndSendTx,
  }
  return { signer, signAndSendTx }
}

// A signer factory with `signer` registered for Stellar, and a signer that must not be used for EVM.
function buildSigners(signer: GenericSigner<StellarTx>): SignerFactory {
  const signers = new DefaultSignerFactory()
  signers.registerSigner(TransactionType.EVM, {
    signMessage: async () => '',
    signAndSendTx: async () => {
      throw new Error('The EVM signer was used for a Stellar transaction.')
    },
  })
  signers.registerSigner(TransactionType.STELLAR, signer)
  return signers
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    connected: true,
    accounts: ['stellar:mainnet:GSTELLARFROM', 'stellar:mainnet:GOTHER'],
    signers: buildSigners(buildSigner().signer),
    lines: [[nativeLine(), line()]],
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
 * A real hub3 provider whose `stellar` namespace is stubbed by `wallet`: its state holds `wallet`'s connection and
 * accounts, set once the provider is built, `connect` counts a connect, and `balanceLines` records its account and
 * answers `wallet`'s next lines. Its `signers` metadata property answers `wallet.signers`.
 */
function buildProvider(wallet: Wallet) {
  const namespace = new NamespaceBuilder<StellarActions>('Stellar', PROVIDER_ID)
    .action('connect', async () => {
      wallet.connects += 1
      return []
    })
    .action('balanceLines', async (_context, account) => {
      wallet.lineReads.push(account)
      return next<BalanceLine[]>(wallet.lines)
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
    .add('stellar', namespace)
    .build()
  const [, setState] = namespace.state()
  setState('connected', wallet.connected)
  setState('accounts', wallet.accounts)
  return provider
}

// Executes a one-Step Route over `wallet`, its Stellar payment carrying these Prerequisites, every pending step run.
async function start(
  wallet: Wallet,
  prerequisites: StellarTrustline[] = [],
): Promise<Sdk.RangoClient> {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(stellarTx('payment-op', { prerequisites })),
  )
  const { client } = await createExecutionClient(
    {
      wallet: { stellar: hub3StellarAdapter(buildProvider(wallet)) },
      requests: [],
    },
    CHAINS,
  )
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return client
}

let factory = new IDBFactory()

describe('hub3StellarAdapter', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(NOW_MS)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('a Stellar swap runs to success, signed by the Stellar signer with the first account and no chain ID, without connecting', async () => {
    const { signer, signAndSendTx } = buildSigner()
    const wallet = buildWallet({ signers: buildSigners(signer) })

    const client = await start(wallet)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([
      [stellarTx(), 'GSTELLARFROM', null],
    ])
    expect(httpClient.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, txId: SWAP_HASH }),
    )
    expect(wallet.connects).toBe(0)
    expect(wallet.lineReads).toEqual([])
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

      const client = await start(wallet, [trustline()])

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
      expect(signAndSendTx).not.toHaveBeenCalled()
      expect(wallet.lineReads).toEqual([])
      expect(wallet.connects).toBe(0)
    },
  )

  test('the signer is looked up again on each sign: one the wallet registers after the adapter is built is the one that signs', async () => {
    const first = buildSigner()
    const second = buildSigner()
    const wallet = buildWallet({ signers: buildSigners(first.signer) })
    const adapter = hub3StellarAdapter(buildProvider(wallet))
    wallet.signers = buildSigners(second.signer)

    await adapter.sign({ tx: stellarTx() })

    expect(first.signAndSendTx).not.toHaveBeenCalled()
    expect(second.signAndSendTx.mock.calls).toEqual([
      [stellarTx(), 'GSTELLARFROM', null],
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

  test('a sign error that is not a rejection rejects as a SignerError UNEXPECTED_BEHAVIOUR with the original as its cause', async () => {
    const { signer, signAndSendTx } = buildSigner()
    const error = new Error('The wallet crashed.')
    signAndSendTx.mockRejectedValue(error)
    const adapter = hub3StellarAdapter(
      buildProvider(buildWallet({ signers: buildSigners(signer) })),
    )

    const rejection: unknown = await adapter
      .sign({ tx: stellarTx() })
      .catch(identity)

    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      cause: error,
    })
  })

  test('a sign while the provider has no connected account rejects as a SignerError UNEXPECTED_BEHAVIOUR, without asking the signer', async () => {
    const { signer, signAndSendTx } = buildSigner()
    const adapter = hub3StellarAdapter(
      buildProvider(
        buildWallet({ accounts: [], signers: buildSigners(signer) }),
      ),
    )

    const rejection: unknown = await adapter
      .sign({ tx: stellarTx() })
      .catch(identity)

    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  describe('a swap to a Stellar token', () => {
    test('whose trustline the wallet already holds with enough limit builds and signs no trustline: the lines are read for the Prerequisite’s wallet, and the swap succeeds', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        lines: [
          [nativeLine(), poolLine(), line({ asset_code: 'EUR' }), line()],
        ],
      })

      const client = await start(wallet, [trustline({ wallet: 'GOWNER' })])

      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(wallet.lineReads).toEqual(['GOWNER'])
      expect(signAndSendTx.mock.calls).toEqual([
        [
          stellarTx('payment-op', {
            prerequisites: [trustline({ wallet: 'GOWNER' })],
          }),
          'GSTELLARFROM',
          null,
        ],
      ])
    })

    test.each<[string, BalanceLine[]]>([
      ['no line', []],
      ['only native and pool-share lines', [nativeLine(), poolLine()]],
      [
        'only a line to the same code from another issuer',
        [
          line({
            asset_issuer: OTHER_ISSUER,
          }),
        ],
      ],
      ['only a line to another code', [line({ asset_code: 'EUR' })]],
      ['a line whose limit is too small', [line({ limit: '1000' })]],
    ])(
      'whose wallet holds %s builds the trustline transaction, signs it, then signs the swap and succeeds',
      async (_, lines) => {
        const { signer, signAndSendTx } = buildSigner()
        const wallet = buildWallet({
          signers: buildSigners(signer),
          lines: [lines],
        })

        const client = await start(wallet, [trustline()])

        const view = await historyOf(client)
        expect(view?._queue.status).toBe('SUCCESS')
        expect(signAndSendTx.mock.calls).toEqual([
          [trustlineTx(), 'GSTELLARFROM', null],
          [
            stellarTx('payment-op', { prerequisites: [trustline()] }),
            'GSTELLARFROM',
            null,
          ],
        ])
        expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
          'completed',
        )
      },
    )

    test('for an account the network does not know fails with the SDK’s own failure for the read, and nothing is signed', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        lines: [new NotFoundError('Not Found', {})],
      })

      const client = await start(wallet, [trustline()])

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Could not get account lines from Stellar.',
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    })

    test('whose trustline cannot be built fails with the SDK’s own failure for the build, and nothing is signed', async () => {
      const { signer, signAndSendTx } = buildSigner()
      const wallet = buildWallet({ signers: buildSigners(signer), lines: [[]] })

      const client = await start(wallet, [trustline({ issuer: 'GISSUER' })])

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Could not build the Stellar trustline transaction.',
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    })
  })

  describe('`getTrustline`', () => {
    test('asks `balanceLines` for the Prerequisite’s wallet and answers the matching line’s limit as it is, skipping native and pool-share lines', async () => {
      const wallet = buildWallet({
        lines: [
          [
            nativeLine(),
            poolLine(),
            line({ asset_code: 'EUR', limit: '1' }),
            line({ limit: '12.5' }),
          ],
        ],
      })
      const adapter = hub3StellarAdapter(buildProvider(wallet))

      await expect(
        adapter.getTrustline({ prerequisite: trustline({ wallet: 'GOWNER' }) }),
      ).resolves.toBe('12.5')
      expect(wallet.lineReads).toEqual(['GOWNER'])
    })

    test('answers `null` when only native and pool-share lines are held', async () => {
      const adapter = hub3StellarAdapter(
        buildProvider(buildWallet({ lines: [[nativeLine(), poolLine()]] })),
      )

      await expect(
        adapter.getTrustline({ prerequisite: trustline() }),
      ).resolves.toBeNull()
    })

    test.each<[string, Error]>([
      [
        'an account the network does not know',
        new NotFoundError('Not Found', {}),
      ],
      [
        'hub3’s user-rejected error',
        new Hub3Error('PROVIDER_USER_REJECTED_REQUEST', 'The wallet said no.'),
      ],
    ])(
      'rejects for %s with the error as it is, not a SignerError',
      async (_, error) => {
        const adapter = hub3StellarAdapter(
          buildProvider(buildWallet({ lines: [error] })),
        )

        await expect(
          adapter.getTrustline({ prerequisite: trustline() }).catch(identity),
        ).resolves.toBe(error)
      },
    )
  })

  describe('`buildTransaction`', () => {
    test('answers a 100-stroop `changeTrust` transaction, with `blockChain` from the Prerequisite and `maxTime` 30 s after now, without asking the wallet', async () => {
      const wallet = buildWallet()
      const adapter = hub3StellarAdapter(buildProvider(wallet))

      await expect(
        adapter.buildTransaction({
          prerequisite: trustline(),
          limit: TRUSTLINE_LIMIT,
        }),
      ).resolves.toEqual(trustlineTx())
      expect(wallet.lineReads).toEqual([])
      expect(wallet.connects).toBe(0)
    })

    test('reads the clock on each call', async () => {
      const adapter = hub3StellarAdapter(buildProvider(buildWallet()))
      const later = NOW_MS + ONE_MINUTE_MS

      await adapter.buildTransaction({
        prerequisite: trustline(),
        limit: TRUSTLINE_LIMIT,
      })
      vi.setSystemTime(later)
      const built = await adapter.buildTransaction({
        prerequisite: trustline(),
        limit: TRUSTLINE_LIMIT,
      })

      expect(built.data.preconditions.timeBounds).toEqual({
        minTime: 0,
        maxTime: Math.floor(later / MS_PER_S) + TIME_BOUND_S,
      })
    })

    test('encodes one `changeTrust` operation for the Prerequisite’s asset with the given limit', async () => {
      const adapter = hub3StellarAdapter(buildProvider(buildWallet()))

      const built = await adapter.buildTransaction({
        prerequisite: trustline({ code: 'EURC' }),
        limit: '12.5',
      })

      expect(built.data.operationsXdrBase64).toHaveLength(1)
      const [operationXdr = ''] = built.data.operationsXdrBase64
      const operation = Operation.fromXDRObject(
        xdr.Operation.fromXDR(operationXdr, 'base64'),
      )
      if (operation.type !== 'changeTrust') {
        throw new Error(`Expected a changeTrust, got ${operation.type}`)
      }
      // XDR holds amounts in stroops, so the limit decodes with seven decimals.
      expect(operation.limit).toBe('12.5000000')
      expect(operation.line).toBeInstanceOf(Asset)
      expect(operation.line).toMatchObject({ code: 'EURC', issuer: ISSUER })
    })

    test('rejects with the Stellar SDK’s own error for an asset it cannot build', async () => {
      const adapter = hub3StellarAdapter(buildProvider(buildWallet()))

      const rejection = await adapter
        .buildTransaction({
          prerequisite: trustline({ issuer: 'GISSUER' }),
          limit: TRUSTLINE_LIMIT,
        })
        .catch(identity)

      expect(rejection).toBeInstanceOf(Error)
      expect(rejection).not.toMatchObject({ code: expect.anything() })
    })
  })

  test('a provider without a `stellar` hub3 namespace does not compile', () => {
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

    // @ts-expect-error The adapter needs a `stellar` hub3 namespace.
    expect(() => hub3StellarAdapter(provider)).not.toThrow()
  })
})
