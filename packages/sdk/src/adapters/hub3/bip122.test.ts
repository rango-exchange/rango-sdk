// The hub3 BIP-122 adapter, driven through the public client over real hub3 providers with stubbed actions.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'
import type { UtxoActions } from '@hub3js/bip122'
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

import { hub3Bip122Adapter } from './bip122.js'

type Transaction = mainAPI.Transaction
type Transfer = Extract<Transaction, { type: TransactionType.TRANSFER }>

const PROVIDER_ID = 'test-wallet'
const BTC_REF = '000000000019d6689c085ae165831e93'
const LTC_REF = '12a765e31ffd4059bada1e25190f6e98'
// A UTXO blockchain the adapter has no genesis ref for.
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
function bip122Adapter(wallet: Wallet): Sdk.Bip122Wallet {
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
  return hub3Bip122Adapter(provider)
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

describe('hub3’s bip122 adapter', () => {
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

    const client = await start({ bip122: bip122Adapter(wallet) }, tx)

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
  ])(
    'a provider %s Blocks a BTC run NOT_CONNECTED, without signing or connecting',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const wallet = buildWallet({
        ...overrides,
        signers: buildSigners(signer),
      })

      const client = await start(
        { bip122: bip122Adapter(wallet) },
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
      { bip122: bip122Adapter(buildWallet({ signers: buildSigners(signer) })) },
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
      { bip122: bip122Adapter(buildWallet({ signers: buildSigners(signer) })) },
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
      { bip122: bip122Adapter(buildWallet({ signers: buildSigners(signer) })) },
      tx,
    )

    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([[tx, 'ltc1from', null]])
  })

  test('a swap on a UTXO blockchain not in the table Blocks NOT_CONNECTED, and nothing is signed', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const wallet = buildWallet({
      accounts: [...ACCOUNT_IDS, `bip122:${UNKNOWN_BLOCKCHAIN}:Xfrom`],
      signers: buildSigners(signer),
    })

    const client = await start(
      { bip122: bip122Adapter(wallet) },
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

  test.each([
    ['BTC', BTC_REF],
    ['LTC', LTC_REF],
    ['DOGE', '1a91e3dace36e2be3bf030a65679fe82'],
    ['BCH', '000000000000000000651ef99cb9fcbe'],
    ['ZCASH', '00040fe8ec8471911baa1db1266ea15d'],
  ])(
    'getAccount for %s answers only the first account whose CAIP-2 reference is %s',
    async (blockchain, reference) => {
      const adapter = bip122Adapter(
        buildWallet({
          accounts: [
            'bip122:00000000000000000000000000000000:elsewhere',
            `bip122:${reference}:first`,
            `bip122:${BTC_REF.replace('0', '1')}:near`,
            `bip122:${reference}:second`,
          ],
        }),
      )

      await expect(adapter.getAccount({ blockchain })).resolves.toBe('first')
    },
  )

  test.each([UNKNOWN_BLOCKCHAIN, 'btc', 'toString', ''])(
    'getAccount for %j, not in the table, answers null whatever the wallet holds',
    async (blockchain) => {
      const adapter = bip122Adapter(
        buildWallet({
          accounts: [...ACCOUNT_IDS, `bip122:${blockchain}:guess`],
        }),
      )

      await expect(adapter.getAccount({ blockchain })).resolves.toBeNull()
    },
  )

  test('a sign on a blockchain not in the table rejects as a SignerError UNEXPECTED_BEHAVIOUR, without asking the signer', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const adapter = bip122Adapter(
      buildWallet({ signers: buildSigners(signer) }),
    )

    const rejection: unknown = await adapter
      .sign({
        blockchain: UNKNOWN_BLOCKCHAIN,
        tx: transfer(UNKNOWN_BLOCKCHAIN, 'bc1from'),
      })
      .catch(identity)

    expect(rejection).toBeInstanceOf(SignerError)
    expect(rejection).toMatchObject({
      code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
    })
    expect(signAndSendTx).not.toHaveBeenCalled()
  })

  test('the signer is looked up again on each sign: one the wallet registers after the adapter is built is the one that signs', async () => {
    const first = buildSigner('0xfirst')
    const second = buildSigner('0xsecond')
    const wallet = buildWallet({ signers: buildSigners(first.signer) })
    const port = { bip122: bip122Adapter(wallet) }
    wallet.signers = buildSigners(second.signer)
    const tx = transfer('BTC', 'bc1from')

    const client = await start(port, tx)

    expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
    expect(first.signAndSendTx).not.toHaveBeenCalled()
    expect(second.signAndSendTx.mock.calls).toEqual([[tx, 'bc1from', null]])
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
        {
          bip122: bip122Adapter(buildWallet({ signers: buildSigners(signer) })),
        },
        transfer('BTC', 'bc1from'),
      )

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('FAILED')
      expect(view?._storage.failure).toEqual({
        reasonCode: 'USER_REJECT',
        message: 'User rejected the transaction',
        detail: 'User rejected the transaction',
      })
    },
  )

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
    expect(() => hub3Bip122Adapter(provider)).not.toThrow()
  })
})
