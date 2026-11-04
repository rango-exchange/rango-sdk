// The hub3 Sui adapter, driven through the public client over real hub3 providers with stubbed actions.
import 'fake-indexeddb/auto'

import type { StatefulNamespace } from './accounts.js'
import type * as Sdk from '../../mod.js'
import type { SuiActions } from '@hub3js/sui'
import type { GenericSigner, mainAPI, SignerFactory } from 'rango-types'

import {
  createStore,
  Hub3Error,
  NamespaceBuilder,
  ProviderBuilder,
} from '@hub3js/core'
import { IDBFactory } from 'fake-indexeddb'
import * as LegacySdk from 'rango-sdk'
import {
  DefaultSignerFactory,
  SignerError,
  SignerErrorCode,
  TransactionType,
} from 'rango-types'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { identity, SecondCopyHub3Error } from '../../../tests/hub3.js'
import {
  cacheQuote,
  chain,
  confirmResponse,
  createExecutionClient,
  createTxResponse,
  EXECUTION_OPTIONS,
  historyOf,
  httpClient,
  resetHttpClient,
  SELECTED_WALLETS,
  settle,
  succeeded,
} from '../../../tests/support.js'

import { hub3SuiAdapter } from './sui.js'

type Transaction = mainAPI.Transaction
type SingleChainType =
  | TransactionType.SOLANA
  | TransactionType.STARKNET
  | TransactionType.TON
  | TransactionType.SUI

const PROVIDER_ID = 'test-wallet'
// The single-chain transaction types: the signers for those not under test must not be used.
const SINGLE_CHAIN_TYPES: SingleChainType[] = [
  TransactionType.SOLANA,
  TransactionType.STARKNET,
  TransactionType.TON,
  TransactionType.SUI,
]

/*
 * What the stubbed hub3 wallet holds and was asked: its namespace's connection and CAIP-10 accounts, the signers its
 * `signers` metadata property answers on each call, and how often its namespace was asked to connect.
 */
type Wallet = {
  connected: boolean
  accounts: string[] | null
  signers: SignerFactory
  connects: number
}

/*
 * The namespace under test: the transaction a Route's Step on it carries, the wallet the Route is confirmed with and
 * the second account the hub3 wallet holds after it, as CAIP-10 ids, and the **WalletPort** the adapter builds over a
 * real hub3 provider holding `wallet`, and a sign of `tx` on that adapter alone.
 */
type Case = {
  type: SingleChainType
  tx: Transaction
  blockchain: string
  address: string
  accountIds: [string, string]
  buildPort: (wallet: Wallet) => Sdk.WalletPort
  signAlone: (wallet: Wallet) => Promise<Sdk.SignResult>
}

// A provider builder whose `signers` metadata property answers `wallet.signers`, read on each call.
function providerBuilder(wallet: Wallet) {
  return new ProviderBuilder(PROVIDER_ID, { store: createStore() }).config(
    'metadata',
    {
      name: 'Test wallet',
      icon: '',
      extensions: {},
      properties: [
        { name: 'signers', value: { getSigners: async () => wallet.signers } },
      ],
    },
  )
}

function connect(namespace: StatefulNamespace, wallet: Wallet): void {
  const [, setState] = namespace.state()
  setState('connected', wallet.connected)
  setState('accounts', wallet.accounts)
}

// Counts a connect on `wallet`, which no adapter may ask for.
function recordConnect(wallet: Wallet) {
  return async () => {
    wallet.connects += 1
    return []
  }
}

const SUI_TX: Extract<Transaction, { type: TransactionType.SUI }> = {
  type: LegacySdk.TransactionType.SUI,
  blockChain: 'SUI',
  prerequisites: [],
  unsignedPtbBase64: 'AAAA',
}

// The namespace's state is set once the provider is built, as that is what gives the namespace its store.
function suiAdapter(wallet: Wallet): Sdk.SuiWallet {
  const namespace = new NamespaceBuilder<SuiActions>('sui', PROVIDER_ID)
    .action('connect', recordConnect(wallet))
    .build()
  const provider = providerBuilder(wallet).add('sui', namespace).build()
  connect(namespace, wallet)
  return hub3SuiAdapter(provider)
}

const CASE: Case = {
  type: TransactionType.SUI,
  tx: SUI_TX,
  blockchain: 'SUI',
  address: '0xsui',
  accountIds: ['sui:mainnet:0xsui', 'sui:mainnet:0xother'],
  buildPort: (wallet) => ({ sui: suiAdapter(wallet) }),
  signAlone: async (wallet) => suiAdapter(wallet).sign({ tx: SUI_TX }),
}

const WALLETS = {
  ...SELECTED_WALLETS,
  [CASE.blockchain]: CASE.address,
}
const OPTIONS: Sdk.ExecutionOptions = {
  ...EXECUTION_OPTIONS,
  walletTypes: Object.fromEntries(
    Object.keys(WALLETS).map((blockchain) => [
      blockchain,
      { walletType: `${blockchain.toLowerCase()}-wallet` },
    ]),
  ),
}
const CHAINS = [chain(CASE.blockchain, [])]

function buildSigner(hash: string) {
  const signAndSendTx = vi.fn<GenericSigner<Transaction>['signAndSendTx']>(
    async () => ({ hash, response: { hash } }),
  )
  const signer: GenericSigner<Transaction> = {
    signMessage: async () => '',
    signAndSendTx,
  }
  return { signer, signAndSendTx }
}

// A signer factory with `signer` registered for `type`; the ones for EVM and every other namespace must not be used.
function buildSigners(
  type: SingleChainType,
  signer: GenericSigner<Transaction>,
): SignerFactory {
  const signers = new DefaultSignerFactory()
  for (const other of [TransactionType.EVM, ...SINGLE_CHAIN_TYPES]) {
    signers.registerSigner(other, {
      signMessage: async () => '',
      signAndSendTx: async () => {
        throw new Error(`The ${other} signer was used for a ${type} one.`)
      },
    })
  }
  signers.registerSigner(type, signer)
  return signers
}

// Confirms a one-Step Route of `tx` with WALLETS and executes it on `port`, with every pending step run.
async function start(
  port: Sdk.WalletPort,
  tx: Transaction,
): Promise<Sdk.RangoClient> {
  const { client } = await createExecutionClient(
    { wallet: port, requests: [] },
    CHAINS,
  )
  httpClient.createTransaction.mockResolvedValue(createTxResponse(tx))
  await cacheQuote(client)
  httpClient.confirmRoute.mockResolvedValueOnce(confirmResponse('request-1'))
  await client.confirm('request-1', WALLETS)
  await client.execute('request-1', OPTIONS)
  await settle()
  return client
}

let factory = new IDBFactory()

describe('hub3’s sui adapter', () => {
  const { type, tx, blockchain, address, accountIds, buildPort, signAlone } =
    CASE

  function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
    return {
      connected: true,
      accounts: accountIds,
      signers: buildSigners(type, buildSigner('0xhash1').signer),
      connects: 0,
      ...overrides,
    }
  }

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

  test('a swap runs to success, signed by the signer for its transaction type with the first account and no chain ID, without connecting', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const wallet = buildWallet({ signers: buildSigners(type, signer) })

    const client = await start(buildPort(wallet), tx)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([[tx, address, null]])
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: '0xhash1' })
    expect(httpClient.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, txId: '0xhash1' }),
    )
    expect(wallet.connects).toBe(0)
  })

  test.each<[string, Partial<Wallet>]>([
    ['never connected', { connected: false, accounts: null }],
    ['connected with no accounts', { connected: true, accounts: [] }],
  ])(
    'a provider %s Blocks the run NOT_CONNECTED, without signing or connecting',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const wallet = buildWallet({
        ...overrides,
        signers: buildSigners(type, signer),
      })

      const client = await start(buildPort(wallet), tx)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'NOT_CONNECTED',
        metadata: { blockchain, address },
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
      expect(wallet.connects).toBe(0)
    },
  )

  test('the signer is looked up again on each sign: one the wallet registers after the adapter is built is the one that signs', async () => {
    const first = buildSigner('0xfirst')
    const second = buildSigner('0xsecond')
    const wallet = buildWallet({ signers: buildSigners(type, first.signer) })
    const port = buildPort(wallet)
    wallet.signers = buildSigners(type, second.signer)

    const client = await start(port, tx)

    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(first.signAndSendTx).not.toHaveBeenCalled()
    expect(second.signAndSendTx.mock.calls).toEqual([[tx, address, null]])
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
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      signAndSendTx.mockRejectedValue(error)

      const client = await start(
        buildPort(buildWallet({ signers: buildSigners(type, signer) })),
        tx,
      )

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'USER_REJECT',
        message: 'User rejected the transaction',
        detail: 'User rejected the transaction',
      })
      expect(httpClient.reportFailure).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'USER_REJECT' }),
      )
    },
  )

  test('a plain Error thrown by the signer fails the Execution CLIENT_UNEXPECTED_BEHAVIOUR, with its message as the detail', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    signAndSendTx.mockRejectedValue(new Error('RPC down'))

    const client = await start(
      buildPort(buildWallet({ signers: buildSigners(type, signer) })),
      tx,
    )

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'Unexpected error',
      detail: 'RPC down',
    })
  })

  test('a sign answers the signer’s hash and response as the SignResult', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    signAndSendTx.mockResolvedValue({
      hash: '0xhash1',
      response: { raw: 'from the wallet' },
    })

    const result = await signAlone(
      buildWallet({ signers: buildSigners(type, signer) }),
    )

    expect(result).toEqual({
      hash: '0xhash1',
      response: { raw: 'from the wallet' },
    })
  })

  test.each<[string, Partial<Wallet>]>([
    ['no connected account', { accounts: [] }],
    ['an account but no connection', { connected: false }],
  ])(
    'a sign while the provider has %s rejects as a SignerError UNEXPECTED_BEHAVIOUR, without asking the signer',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const rejection: unknown = await signAlone(
        buildWallet({ ...overrides, signers: buildSigners(type, signer) }),
      ).catch(identity)

      expect(rejection).toBeInstanceOf(SignerError)
      expect(rejection).toMatchObject({
        code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    },
  )
})

describe('hub3’s sui adapter’s parameter', () => {
  test('a provider without the hub3 namespace an adapter reads does not compile', () => {
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

    // @ts-expect-error The adapter needs a `sui` hub3 namespace.
    expect(() => hub3SuiAdapter(provider)).not.toThrow()
  })
})
