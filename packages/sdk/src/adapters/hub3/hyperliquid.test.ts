/*
 * The hub3 Hyperliquid adapter, driven through the public client over real hub3 providers with stubbed actions, with
 * the timers and `fetch` faked.
 */
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'
import type { EvmActions } from '@hub3js/evm'
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
  SignerError,
  SignerErrorCode,
  TransactionType,
} from 'rango-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  chain,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  evmBlockchains,
  EXECUTION_OPTIONS,
  historyOf,
  httpClient,
  HYPERLIQUID_EXCHANGE_URL,
  HYPERLIQUID_NONCE,
  hyperliquidTx,
  hyperliquidTypedData,
  resetHttpClient,
  settle,
  SIGNATURE_CHAIN_ID,
  SIGNATURE_R,
  SIGNATURE_S,
  signatureWith,
  signerError,
  stubHyperliquid,
  succeeded,
} from '../../../tests/support.js'

import { hub3HyperliquidAdapter } from './hyperliquid.js'

type Hex = `0x${string}`
type EvmTransaction = mainAPI.EvmTransaction
type SignTypedData = NonNullable<GenericSigner<EvmTransaction>['signTypedData']>

const PROVIDER_ID = 'test-wallet'
const CHAINS = [
  ...evmBlockchains,
  chain('HYPERLIQUID', ['^(0x)[0-9A-Fa-f]{40}$']),
]
// The selected Hyperliquid wallet, and another account the wallet holds after it.
const SWAP_WALLET = '0xhyperliquid'
const OTHER_ACCOUNT = '0xother'
const WRONG_CHAIN_ID = '0x1'
// The hash the explorer lists the posted action under.
const HASH = '0xhyperhash'
// The `v` a signature ending in 1c is posted as.
const V_ODD = 28
const SIGNATURE = signatureWith('1c')
const NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'HYPERLIQUID', address: SWAP_WALLET },
}

/*
 * What the stubbed hub3 wallet holds and was asked. `chainId` and `signers` are read on each call. `connect` moves the
 * wallet to the chain it is given, unless `isStuck`.
 */
type Wallet = {
  connected: boolean
  accounts: string[] | null
  chainId: Hex
  isStuck: boolean
  signers: SignerFactory
  connects: Parameters<EvmActions['connect']>[0][]
  signerLookups: number
}

function buildSigner(signature = SIGNATURE) {
  const signTypedData = vi.fn<SignTypedData>(async () => signature)
  const signer: GenericSigner<EvmTransaction> = {
    signMessage: async () => '',
    signAndSendTx: async () => {
      throw new Error('signAndSendTx was used for a Hyperliquid action.')
    },
    signTypedData,
  }
  return { signer, signTypedData }
}

// A signer factory with `signer` registered for EVM, and a signer that must not be used for SOLANA.
function buildSigners(signer: GenericSigner<EvmTransaction>): SignerFactory {
  const signers = new DefaultSignerFactory()
  signers.registerSigner(TransactionType.EVM, signer)
  signers.registerSigner(TransactionType.SOLANA, {
    signMessage: async () => '',
    signAndSendTx: async () => {
      throw new Error('The SOLANA signer was used for a Hyperliquid action.')
    },
    signTypedData: async () => {
      throw new Error('The SOLANA signer was used for a Hyperliquid action.')
    },
  })
  return signers
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    connected: true,
    accounts: [`eip155:42161:${SWAP_WALLET}`, `eip155:42161:${OTHER_ACCOUNT}`],
    chainId: SIGNATURE_CHAIN_ID,
    isStuck: false,
    signers: buildSigners(buildSigner().signer),
    connects: [],
    signerLookups: 0,
    ...overrides,
  }
}

/*
 * A real hub3 provider whose `evm` namespace is stubbed by `wallet`: its state holds `wallet`'s connection and
 * accounts, `getChainId` answers `wallet.chainId`, and `connect` records its argument and moves `wallet` to that chain
 * unless it is stuck. Its `signers` metadata property answers `wallet.signers` and counts the lookups.
 */
function buildProvider(wallet: Wallet) {
  const namespace = new NamespaceBuilder<EvmActions>('eip155', PROVIDER_ID)
    .action('getChainId', async () => wallet.chainId)
    .action('connect', async (_context, chain) => {
      wallet.connects.push(chain)
      const chainId = typeof chain === 'object' ? chain.chainId : chain
      if (!wallet.isStuck && chainId?.startsWith('0x') === true) {
        wallet.chainId = `0x${chainId.slice(2)}`
      }
      return { accounts: [], network: wallet.chainId }
    })
    .build()
  const provider = new ProviderBuilder(PROVIDER_ID, { store: createStore() })
    .config('metadata', {
      name: 'Test wallet',
      icon: '',
      extensions: {},
      properties: [
        {
          name: 'signers',
          value: {
            getSigners: async () => {
              wallet.signerLookups += 1
              return wallet.signers
            },
          },
        },
      ],
    })
    .add('evm', namespace)
    .build()
  const [, setState] = namespace.state()
  setState('connected', wallet.connected)
  setState('accounts', wallet.accounts)
  return provider
}

// Executes a one-Step Route of a withdraw3 action over `wallet`'s adapter, with every pending step run.
async function executeWithdrawRouteWith(wallet: Wallet) {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(hyperliquidTx()),
  )
  const { client } = await createExecutionClient(
    {
      wallet: { hyperliquid: hub3HyperliquidAdapter(buildProvider(wallet)) },
      requests: [],
    },
    CHAINS,
  )
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return client
}

// The typed data the SDK hands `signTypedData` for a withdraw3, as ethers takes it.
function withdrawTypedData() {
  const primaryType = 'HyperliquidTransaction:Withdraw'
  const typedData = hyperliquidTypedData(primaryType)
  return {
    domain: typedData.domain,
    types: { [primaryType]: typedData.types[primaryType] },
    value: typedData.message,
  }
}

let factory = new IDBFactory()

describe('hub3HyperliquidAdapter', () => {
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('a Hyperliquid action runs to success, signed as typed data by the EVM signer with the first account, the swap wallet, and the action’s chain ID, and posted with the signature split into r, s and v', async () => {
    const hyperliquid = stubHyperliquid({
      explorer: [buildExplorerAnswerHoldingWithdraw(HASH)],
    })
    const { signer, signTypedData } = buildSigner()
    const wallet = buildWallet({ signers: buildSigners(signer) })

    const client = await executeWithdrawRouteWith(wallet)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(signTypedData.mock.calls).toEqual([
      [withdrawTypedData(), SWAP_WALLET, SIGNATURE_CHAIN_ID],
    ])
    expect(wallet.connects).toEqual([])
    expect(hyperliquid.posts[0]).toEqual({
      url: HYPERLIQUID_EXCHANGE_URL,
      body: {
        action: hyperliquidTx().action,
        signature: { r: SIGNATURE_R, s: SIGNATURE_S, v: V_ODD },
        nonce: HYPERLIQUID_NONCE,
      },
    })
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: HASH })
  })

  test.each<[string, Partial<Wallet>]>([
    ['never connected', { connected: false, accounts: null }],
    ['connected with no accounts', { connected: true, accounts: [] }],
  ])(
    'a provider %s Blocks the run NOT_CONNECTED, without signing or posting',
    async (_, overrides) => {
      const hyperliquid = stubHyperliquid()
      const { signer, signTypedData } = buildSigner()

      const client = await executeWithdrawRouteWith(
        buildWallet({ ...overrides, signers: buildSigners(signer) }),
      )

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
      expect(signTypedData).not.toHaveBeenCalled()
      expect(hyperliquid.posts).toEqual([])
    },
  )

  test('a wallet whose first account is another Blocks the run ACCOUNT_MISMATCH, without signing or posting', async () => {
    const hyperliquid = stubHyperliquid()
    const { signer, signTypedData } = buildSigner()

    const client = await executeWithdrawRouteWith(
      buildWallet({
        accounts: [
          `eip155:42161:${OTHER_ACCOUNT}`,
          `eip155:42161:${SWAP_WALLET}`,
        ],
        signers: buildSigners(signer),
      }),
    )

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'ACCOUNT_MISMATCH',
      metadata: { blockchain: 'HYPERLIQUID', address: SWAP_WALLET },
    })
    expect(signTypedData).not.toHaveBeenCalled()
    expect(hyperliquid.posts).toEqual([])
  })

  test('`getAccount` answers the first account’s address, and `getChainId` the namespace’s chain ID', async () => {
    const adapter = hub3HyperliquidAdapter(buildProvider(buildWallet()))

    await expect(adapter.getAccount()).resolves.toBe(SWAP_WALLET)
    await expect(adapter.getChainId()).resolves.toBe(SIGNATURE_CHAIN_ID)
  })

  test('a wallet on the wrong network is switched with the bare chain ID, then signs', async () => {
    stubHyperliquid()
    const { signer, signTypedData } = buildSigner()
    const wallet = buildWallet({
      chainId: WRONG_CHAIN_ID,
      signers: buildSigners(signer),
    })

    const client = await executeWithdrawRouteWith(wallet)

    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(wallet.connects).toEqual([SIGNATURE_CHAIN_ID])
    expect(signTypedData).toHaveBeenCalledTimes(1)
  })

  test('a wallet still on the wrong network after the switch Blocks the run NETWORK_MISMATCH, without signing or posting', async () => {
    const hyperliquid = stubHyperliquid()
    const { signer, signTypedData } = buildSigner()
    const wallet = buildWallet({
      chainId: WRONG_CHAIN_ID,
      isStuck: true,
      signers: buildSigners(signer),
    })

    const client = await executeWithdrawRouteWith(wallet)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NETWORK_MISMATCH',
      metadata: {
        blockchain: 'HYPERLIQUID',
        address: SWAP_WALLET,
        requiredChainId: SIGNATURE_CHAIN_ID,
      },
    })
    expect(wallet.connects).toEqual([SIGNATURE_CHAIN_ID])
    expect(signTypedData).not.toHaveBeenCalled()
    expect(hyperliquid.posts).toEqual([])
  })

  test('the signer is looked up again on every call: one the wallet registers after a sign is the one that signs next', async () => {
    const first = buildSigner(signatureWith('1b'))
    const second = buildSigner(SIGNATURE)
    const wallet = buildWallet({ signers: buildSigners(first.signer) })
    const adapter = hub3HyperliquidAdapter(buildProvider(wallet))
    const request = {
      typedData: withdrawTypedData(),
      chainId: SIGNATURE_CHAIN_ID,
    }

    await expect(adapter.signTypedData(request)).resolves.toBe(
      signatureWith('1b'),
    )
    wallet.signers = buildSigners(second.signer)
    await expect(adapter.signTypedData(request)).resolves.toBe(SIGNATURE)

    expect(wallet.signerLookups).toBe(2)
    expect(first.signTypedData).toHaveBeenCalledTimes(1)
    expect(second.signTypedData).toHaveBeenCalledTimes(1)
  })

  test('a signer without `signTypedData` rejects with its own SignerError UNEXPECTED_BEHAVIOUR, not a wrapped throw, and fails the run CLIENT_UNEXPECTED_BEHAVIOUR', async () => {
    const hyperliquid = stubHyperliquid()
    const signer: GenericSigner<EvmTransaction> = {
      signMessage: async () => '',
      signAndSendTx: async () => ({ hash: '0xhash' }),
    }
    const wallet = buildWallet({ signers: buildSigners(signer) })
    const adapter = hub3HyperliquidAdapter(buildProvider(wallet))

    const rejection: unknown = await adapter
      .signTypedData({
        typedData: withdrawTypedData(),
        chainId: SIGNATURE_CHAIN_ID,
      })
      .catch((error: unknown) => error)

    expect(rejection).toBeInstanceOf(SignerError)
    // A wrapped throw would carry the thrown error as its root; this one is the adapter's own.
    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      root: undefined,
      cause: undefined,
    })
    const client = await executeWithdrawRouteWith(wallet)
    const view = await historyOf(client)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toMatchObject({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    })
    expect(hyperliquid.posts).toEqual([])
  })

  describe('an error thrown by the signer’s `signTypedData`', () => {
    async function runThrowing(error: unknown) {
      const hyperliquid = stubHyperliquid()
      const { signer, signTypedData } = buildSigner()
      signTypedData.mockImplementation(async () => {
        throw error
      })
      const client = await executeWithdrawRouteWith(
        buildWallet({ signers: buildSigners(signer) }),
      )
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(hyperliquid.posts).toEqual([])
      return view
    }

    test('that is a SignerError reaches the Execution failure with its own code and detail', async () => {
      const error = signerError(
        SignerErrorCode.SIGN_TX_ERROR,
        'Wallet said no',
        { message: 'bad typed data' },
      )

      const view = await runThrowing(error)

      expect(view?._storage.failure).toMatchObject({
        reasonCode: 'CALL_WALLET_FAILED',
        message: error.message,
        detail: 'Wallet said no',
      })
    })

    test('that is hub3’s user-rejected error fails the Execution CLIENT_UNEXPECTED_BEHAVIOUR', async () => {
      const view = await runThrowing(
        new Hub3Error('PROVIDER_USER_REJECTED_REQUEST', 'The wallet said no.'),
      )

      expect(view?._storage.failure).toMatchObject({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      })
    })

    test('that is anything else fails the Execution CLIENT_UNEXPECTED_BEHAVIOUR', async () => {
      const view = await runThrowing(new Error('RPC down'))

      expect(view?._storage.failure).toMatchObject({
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      })
    })

    test.each<[string, unknown]>([
      ['an Error', new Error('RPC down')],
      ['a string', 'RPC down'],
      [
        'hub3’s user-rejected error',
        new Hub3Error('PROVIDER_USER_REJECTED_REQUEST', 'The wallet said no.'),
      ],
    ])(
      'that is %s rejects as a SignerError UNEXPECTED_BEHAVIOUR whose root and cause are the original',
      async (_, error) => {
        const { signer, signTypedData } = buildSigner()
        signTypedData.mockImplementation(async () => {
          throw error
        })
        const adapter = hub3HyperliquidAdapter(
          buildProvider(buildWallet({ signers: buildSigners(signer) })),
        )

        const rejection: unknown = await adapter
          .signTypedData({
            typedData: withdrawTypedData(),
            chainId: SIGNATURE_CHAIN_ID,
          })
          .catch((error: unknown) => error)

        expect(rejection).toBeInstanceOf(SignerError)
        expect(rejection).toMatchObject({
          code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
          root: error,
          cause: error,
        })
      },
    )
  })

  test('a provider without an `evm` hub3 namespace does not compile', () => {
    const provider = new ProviderBuilder('no-evm', { store: createStore() })
      .config('metadata', { name: 'No EVM', icon: '', extensions: {} })
      .add(
        'solana',
        new NamespaceBuilder<{ connect: () => Promise<string[]> }>(
          'solana',
          'no-evm',
        )
          .action('connect', async () => [])
          .build(),
      )
      .build()

    // @ts-expect-error The adapter needs an `evm` hub3 namespace.
    expect(() => hub3HyperliquidAdapter(provider)).not.toThrow()
  })
})

// An explorer `userDetails` answer holding the posted withdraw3 under `hash`.
function buildExplorerAnswerHoldingWithdraw(hash: Hex) {
  return {
    type: 'userDetails',
    txs: [
      {
        action: { type: 'withdraw3', time: HYPERLIQUID_NONCE },
        hash,
        user: SWAP_WALLET,
        time: HYPERLIQUID_NONCE,
      },
    ],
  }
}
