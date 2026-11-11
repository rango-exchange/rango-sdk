// The hub3 BIP-122 adapter, driven through the public client over real hub3 providers with stubbed actions.
import 'fake-indexeddb/auto'

import type { Bip122Provider } from './bip122.js'
import type * as Sdk from '../../mod.js'
import type { Bip122NetworkName, UtxoActions } from '@hub3js/bip122'
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

import { hub3Bip122Adapter } from './bip122.js'

type Transaction = mainAPI.Transaction
type Transfer = Extract<Transaction, { type: TransactionType.TRANSFER }>

const PROVIDER_ID = 'test-wallet'
const BTC_REF = '000000000019d6689c085ae165831e93'
const LTC_REF = '12a765e31ffd4059bada1e25190f6e98'
// A UTXO blockchain outside hub3's `NETWORKS`, so no adapter is built for it.
const UNKNOWN_BLOCKCHAIN = 'DASH'

// A Litecoin account first, so an adapter that ignored the blockchain would read or sign with it.
const ACCOUNT_IDS = [
  `bip122:${LTC_REF}:ltc1from`,
  `bip122:${BTC_REF}:bc1from`,
  `bip122:${BTC_REF}:bc1other`,
]

/*
 * What the stubbed hub3 wallet holds and was asked: its `utxo` namespace's connection and CAIP-10 accounts, the
 * signers its `signers` metadata property answers on each call, and how often its namespace was asked to connect.
 */
type Wallet = {
  connected: boolean
  accounts: string[] | null
  signers: SignerFactory
  connects: number
}

function transfer(blockchain: string, from: string): Transfer {
  return {
    type: LegacySdk.TransactionType.TRANSFER,
    blockChain: blockchain,
    prerequisites: [],
    method: 'transfer',
    asset: {
      blockchain,
      symbol: blockchain,
      address: null,
      ticker: blockchain,
    },
    amount: '100000',
    decimals: 8,
    fromWalletAddress: from,
    recipientAddress: 'to',
    memo: null,
    psbt: null,
  }
}

// The namespace's state is set once the provider is built, as that is what gives the namespace its store.
function buildProvider(wallet: Wallet): Bip122Provider {
  const namespace = new NamespaceBuilder<UtxoActions>('bip122', PROVIDER_ID)
    .action('connect', async () => {
      wallet.connects += 1
      return []
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
    .add('utxo', namespace)
    .build()
  const [, setState] = namespace.state()
  setState('connected', wallet.connected)
  setState('accounts', wallet.accounts)
  return provider
}

// The bip122 entry a Host builds for one multi-network wallet: an adapter per blockchain over the same provider.
function bip122Port(wallet: Wallet): NonNullable<Sdk.WalletPort['bip122']> {
  const provider = buildProvider(wallet)
  return {
    BTC: hub3Bip122Adapter(provider, 'BTC'),
    LTC: hub3Bip122Adapter(provider, 'LTC'),
  }
}

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

// A signer factory with `signer` registered for TRANSFER, and, for every other namespace, one that must not be used.
function buildSigners(signer: GenericSigner<Transaction>): SignerFactory {
  const signers = new DefaultSignerFactory()
  for (const other of [
    TransactionType.EVM,
    TransactionType.SOLANA,
    TransactionType.TRON,
  ]) {
    signers.registerSigner(other, {
      signMessage: async () => '',
      signAndSendTx: async () => {
        throw new Error(`The ${other} signer was used for a TRANSFER one.`)
      },
    })
  }
  signers.registerSigner(TransactionType.TRANSFER, signer)
  return signers
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    connected: true,
    accounts: ACCOUNT_IDS,
    signers: buildSigners(buildSigner('0xhash1').signer),
    connects: 0,
    ...overrides,
  }
}

const CHAINS = ['BTC', 'LTC', UNKNOWN_BLOCKCHAIN].map((name) => chain(name, []))

// Confirms a one-Step Route whose transaction is `tx` and executes it on `port`, with every pending step run.
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
  await client.confirm('request-1', SELECTED_WALLETS)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return client
}

let factory = new IDBFactory()

describe('hub3Bip122Adapter', () => {
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

  test('a BTC swap runs to success, signed by the TRANSFER signer with the first BTC account and no chain ID, without connecting', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const wallet = buildWallet({ signers: buildSigners(signer) })
    const tx = transfer('BTC', 'bc1from')

    const client = await start({ bip122: bip122Port(wallet) }, tx)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([[tx, 'bc1from', null]])
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
    [
      'connected with only another blockchain’s accounts',
      { accounts: [`bip122:${LTC_REF}:ltc1from`] },
    ],
    [
      'connected with only an account on a blockchain outside hub3’s `NETWORKS`',
      { accounts: [`bip122:${UNKNOWN_BLOCKCHAIN}:bc1from`] },
    ],
  ])(
    'a provider %s Blocks a BTC run NOT_CONNECTED, without signing or connecting',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const wallet = buildWallet({
        ...overrides,
        signers: buildSigners(signer),
      })

      const client = await start(
        { bip122: bip122Port(wallet) },
        transfer('BTC', 'bc1from'),
      )

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'NOT_CONNECTED',
        metadata: { blockchain: 'BTC', address: 'bc1from' },
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
      expect(wallet.connects).toBe(0)
    },
  )

  test('a BTC swap from the wallet’s LTC address Blocks ACCOUNT_MISMATCH, without signing', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')

    const client = await start(
      { bip122: bip122Port(buildWallet({ signers: buildSigners(signer) })) },
      transfer('BTC', 'ltc1from'),
    )

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'ACCOUNT_MISMATCH',
      metadata: { blockchain: 'BTC', address: 'ltc1from' },
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  test('a BTC swap from the wallet’s second BTC account Blocks ACCOUNT_MISMATCH: only the first is answered', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')

    const client = await start(
      { bip122: bip122Port(buildWallet({ signers: buildSigners(signer) })) },
      transfer('BTC', 'bc1other'),
    )

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'ACCOUNT_MISMATCH',
      metadata: { blockchain: 'BTC', address: 'bc1other' },
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  test('an LTC swap from the wallet’s LTC address runs to success, signed with it', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const tx = transfer('LTC', 'ltc1from')

    const client = await start(
      { bip122: bip122Port(buildWallet({ signers: buildSigners(signer) })) },
      tx,
    )

    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([[tx, 'ltc1from', null]])
  })

  test.each([
    ['BTC', 'bc1from'],
    ['LTC', 'ltc1from'],
  ])(
    'a %s swap with a provider per blockchain is read and signed by that blockchain’s provider only',
    async (blockchain, address) => {
      const btc = buildSigner('0xbtc')
      const ltc = buildSigner('0xltc')
      // Each wallet holds the other blockchain's account first, so a run that used the wrong provider would not match.
      const btcWallet = buildWallet({
        accounts: [`bip122:${LTC_REF}:ltc1other`, `bip122:${BTC_REF}:bc1from`],
        signers: buildSigners(btc.signer),
      })
      const ltcWallet = buildWallet({
        accounts: [`bip122:${BTC_REF}:bc1other`, `bip122:${LTC_REF}:ltc1from`],
        signers: buildSigners(ltc.signer),
      })
      const tx = transfer(blockchain, address)

      const client = await start(
        {
          bip122: {
            BTC: hub3Bip122Adapter(buildProvider(btcWallet), 'BTC'),
            LTC: hub3Bip122Adapter(buildProvider(ltcWallet), 'LTC'),
          },
        },
        tx,
      )

      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      const [used, unused] = blockchain === 'BTC' ? [btc, ltc] : [ltc, btc]
      expect(used.signAndSendTx.mock.calls).toEqual([[tx, address, null]])
      expect(unused.signAndSendTx).not.toHaveBeenCalled()
    },
  )

  test('a BTC swap with adapters for other blockchains only Blocks NOT_CONNECTED, without signing', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const provider = buildProvider(
      buildWallet({ signers: buildSigners(signer) }),
    )

    const client = await start(
      {
        bip122: {
          LTC: hub3Bip122Adapter(provider, 'LTC'),
          DOGE: hub3Bip122Adapter(provider, 'DOGE'),
        },
      },
      transfer('BTC', 'bc1from'),
    )

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: 'BTC', address: 'bc1from' },
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  // A wrong adapter answers its own blockchain's account, which is not the entry's address.
  test.each<[string, (ltc: Sdk.Bip122Wallet) => Sdk.WalletPort['bip122']]>([
    ['the LTC adapter under BTC', (ltc) => ({ BTC: ltc })],
    ['a flat LTC adapter', (ltc) => ltc],
  ])(
    'a BTC swap from the wallet’s BTC address with %s Blocks ACCOUNT_MISMATCH, without signing',
    async (_, buildEntry) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const ltc = hub3Bip122Adapter(
        buildProvider(buildWallet({ signers: buildSigners(signer) })),
        'LTC',
      )

      const client = await start(
        { bip122: buildEntry(ltc) },
        transfer('BTC', 'bc1from'),
      )

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'ACCOUNT_MISMATCH',
        metadata: { blockchain: 'BTC', address: 'bc1from' },
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    },
  )

  test('a swap on a UTXO blockchain outside hub3’s `NETWORKS`, which has no adapter, Blocks NOT_CONNECTED, and nothing is signed', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const wallet = buildWallet({
      accounts: [...ACCOUNT_IDS, `bip122:${UNKNOWN_BLOCKCHAIN}:Xfrom`],
      signers: buildSigners(signer),
    })

    const client = await start(
      { bip122: bip122Port(wallet) },
      transfer(UNKNOWN_BLOCKCHAIN, 'Xfrom'),
    )

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('BLOCKED')
    expect(view?._queue.blocked).toEqual({
      reason: 'NOT_CONNECTED',
      metadata: { blockchain: UNKNOWN_BLOCKCHAIN, address: 'Xfrom' },
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  test.each<[Bip122NetworkName, string]>([
    ['BTC', BTC_REF],
    ['LTC', LTC_REF],
    ['DOGE', '1a91e3dace36e2be3bf030a65679fe82'],
    ['BCH', '000000000000000000651ef99cb9fcbe'],
    ['ZCASH', '00040fe8ec8471911baa1db1266ea15d'],
  ])(
    'getAccount of the %s adapter answers only the first account whose CAIP-2 reference is %s',
    async (blockchain, reference) => {
      const adapter = hub3Bip122Adapter(
        buildProvider(
          buildWallet({
            accounts: [
              'bip122:00000000000000000000000000000000:elsewhere',
              `bip122:${reference}:first`,
              `bip122:${BTC_REF.replace('0', '1')}:near`,
              `bip122:${reference}:second`,
            ],
          }),
        ),
        blockchain,
      )

      await expect(adapter.getAccount()).resolves.toBe('first')
    },
  )

  test('getAccount of the LTC adapter ignores the BTC accounts ahead of the LTC one', async () => {
    const adapter = hub3Bip122Adapter(
      buildProvider(
        buildWallet({
          accounts: [
            `bip122:${BTC_REF}:bc1from`,
            `bip122:${BTC_REF}:bc1other`,
            `bip122:${LTC_REF}:ltc1from`,
          ],
        }),
      ),
      'LTC',
    )

    await expect(adapter.getAccount()).resolves.toBe('ltc1from')
  })

  test.each([
    `bip122:${BTC_REF}`,
    `${BTC_REF}:first`,
    'not-a-caip-id',
    `bip122:${BTC_REF}:`,
    `bip122:${BTC_REF}:a:b`,
  ])(
    'getAccount of the BTC adapter skips the malformed account %j ahead of a matching one, and answers the matching one',
    async (malformed) => {
      const adapter = hub3Bip122Adapter(
        buildProvider(
          buildWallet({ accounts: [malformed, `bip122:${BTC_REF}:second`] }),
        ),
        'BTC',
      )

      await expect(adapter.getAccount()).resolves.toBe('second')
    },
  )

  test.each<[string, Partial<Wallet>]>([
    ['never connected', { connected: false, accounts: null }],
    [
      'connected with only BTC accounts',
      { accounts: [`bip122:${BTC_REF}:bc1from`] },
    ],
    [
      'connected with only an account on a blockchain outside hub3’s `NETWORKS`',
      { accounts: [`bip122:${UNKNOWN_BLOCKCHAIN}:ltc1from`] },
    ],
  ])(
    'the LTC adapter over a provider %s answers getAccount null, and its sign rejects as a SignerError UNEXPECTED_BEHAVIOUR naming the blockchain, without asking the signer',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const adapter = hub3Bip122Adapter(
        buildProvider(
          buildWallet({ ...overrides, signers: buildSigners(signer) }),
        ),
        'LTC',
      )

      await expect(adapter.getAccount()).resolves.toBeNull()
      const rejection: unknown = await adapter
        .sign({ tx: transfer('LTC', 'ltc1from') })
        .catch((error: unknown) => error)

      expect(rejection).toBeInstanceOf(SignerError)
      expect(rejection).toMatchObject({
        code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
        root: new Error(
          `The hub3 provider "${PROVIDER_ID}" has no connected "utxo" account on "LTC" to sign with.`,
        ),
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    },
  )

  test('the signer is looked up again on each sign: one the wallet registers after the adapter is built is the one that signs', async () => {
    const first = buildSigner('0xfirst')
    const second = buildSigner('0xsecond')
    const wallet = buildWallet({ signers: buildSigners(first.signer) })
    const port = { bip122: bip122Port(wallet) }
    wallet.signers = buildSigners(second.signer)
    const tx = transfer('BTC', 'bc1from')

    const client = await start(port, tx)

    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(first.signAndSendTx).not.toHaveBeenCalled()
    expect(second.signAndSendTx.mock.calls).toEqual([[tx, 'bc1from', null]])
  })

  test('hub3’s user-rejected error, thrown by the signer, fails the Execution CLIENT_UNEXPECTED_BEHAVIOUR', async () => {
    const error = new Hub3Error(
      'PROVIDER_USER_REJECTED_REQUEST',
      'The wallet said no.',
    )
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    signAndSendTx.mockRejectedValue(error)

    const client = await start(
      {
        bip122: bip122Port(buildWallet({ signers: buildSigners(signer) })),
      },
      transfer('BTC', 'bc1from'),
    )

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('FAILED')
    expect(view?._storage.failure).toEqual({
      reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
      message: 'Unexpected error',
      detail: 'The wallet said no.',
    })
  })

  test('a provider without hub3’s `utxo` namespace does not compile', () => {
    const provider = new ProviderBuilder('bip122-key', { store: createStore() })
      .config('metadata', { name: 'BIP-122 key', icon: '', extensions: {} })
      .add(
        'bip122',
        new NamespaceBuilder<UtxoActions>('bip122', 'bip122-key')
          .action('connect', async () => [])
          .build(),
      )
      .build()

    // @ts-expect-error The adapter reads hub3's `utxo` namespace.
    expect(() => hub3Bip122Adapter(provider, 'BTC')).not.toThrow()
  })

  test('a provider without a blockchain, or with a blockchain outside hub3’s `NETWORKS`, does not compile', () => {
    const provider = buildProvider(buildWallet())

    // @ts-expect-error The adapter serves one blockchain, which it must be told.
    expect(() => hub3Bip122Adapter(provider)).not.toThrow()
    // @ts-expect-error `DASH` is not one of hub3's UTXO blockchains.
    expect(() => hub3Bip122Adapter(provider, 'DASH')).not.toThrow()
  })
})
