// The hub3 EVM adapter, driven through the public client over real hub3 providers with stubbed actions.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'
import type {
  AllowanceParams,
  EvmActions,
  EvmTransactionReceipt,
} from '@hub3js/evm'
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
  advance,
  BSC_ASSET,
  chain,
  confirmQuote,
  createExecutionClient,
  createTxResponse,
  describedChain,
  evmApprove,
  evmBlockchains,
  evmChain,
  evmTx,
  EXECUTION_OPTIONS,
  expectPrerequisiteFailed,
  historyOf,
  httpClient,
  HYPERLIQUID_EXCHANGE_URL,
  HYPERLIQUID_NONCE,
  hyperliquidTx,
  hyperliquidTypedData,
  linkedChain,
  resetHttpClient,
  scriptCreateTransaction,
  settle,
  SIGNATURE_CHAIN_ID,
  SIGNATURE_R,
  SIGNATURE_S,
  signatureWith,
  signerError,
  stubHyperliquid,
  succeeded,
  swap,
  UNLIMITED,
} from '../../../tests/support.js'

import { hub3EvmAdapter } from './evm.js'

type Hex = `0x${string}`
type EvmTransaction = mainAPI.EvmTransaction
type AddChain = Exclude<Parameters<EvmActions['connect']>[0], string>
type Wait = NonNullable<GenericSigner<EvmTransaction>['wait']>
type SignTypedData = NonNullable<GenericSigner<EvmTransaction>['signTypedData']>

const PROVIDER_ID = 'test-wallet'
const BSC_DESCRIPTION = {
  chainName: 'BNB Smart Chain',
  rpcUrls: ['https://bsc.example'],
  blockExplorerUrls: ['https://bscscan.example'],
}
// The Blockchain list with an explorer on ETH, so a stored hash gets a link unless it is provisional.
const SCAN = 'https://scan.test/tx'
const LINKED_CHAINS = [linkedChain(evmChain('ETH', '0x1'), SCAN)]
// How often the SDK polls an approve's receipt, and reads the allowance once the approve is proved.
const POLL_INTERVAL_MS = 5_000
const ALLOWANCE_READ_INTERVAL_MS = 3_000
const APPROVE_HASH = '0xapprove'
const SWAP_HASH = '0xhash1'
// The ERC-20 approve calldata for spender 0xAbC0000000000000000000000000000000000123 and amount 1000000.
const APPROVE_CALLDATA =
  '0x095ea7b3000000000000000000000000abc000000000000000000000000000000000012300000000000000000000000000000000000000000000000000000000000f4240'
const RECEIPT_SUCCESS: EvmTransactionReceipt = {
  status: '0x1',
  transactionHash: APPROVE_HASH,
  blockNumber: '0x10',
}
const RECEIPT_REVERTED: EvmTransactionReceipt = {
  ...RECEIPT_SUCCESS,
  status: '0x0',
}
const NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'ETH', address: '0xfrom' },
}
const HYPERLIQUID_CHAINS = [
  ...evmBlockchains,
  chain('HYPERLIQUID', ['^(0x)[0-9A-Fa-f]{40}$']),
]
// The selected Hyperliquid wallet, and another account the wallet holds after it.
const HYPERLIQUID_WALLET = '0xhyperliquid'
const OTHER_ACCOUNT = '0xother'
const HYPERLIQUID_ACCOUNTS = [
  `eip155:42161:${HYPERLIQUID_WALLET}`,
  `eip155:42161:${OTHER_ACCOUNT}`,
]
const WRONG_CHAIN_ID = '0x1'
// The hash the Hyperliquid explorer lists the posted action under.
const HYPERLIQUID_HASH = '0xhyperhash'
// The `v` a signature ending in 1c is posted as.
const V_ODD = 28
const SIGNATURE = signatureWith('1c')
const HYPERLIQUID_NOT_CONNECTED: Sdk.BlockReason = {
  reason: 'NOT_CONNECTED',
  metadata: { blockchain: 'HYPERLIQUID', address: HYPERLIQUID_WALLET },
}

/*
 * What the stubbed hub3 wallet holds and was asked. `chainId` and `signers` are read on each call. `connect` moves the
 * wallet to the chain it is given, unless `isStuck`. `allowances` and `receipts` answer each read with the next one,
 * then the last one; an Error rejects.
 */
type Wallet = {
  connected: boolean
  accounts: string[] | null
  chainId: Hex
  isStuck: boolean
  signers: SignerFactory
  connects: (string | AddChain | undefined)[]
  signerLookups: number
  allowances: (string | Error)[]
  receipts: (EvmTransactionReceipt | null | Error)[]
  allowanceReads: AllowanceParams[]
  receiptReads: string[]
}

function buildSigner(hash: string) {
  const signAndSendTx = vi.fn<GenericSigner<EvmTransaction>['signAndSendTx']>(
    async () => ({ hash, response: { hash } }),
  )
  const signer: GenericSigner<EvmTransaction> = {
    signMessage: async () => '',
    signAndSendTx,
  }
  return { signer, signAndSendTx }
}

function buildWaitingSigner(
  hash: string,
  finalHash: string,
  response: unknown = { hash },
) {
  const signAndSendTx = vi.fn<GenericSigner<EvmTransaction>['signAndSendTx']>(
    async () => ({ hash, response }),
  )
  const wait = vi.fn<Wait>(async () => ({ hash: finalHash }))
  const signer: GenericSigner<EvmTransaction> = {
    signMessage: async () => '',
    signAndSendTx,
    wait,
  }
  return { signer, signAndSendTx, wait }
}

function buildTypedDataSigner(signature = SIGNATURE) {
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
      throw new Error('The SOLANA signer was used for an EVM transaction.')
    },
  })
  return signers
}

function buildWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    connected: true,
    accounts: ['eip155:1:0xfrom'],
    chainId: '0x1',
    isStuck: false,
    signers: buildSigners(buildSigner('0xhash1').signer),
    connects: [],
    signerLookups: 0,
    allowances: [UNLIMITED],
    receipts: [RECEIPT_SUCCESS],
    allowanceReads: [],
    receiptReads: [],
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
 * A real hub3 provider whose `evm` namespace is stubbed by `wallet`: its state holds `wallet`'s connection and
 * accounts, `getChainId` answers `wallet.chainId`, `connect` records its argument and moves `wallet` to that chain
 * unless it is stuck, and `getAllowance` and `getTransactionReceipt` record their argument and answer `wallet`'s next
 * allowance and receipt. Its `signers` metadata property answers `wallet.signers` and counts the lookups.
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
    .action('getAllowance', async (_context, params) => {
      wallet.allowanceReads.push(params)
      return next<string>(wallet.allowances)
    })
    .action('getTransactionReceipt', async (_context, hash) => {
      wallet.receiptReads.push(hash)
      return next<EvmTransactionReceipt | null>(wallet.receipts)
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

async function createAdapterClient(
  wallet: Wallet,
  chains?: readonly Sdk.BlockchainMeta[],
) {
  return createExecutionClient(
    {
      wallet: { evm: hub3EvmAdapter(buildProvider(wallet)) },
      requests: [],
    },
    chains,
  )
}

// Confirms a Route of these swaps and executes it, with every pending step run.
async function start(
  client: Sdk.RangoClient,
  swaps: Sdk.SwapResult[] = [swap()],
): Promise<void> {
  await confirmQuote(client, 'request-1', swaps)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
}

// A signer that answers APPROVE_HASH for an approve and SWAP_HASH for the swap.
function buildApprovingSigner() {
  const { signer, signAndSendTx } = buildSigner(SWAP_HASH)
  signAndSendTx.mockImplementation(async (tx) => {
    const hash = tx.isApprovalTx ? APPROVE_HASH : SWAP_HASH
    return { hash, response: { hash } }
  })
  return { signer, signAndSendTx }
}

async function startApproving(
  wallet: Wallet,
  prerequisite = evmApprove(),
): Promise<Sdk.RangoClient> {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(evmTx({ prerequisites: [prerequisite] })),
  )
  const { client } = await createAdapterClient(wallet)
  await start(client)
  return client
}

/*
 * Executes a one-Step Route of a Hyperliquid withdraw3 action over `wallet`'s adapter, placed under `HYPERLIQUID` in
 * `evm`'s map or as the flat `evm` wallet, with every pending step run.
 */
async function executeWithdrawRouteWith(
  wallet: Wallet,
  placement: 'HYPERLIQUID' | 'flat' = 'HYPERLIQUID',
) {
  httpClient.createTransaction.mockResolvedValue(
    createTxResponse(hyperliquidTx()),
  )
  const adapter = hub3EvmAdapter(buildProvider(wallet))
  const { client } = await createExecutionClient(
    {
      wallet: {
        evm: placement === 'flat' ? adapter : { HYPERLIQUID: adapter },
      },
      requests: [],
    },
    HYPERLIQUID_CHAINS,
  )
  await confirmQuote(client)
  await client.execute('request-1', EXECUTION_OPTIONS)
  await settle()
  return client
}

// A wallet on Hyperliquid's signature chain, holding the selected Hyperliquid wallet first, whose signer signs typed data.
function buildHyperliquidWallet(overrides: Partial<Wallet> = {}): Wallet {
  return buildWallet({
    accounts: HYPERLIQUID_ACCOUNTS,
    chainId: SIGNATURE_CHAIN_ID,
    signers: buildSigners(buildTypedDataSigner().signer),
    ...overrides,
  })
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

// An explorer `userDetails` answer holding the posted withdraw3 under `hash`.
function buildExplorerAnswerHoldingWithdraw(hash: Hex) {
  return {
    type: 'userDetails',
    txs: [
      {
        action: { type: 'withdraw3', time: HYPERLIQUID_NONCE },
        hash,
        user: HYPERLIQUID_WALLET,
        time: HYPERLIQUID_NONCE,
      },
    ],
  }
}

// Whether each transaction signed so far is an approve.
function getIsApprovalOfEachSignedTx(
  signAndSendTx: ReturnType<typeof buildApprovingSigner>['signAndSendTx'],
): boolean[] {
  return signAndSendTx.mock.calls.map(([tx]) => tx.isApprovalTx)
}

let factory = new IDBFactory()

describe('hub3EvmAdapter', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
    httpClient.reportFailure.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('an EVM swap runs to success, signed by the EVM signer with the transaction’s `from` and the namespace’s chain ID', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const wallet = buildWallet({ signers: buildSigners(signer) })
    const { client } = await createAdapterClient(wallet)

    await start(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(signAndSendTx.mock.calls).toEqual([[evmTx(), '0xfrom', '0x1']])
    expect(wallet.connects).toEqual([])
    expect(httpClient.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, txId: '0xhash1' }),
    )
  })

  test.each<[string, Partial<Wallet>]>([
    ['never connected', { connected: false, accounts: null }],
    ['connected with no accounts', { connected: true, accounts: [] }],
  ])(
    'a provider %s Blocks the run NOT_CONNECTED, without signing',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const { client } = await createAdapterClient(
        buildWallet({ ...overrides, signers: buildSigners(signer) }),
      )

      await start(client)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual(NOT_CONNECTED)
      expect(signAndSendTx).not.toHaveBeenCalled()
    },
  )

  test('a run over two blockchains signs each Step with the adapter under its blockchain, without switching either', async () => {
    const eth = buildSigner('0xhash1')
    const bsc = buildSigner('0xhash2')
    const ethWallet = buildWallet({ signers: buildSigners(eth.signer) })
    const bscWallet = buildWallet({
      accounts: ['eip155:56:0xto'],
      chainId: '0x38',
      signers: buildSigners(bsc.signer),
    })
    const { client } = await createExecutionClient(
      {
        wallet: {
          evm: {
            ETH: hub3EvmAdapter(buildProvider(ethWallet)),
            BSC: hub3EvmAdapter(buildProvider(bscWallet)),
          },
        },
        requests: [],
      },
      [evmChain('ETH', '0x1'), evmChain('BSC', '0x38')],
    )

    await start(client, [swap(), swap({ from: BSC_ASSET, to: BSC_ASSET })])

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(eth.signAndSendTx.mock.calls).toEqual([[evmTx(), '0xfrom', '0x1']])
    expect(bsc.signAndSendTx.mock.calls).toEqual([
      [
        evmTx({ blockChain: 'BSC', from: '0xto', data: '0xdata2' }),
        '0xto',
        '0x38',
      ],
    ])
    expect(ethWallet.connects).toEqual([])
    expect(bscWallet.connects).toEqual([])
  })

  test.each(['not-a-caip-id', 'eip155:1'])(
    'getAccount skips the malformed account %j ahead of a CAIP-10 one, and answers the CAIP-10 one',
    async (malformed) => {
      const adapter = hub3EvmAdapter(
        buildProvider(
          buildWallet({ accounts: [malformed, 'eip155:1:0xfrom'] }),
        ),
      )

      await expect(adapter.getAccount()).resolves.toBe('0xfrom')
    },
  )

  test('a provider with several accounts signs each Step from the first account hub3 holds at its sign, switches with the chain description, and uses the signer it holds at each sign', async () => {
    const first = buildSigner('0xhash1')
    const second = buildSigner('0xhash2')
    const wallet = buildWallet({
      accounts: ['eip155:1:0xfrom', 'eip155:1:0xother', 'eip155:1:0xto'],
    })
    wallet.signers = buildSigners(first.signer)
    const provider = buildProvider(wallet)
    /*
     * Once the first sign is done, the user switches to the second Step's account and the wallet registers a new
     * signer. hub3 sorts the accounts it is given when it already holds some, so the wallet holds that one alone.
     */
    first.signAndSendTx.mockImplementation(async () => {
      provider.get('evm')?.state()[1]('accounts', ['eip155:1:0xto'])
      wallet.signers = buildSigners(second.signer)
      return { hash: '0xhash1' }
    })
    const chains = [
      evmChain('ETH', '0x1'),
      describedChain(evmChain('BSC', '0x38'), BSC_DESCRIPTION),
    ]
    const { client } = await createExecutionClient(
      {
        wallet: { evm: hub3EvmAdapter(provider) },
        requests: [],
      },
      chains,
    )

    await start(client, [swap(), swap({ from: BSC_ASSET, to: BSC_ASSET })])

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(first.signAndSendTx.mock.calls).toEqual([[evmTx(), '0xfrom', '0x1']])
    expect(second.signAndSendTx.mock.calls).toEqual([
      [
        evmTx({ blockChain: 'BSC', from: '0xto', data: '0xdata2' }),
        '0xto',
        '0x38',
      ],
    ])
    expect(wallet.connects).toEqual([
      {
        chainId: '0x38',
        ...BSC_DESCRIPTION,
        nativeCurrency: { name: 'BSC', symbol: 'BSC', decimals: 18 },
      },
    ])
  })

  test('a switch without a chain description connects with the bare 0x-hex chain ID', async () => {
    const wallet = buildWallet({ chainId: '0x38' })
    const adapter = hub3EvmAdapter(buildProvider(wallet))

    await adapter.switchChain({ chainId: '0x1' })

    expect(wallet.connects).toEqual(['0x1'])
    await expect(adapter.getChainId()).resolves.toBe('0x1')
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
    expect(() => hub3EvmAdapter(provider)).not.toThrow()
  })

  test('a signer with `wait` is called with the hash, the namespace’s chain ID and the sign’s response, and the Transaction entry follows the hash it answers', async () => {
    const { signer, wait } = buildWaitingSigner('0xhash1', '0xfinal')
    const { client } = await createAdapterClient(
      buildWallet({ signers: buildSigners(signer) }),
    )

    await start(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(wait.mock.calls).toEqual([['0xhash1', '0x1', { hash: '0xhash1' }]])
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: '0xfinal' })
    expect(httpClient.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ step: 1, txId: '0xfinal' }),
    )
  })

  test('`wait` is always defined, and with a signer that has none it answers the hash it was given', async () => {
    const adapter = hub3EvmAdapter(buildProvider(buildWallet()))

    await expect(
      adapter.wait?.({
        hash: '0xhash1',
        response: { hash: '0xhash1' },
      }),
    ).resolves.toEqual({ hash: '0xhash1' })
  })

  test('the signer is looked up again for the wait: one the wallet registers after the sign is the one that waits', async () => {
    const first = buildWaitingSigner('0xhash1', '0xfirst')
    const second = buildWaitingSigner('0xhash2', '0xsecond')
    const wallet = buildWallet({ signers: buildSigners(first.signer) })
    first.signAndSendTx.mockImplementation(async () => {
      wallet.signers = buildSigners(second.signer)
      return { hash: '0xhash1' }
    })
    const { client } = await createAdapterClient(wallet)

    await start(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(first.wait).not.toHaveBeenCalled()
    expect(second.wait.mock.calls).toEqual([['0xhash1', '0x1', undefined]])
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: '0xsecond' })
  })

  test('a Safe response with `hashRequiringUpdate: true` makes the hash provisional: no link is stored for it, and the Transaction entry follows the hash `wait` answers', async () => {
    const { signer } = buildWaitingSigner('0xsafe', '0xfinal', {
      hashRequiringUpdate: true,
    })
    const { client } = await createAdapterClient(
      buildWallet({ signers: buildSigners(signer) }),
      LINKED_CHAINS,
    )

    await start(client)

    const view = await historyOf(client)
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.transactions.s1?.execution.result).toEqual({
      walletResult: { hash: '0xfinal' },
      checkResult: {
        outputAmount: '2990',
        explorerUrl: [],
        diagnosisUrl: null,
      },
    })
    expect(httpClient.checkStatus).toHaveBeenCalledWith(
      expect.objectContaining({ txId: '0xfinal' }),
    )
    expect(httpClient.checkStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ txId: '0xsafe' }),
    )
  })

  test.each<[string, unknown]>([
    ['`hashRequiringUpdate: false`', { hashRequiringUpdate: false }],
    ['`hashRequiringUpdate` as a string', { hashRequiringUpdate: 'true' }],
    ['an object without the flag', { hash: '0xhash1' }],
    ['a string', 'hashRequiringUpdate'],
    ['`null`', null],
    ['missing', undefined],
  ])(
    'a response that is %s leaves the hash final: its link is stored, then replaced by one for the hash `wait` answers',
    async (_, response) => {
      const { signer } = buildWaitingSigner('0xhash1', '0xfinal', response)
      const { client } = await createAdapterClient(
        buildWallet({ signers: buildSigners(signer) }),
        LINKED_CHAINS,
      )

      await start(client)

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(view?._storage.transactions.s1?.execution.result).toEqual({
        walletResult: { hash: '0xfinal' },
        checkResult: {
          outputAmount: '2990',
          explorerUrl: [
            { url: `${SCAN}/0xfinal`, description: 'Replaced Swap' },
          ],
          diagnosisUrl: null,
        },
      })
    },
  )

  describe.each<['sign' | 'wait']>([['sign'], ['wait']])(
    'an error thrown by the signer’s %s',
    (call) => {
      async function runThrowing(error: unknown) {
        const { signer, signAndSendTx, wait } = buildWaitingSigner(
          '0xhash1',
          '0xfinal',
        )
        const thrower = call === 'sign' ? signAndSendTx : wait
        thrower.mockImplementation(async () => {
          throw error
        })
        const { client } = await createAdapterClient(
          buildWallet({ signers: buildSigners(signer) }),
        )
        await start(client)
        const view = await historyOf(client)
        expect(view?._queue.status).toBe('FAILED')
        return view
      }

      test('that is a SignerError reaches the Execution failure with its own code, detail and cause', async () => {
        const error = signerError(
          SignerErrorCode.SEND_TX_ERROR,
          'Wallet said no',
          { message: 'nonce too low' },
        )

        const view = await runThrowing(error)

        expect(view?._storage.failure).toEqual({
          reasonCode: 'SEND_TX_FAILED',
          message: error.message,
          detail: 'Wallet said no',
        })
        expect(httpClient.reportFailure).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'SEND_TX_FAILED',
            reason: 'nonce too low',
          }),
        )
      })

      test.each<[string, Error, string]>([
        ['a plain Error', new Error('RPC down'), 'RPC down'],
        [
          'hub3’s user-rejected error',
          new Hub3Error(
            'PROVIDER_USER_REJECTED_REQUEST',
            'The wallet said no.',
          ),
          'The wallet said no.',
        ],
        [
          'another hub3 error',
          new Hub3Error('PROVIDER_LOCKED', 'The wallet is locked.'),
          'The wallet is locked.',
        ],
        [
          'an Error named Hub3Error with no type',
          Object.assign(new Error('Odd wallet'), { name: 'Hub3Error' }),
          'Odd wallet',
        ],
      ])(
        'that is %s fails the Execution CLIENT_UNEXPECTED_BEHAVIOUR, with its message as the detail and the reported reason',
        async (_, error, message) => {
          const view = await runThrowing(error)

          expect(view?._storage.failure).toEqual({
            reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
            message: 'Unexpected error',
            detail: message,
          })
          expect(httpClient.reportFailure).toHaveBeenCalledWith(
            expect.objectContaining({
              eventType: 'CLIENT_UNEXPECTED_BEHAVIOUR',
              reason: message,
            }),
          )
        },
      )
    },
  )

  test.each<[string, unknown]>([
    ['an Error', new Error('RPC down')],
    ['a string', 'RPC down'],
  ])(
    '%s thrown by the signer’s sign or wait rejects as a SignerError UNEXPECTED_BEHAVIOUR whose root and cause are the original',
    async (_, error) => {
      const { signer, signAndSendTx, wait } = buildWaitingSigner(
        '0xhash1',
        '0xfinal',
      )
      const throwError = async (): Promise<never> => {
        throw error
      }
      signAndSendTx.mockImplementation(throwError)
      wait.mockImplementation(throwError)
      const adapter = hub3EvmAdapter(
        buildProvider(buildWallet({ signers: buildSigners(signer) })),
      )

      const rejections = await Promise.all([
        adapter.sign({ tx: evmTx() }).catch((error: unknown) => error),
        adapter.wait?.({ hash: '0xhash1' }).catch((error: unknown) => error),
      ])

      expect(rejections).toHaveLength(2)
      for (const rejection of rejections) {
        expect(rejection).toBeInstanceOf(SignerError)
        expect(rejection).toMatchObject({
          code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
          root: error,
          cause: error,
        })
      }
    },
  )

  test.each<[string, Partial<Wallet>]>([
    ['no connected account', { accounts: [] }],
    ['an account but no connection', { connected: false }],
  ])(
    'a sign while the provider has %s rejects as a SignerError UNEXPECTED_BEHAVIOUR, without asking the signer',
    async (_, overrides) => {
      const { signer, signAndSendTx } = buildSigner('0xhash1')
      const adapter = hub3EvmAdapter(
        buildProvider(
          buildWallet({ ...overrides, signers: buildSigners(signer) }),
        ),
      )

      const rejection: unknown = await adapter
        .sign({ tx: evmTx() })
        .catch((error: unknown) => error)

      expect(rejection).toBeInstanceOf(SignerError)
      expect(rejection).toMatchObject({
        code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
        root: new Error(
          `The hub3 provider "${PROVIDER_ID}" has no connected "evm" account to sign with.`,
        ),
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    },
  )

  test('a sign signs with the first connected account, not the transaction’s `from`', async () => {
    const { signer, signAndSendTx } = buildSigner('0xhash1')
    const adapter = hub3EvmAdapter(
      buildProvider(
        buildWallet({
          accounts: ['eip155:1:0xfirst', 'eip155:1:0xfrom'],
          signers: buildSigners(signer),
        }),
      ),
    )
    const tx = evmTx({ from: null })

    await adapter.sign({ tx })

    expect(signAndSendTx.mock.calls).toEqual([[tx, '0xfirst', '0x1']])
  })

  describe('an ERC-20 swap', () => {
    test('whose allowance is already enough skips the approve: the allowance is read with the Prerequisite’s token, spender and wallet as owner, no approve is signed, and the swap succeeds', async () => {
      const { signer, signAndSendTx } = buildApprovingSigner()
      const wallet = buildWallet({
        accounts: ['eip155:1:0xfrom', 'eip155:1:0xowner'],
        signers: buildSigners(signer),
        allowances: [UNLIMITED],
      })

      const client = await startApproving(
        wallet,
        evmApprove({ wallet: '0xowner', token: '0xusdt', spender: '0xrouter' }),
      )

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(wallet.allowanceReads).toEqual([
        { token: '0xusdt', owner: '0xowner', spender: '0xrouter' },
      ])
      expect(getIsApprovalOfEachSignedTx(signAndSendTx)).toEqual([false])
      expect(wallet.receiptReads).toEqual([])
    })

    test('with too little allowance signs the approve, reads its receipt, confirms the allowance, then signs the swap and succeeds', async () => {
      const { signer, signAndSendTx } = buildApprovingSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['999999', UNLIMITED],
      })

      const client = await startApproving(wallet)

      expect(signAndSendTx.mock.calls).toEqual([
        [
          expect.objectContaining({ to: '0xtoken', isApprovalTx: true }),
          '0xfrom',
          '0x1',
        ],
      ])
      expect(wallet.receiptReads).toEqual([APPROVE_HASH])
      await advance(ALLOWANCE_READ_INTERVAL_MS)
      const view = await historyOf(client)
      expect(view?._queue.status).toBe('SUCCESS')
      expect(getIsApprovalOfEachSignedTx(signAndSendTx)).toEqual([true, false])
      expect(view?._storage.transactions['s1.p0']?.execution.status).toBe(
        'completed',
      )
      expect(httpClient.checkStatus).toHaveBeenCalledWith(
        expect.objectContaining({ step: 1, txId: SWAP_HASH }),
      )
    })

    test('whose approve has no receipt yet keeps the approve pending, polling until one arrives', async () => {
      const { signer, signAndSendTx } = buildApprovingSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['0', UNLIMITED],
        receipts: [null, null, RECEIPT_SUCCESS],
      })

      const client = await startApproving(wallet)
      await advance(POLL_INTERVAL_MS)

      const pending = await historyOf(client)
      expect(pending?._queue.status).toBe('RUNNING')
      expect(pending?._storage.transactions['s1.p0']?.execution.status).toBe(
        'signed',
      )
      expect(wallet.receiptReads).toEqual([APPROVE_HASH, APPROVE_HASH])
      expect(getIsApprovalOfEachSignedTx(signAndSendTx)).toEqual([true])

      await advance(POLL_INTERVAL_MS)
      await advance(ALLOWANCE_READ_INTERVAL_MS)
      expect(wallet.receiptReads).toEqual([
        APPROVE_HASH,
        APPROVE_HASH,
        APPROVE_HASH,
      ])
      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(getIsApprovalOfEachSignedTx(signAndSendTx)).toEqual([true, false])
    })

    test('whose approve’s receipt has a status other than 1 fails the Execution with the Prerequisite’s on-chain failure, and the swap is never signed', async () => {
      const { signer, signAndSendTx } = buildApprovingSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['0'],
        receipts: [RECEIPT_REVERTED],
      })

      const client = await startApproving(wallet)

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Prerequisite transaction failed on chain.',
      })
      expect(getIsApprovalOfEachSignedTx(signAndSendTx)).toEqual([true])
    })

    test('with too little allowance signs, with the first connected account, the approve built from the Prerequisite: its wallet, its token, and the ERC-20 approve calldata for its spender and amount', async () => {
      const { signer, signAndSendTx } = buildApprovingSigner()
      const wallet = buildWallet({
        accounts: ['eip155:1:0xfrom', 'eip155:1:0xowner'],
        signers: buildSigners(signer),
        allowances: ['0', UNLIMITED],
      })

      await startApproving(
        wallet,
        evmApprove({
          wallet: '0xowner',
          token: '0xusdt',
          spender: '0xAbC0000000000000000000000000000000000123',
          amount: '1000000',
        }),
      )

      expect(signAndSendTx.mock.calls[0]).toEqual([
        {
          type: TransactionType.EVM,
          blockChain: 'ETH',
          from: '0xowner',
          to: '0xusdt',
          data: APPROVE_CALLDATA,
          value: null,
          nonce: null,
          gasLimit: null,
          gasPrice: null,
          maxPriorityFeePerGas: null,
          maxFeePerGas: null,
          isApprovalTx: true,
          prerequisites: [],
        },
        '0xfrom',
        '0x1',
      ])
    })

    test('whose approve cannot be built fails with the SDK’s own build failure, and nothing is signed', async () => {
      const { signer, signAndSendTx } = buildApprovingSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: ['0'],
      })

      const client = await startApproving(
        wallet,
        evmApprove({ amount: 'not-a-number' }),
      )

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Could not build the EVM approve transaction.',
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    })

    test('whose allowance read rejects, even with hub3’s user-rejected error, fails with the SDK’s allowance read failure, not a rejection', async () => {
      const { signer, signAndSendTx } = buildApprovingSigner()
      const wallet = buildWallet({
        signers: buildSigners(signer),
        allowances: [
          new Hub3Error(
            'PROVIDER_USER_REJECTED_REQUEST',
            'The wallet said no.',
          ),
        ],
      })

      const client = await startApproving(wallet)

      await expectPrerequisiteFailed(client, {
        reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
        message: 'Could not read the current allowance from the node.',
      })
      expect(signAndSendTx).not.toHaveBeenCalled()
    })
  })

  test('`getAllowance` and `getTransactionInfo` reject with the hub3 namespace’s own error, not a SignerError', async () => {
    const error = new Hub3Error(
      'PROVIDER_USER_REJECTED_REQUEST',
      'The wallet said no.',
    )
    const adapter = hub3EvmAdapter(
      buildProvider(buildWallet({ allowances: [error], receipts: [error] })),
    )

    const rejections = await Promise.all([
      adapter
        .getAllowance({ prerequisite: evmApprove() })
        .catch((error: unknown) => error),
      adapter
        .getTransactionInfo({ hash: APPROVE_HASH })
        .catch((error: unknown) => error),
    ])

    expect(rejections[0]).toBe(error)
    expect(rejections[1]).toBe(error)
  })

  test('`buildTransaction` takes the blockchain from the Prerequisite, builds without switching the network or looking up a signer, and a build error keeps its own form', async () => {
    const wallet = buildWallet()
    const getSigner = vi.spyOn(wallet.signers, 'getSigner')
    const adapter = hub3EvmAdapter(buildProvider(wallet))

    const built = await adapter.buildTransaction({
      prerequisite: evmApprove({ blockChain: 'BSC' }),
    })
    const rejection: unknown = await adapter
      .buildTransaction({
        prerequisite: evmApprove({ amount: 'not-a-number' }),
      })
      .catch((error: unknown) => error)

    expect(built).toMatchObject({
      blockChain: 'BSC',
      from: '0xfrom',
      to: '0xtoken',
    })
    expect(rejection).toBeInstanceOf(SyntaxError)
    expect(getSigner).not.toHaveBeenCalled()
    expect(wallet.connects).toEqual([])
  })

  test('`getTransactionInfo` passes a hash that starts with 0x to the receipt read unchanged', async () => {
    const wallet = buildWallet({ receipts: [null] })
    const adapter = hub3EvmAdapter(buildProvider(wallet))

    await expect(
      adapter.getTransactionInfo({ hash: APPROVE_HASH }),
    ).resolves.toBe('pending')
    expect(wallet.receiptReads).toEqual([APPROVE_HASH])
  })

  test('`getTransactionInfo` prepends 0x to a bare hash before the receipt read', async () => {
    const wallet = buildWallet({ receipts: [null] })
    const adapter = hub3EvmAdapter(buildProvider(wallet))

    await expect(adapter.getTransactionInfo({ hash: 'approve' })).resolves.toBe(
      'pending',
    )
    expect(wallet.receiptReads).toEqual(['0xapprove'])
  })

  test('`getTransactionInfo` reads a receipt status of `0x01` as success', async () => {
    // hub3 types the status as `0x1` or `0x0`, but wallets also hand over `0x01`.
    const paddedStatus: string = '0x01'
    const receipt: EvmTransactionReceipt = {
      ...RECEIPT_SUCCESS,
      status: paddedStatus as EvmTransactionReceipt['status'],
    }
    const adapter = hub3EvmAdapter(
      buildProvider(buildWallet({ receipts: [receipt] })),
    )

    await expect(
      adapter.getTransactionInfo({ hash: APPROVE_HASH }),
    ).resolves.toBe('success')
  })

  describe('a Hyperliquid action', () => {
    test.each<['HYPERLIQUID' | 'flat']>([['HYPERLIQUID'], ['flat']])(
      'with the adapter as the %s `evm` wallet runs to success, signed as typed data by the EVM signer with the first account, the swap wallet, and the action’s chain ID, and posted with the signature split into r, s and v',
      async (placement) => {
        const hyperliquid = stubHyperliquid({
          explorer: [buildExplorerAnswerHoldingWithdraw(HYPERLIQUID_HASH)],
        })
        const { signer, signTypedData } = buildTypedDataSigner()
        const wallet = buildHyperliquidWallet({ signers: buildSigners(signer) })

        const client = await executeWithdrawRouteWith(wallet, placement)

        const view = await historyOf(client)
        expect(view?._queue.status).toBe('SUCCESS')
        expect(signTypedData.mock.calls).toEqual([
          [withdrawTypedData(), HYPERLIQUID_WALLET, SIGNATURE_CHAIN_ID],
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
        ).toEqual({ hash: HYPERLIQUID_HASH })
      },
    )

    test.each<[string, Partial<Wallet>]>([
      ['never connected', { connected: false, accounts: null }],
      ['connected with no accounts', { connected: true, accounts: [] }],
    ])(
      'over a provider %s Blocks the run NOT_CONNECTED, without signing or posting',
      async (_, overrides) => {
        const hyperliquid = stubHyperliquid()
        const { signer, signTypedData } = buildTypedDataSigner()

        const client = await executeWithdrawRouteWith(
          buildHyperliquidWallet({
            ...overrides,
            signers: buildSigners(signer),
          }),
        )

        const view = await historyOf(client)
        expect(view?._queue.status).toBe('BLOCKED')
        expect(view?._queue.blocked).toEqual(HYPERLIQUID_NOT_CONNECTED)
        expect(signTypedData).not.toHaveBeenCalled()
        expect(hyperliquid.posts).toEqual([])
      },
    )

    test('over a wallet whose first account is another Blocks the run ACCOUNT_MISMATCH, without signing or posting', async () => {
      const hyperliquid = stubHyperliquid()
      const { signer, signTypedData } = buildTypedDataSigner()

      const client = await executeWithdrawRouteWith(
        buildHyperliquidWallet({
          accounts: [
            `eip155:42161:${OTHER_ACCOUNT}`,
            `eip155:42161:${HYPERLIQUID_WALLET}`,
          ],
          signers: buildSigners(signer),
        }),
      )

      const view = await historyOf(client)
      expect(view?._queue.status).toBe('BLOCKED')
      expect(view?._queue.blocked).toEqual({
        reason: 'ACCOUNT_MISMATCH',
        metadata: { blockchain: 'HYPERLIQUID', address: HYPERLIQUID_WALLET },
      })
      expect(signTypedData).not.toHaveBeenCalled()
      expect(hyperliquid.posts).toEqual([])
    })

    test('over a wallet on the wrong network switches it with the bare chain ID, then signs', async () => {
      stubHyperliquid()
      const { signer, signTypedData } = buildTypedDataSigner()
      const wallet = buildHyperliquidWallet({
        chainId: WRONG_CHAIN_ID,
        signers: buildSigners(signer),
      })

      const client = await executeWithdrawRouteWith(wallet)

      expect((await historyOf(client))?._queue.status).toBe('SUCCESS')
      expect(wallet.connects).toEqual([SIGNATURE_CHAIN_ID])
      expect(signTypedData).toHaveBeenCalledTimes(1)
    })

    test('over a wallet still on the wrong network after the switch Blocks the run NETWORK_MISMATCH, without signing or posting', async () => {
      const hyperliquid = stubHyperliquid()
      const { signer, signTypedData } = buildTypedDataSigner()
      const wallet = buildHyperliquidWallet({
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
          address: HYPERLIQUID_WALLET,
          requiredChainId: SIGNATURE_CHAIN_ID,
        },
      })
      expect(wallet.connects).toEqual([SIGNATURE_CHAIN_ID])
      expect(signTypedData).not.toHaveBeenCalled()
      expect(hyperliquid.posts).toEqual([])
    })
  })

  describe('`signTypedData`', () => {
    const request = () => ({
      typedData: withdrawTypedData(),
      chainId: SIGNATURE_CHAIN_ID,
    })

    test('is always defined, and looks the signer up again on every call: one the wallet registers after a sign is the one that signs next', async () => {
      const first = buildTypedDataSigner(signatureWith('1b'))
      const second = buildTypedDataSigner(SIGNATURE)
      const wallet = buildHyperliquidWallet({
        signers: buildSigners(first.signer),
      })
      const adapter = hub3EvmAdapter(buildProvider(wallet))

      expect(adapter.signTypedData).toBeTypeOf('function')
      await expect(adapter.signTypedData?.(request())).resolves.toBe(
        signatureWith('1b'),
      )
      wallet.signers = buildSigners(second.signer)
      await expect(adapter.signTypedData?.(request())).resolves.toBe(SIGNATURE)

      expect(wallet.signerLookups).toBe(2)
      expect(first.signTypedData).toHaveBeenCalledTimes(1)
      expect(second.signTypedData).toHaveBeenCalledTimes(1)
    })

    test.each<[string, Partial<Wallet>]>([
      ['no connected account', { accounts: [] }],
      ['an account but no connection', { connected: false }],
    ])(
      'while the provider has %s rejects as a SignerError UNEXPECTED_BEHAVIOUR, without asking the signer',
      async (_, overrides) => {
        const { signer, signTypedData } = buildTypedDataSigner()
        const adapter = hub3EvmAdapter(
          buildProvider(
            buildHyperliquidWallet({
              ...overrides,
              signers: buildSigners(signer),
            }),
          ),
        )

        const rejection: unknown = await adapter
          .signTypedData?.(request())
          .catch((error: unknown) => error)

        expect(rejection).toBeInstanceOf(SignerError)
        expect(rejection).toMatchObject({
          code: SignerErrorCode.UNEXPECTED_BEHAVIOUR,
          root: new Error(
            `The hub3 provider "${PROVIDER_ID}" has no connected "evm" account to sign with.`,
          ),
        })
        expect(signTypedData).not.toHaveBeenCalled()
      },
    )

    test('with a signer without `signTypedData` rejects with its own SignerError UNEXPECTED_BEHAVIOUR, not a wrapped throw, and fails a Hyperliquid run CLIENT_UNEXPECTED_BEHAVIOUR', async () => {
      const hyperliquid = stubHyperliquid()
      const signer: GenericSigner<EvmTransaction> = {
        signMessage: async () => '',
        signAndSendTx: async () => ({ hash: '0xhash' }),
      }
      const wallet = buildHyperliquidWallet({ signers: buildSigners(signer) })
      const adapter = hub3EvmAdapter(buildProvider(wallet))

      const rejection: unknown = await adapter
        .signTypedData?.(request())
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

    describe('when the signer’s `signTypedData` throws', () => {
      async function runThrowing(error: unknown) {
        const hyperliquid = stubHyperliquid()
        const { signer, signTypedData } = buildTypedDataSigner()
        signTypedData.mockImplementation(async () => {
          throw error
        })
        const client = await executeWithdrawRouteWith(
          buildHyperliquidWallet({ signers: buildSigners(signer) }),
        )
        const view = await historyOf(client)
        expect(view?._queue.status).toBe('FAILED')
        expect(hyperliquid.posts).toEqual([])
        return view
      }

      test('a SignerError reaches the Execution failure with its own code and detail', async () => {
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

      test.each<[string, Error]>([
        [
          'hub3’s user-rejected error',
          new Hub3Error(
            'PROVIDER_USER_REJECTED_REQUEST',
            'The wallet said no.',
          ),
        ],
        ['anything else', new Error('RPC down')],
      ])(
        '%s fails the Execution CLIENT_UNEXPECTED_BEHAVIOUR',
        async (_, error) => {
          const view = await runThrowing(error)

          expect(view?._storage.failure).toMatchObject({
            reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
          })
        },
      )

      test.each<[string, unknown]>([
        ['an Error', new Error('RPC down')],
        ['a string', 'RPC down'],
        [
          'hub3’s user-rejected error',
          new Hub3Error(
            'PROVIDER_USER_REJECTED_REQUEST',
            'The wallet said no.',
          ),
        ],
      ])(
        '%s rejects as a SignerError UNEXPECTED_BEHAVIOUR whose root and cause are the original',
        async (_, error) => {
          const { signer, signTypedData } = buildTypedDataSigner()
          signTypedData.mockImplementation(async () => {
            throw error
          })
          const adapter = hub3EvmAdapter(
            buildProvider(
              buildHyperliquidWallet({ signers: buildSigners(signer) }),
            ),
          )

          const rejection: unknown = await adapter
            .signTypedData?.(request())
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
  })
})
