// Executions driven end to end through the public client, over fake-indexeddb, with the polling timer faked.
import 'fake-indexeddb/auto'

import type * as Sdk from '../../mod.js'
import type * as LegacySdk from 'rango-sdk'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  BSC_ASSET,
  cacheQuote,
  confirmQuote,
  confirmResponse,
  createClient,
  createExecutionClient,
  ETH,
  evmBlockchains,
  evmTx,
  EXECUTION_OPTIONS,
  expectSdkError,
  httpClient,
  nameOf,
  recordingNamespaces,
  resetHttpClient,
  scriptCreateTransaction,
  SELECTED_WALLETS,
  settle,
  signsOf,
  statusResponse,
  stubWindow,
  succeeded,
  swap,
  viewOf,
} from '../../../tests/support.js'

const POLL_INTERVAL_MS = 5_000
const THIRD_CALL = 3
// The last two events of a success: the `changed` that shows `SUCCESS`, then `routeEvent` `succeeded`.
const SUCCESS_TAIL = 2
const SWAP_MODES: NonNullable<Sdk.ExecutionOptions['swapMode']>[] = [
  'swap',
  'refuel',
]

let factory = new IDBFactory()

describe('execute() runs an EVM Route', () => {
  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    factory = new IDBFactory()
    globalThis.indexedDB = factory
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    scriptCreateTransaction()
    httpClient.checkStatus.mockResolvedValue(succeeded)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a client built with no wallet throws nothing: history.getAll() answers [], and a later client built with a wallet executes', async () => {
    const without = await createClient()
    expect(await without.history.getAll()).toEqual([])

    const { client, requests } = await createExecutionClient()
    await confirmQuote(client)
    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(requests).not.toEqual([])
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test('a client built with a wallet and no emitter runs an Execution to SUCCESS, read through history', async () => {
    const { client, events } = await createExecutionClient(
      undefined,
      evmBlockchains,
      { emitter: null },
    )
    await confirmQuote(client)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(events).toEqual([])
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )
  })

  test('a one-Step Route ends SUCCESS with its entry completed', async () => {
    const { client } = await createExecutionClient()
    await confirmQuote(client)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage).toMatchObject({
      finishedSwapSteps: 1,
      failure: null,
      transactions: {
        s1: {
          step: 1,
          data: { type: 'tx', value: evmTx() },
          execution: {
            status: 'completed',
            result: {
              walletResult: { hash: '0xhash1' },
              checkResult: {
                outputAmount: '2990',
                explorerUrl: [],
                diagnosisUrl: null,
              },
            },
          },
        },
      },
    })
    expect(Object.keys(view?._storage.transactions ?? {})).toEqual(['s1'])
    expect(view?._storage.finishedAt).toEqual(expect.any(Number))
  })

  test('a two-Step Route fetches step 2 only after step 1 succeeded, and nothing past its last Step', async () => {
    const { client, requests } = await createExecutionClient()
    await confirmQuote(client, 'request-1', [
      swap(),
      swap({ from: BSC_ASSET, to: BSC_ASSET }),
    ])
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValue(succeeded)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await settle()

    expect(
      httpClient.createTransaction.mock.calls.map(([req]) => req.step),
    ).toEqual([1, 2])
    expect(httpClient.checkStatus.mock.calls.map(([req]) => req)).toEqual([
      { requestId: 'request-1', step: 1, txId: '0xhash1' },
      { requestId: 'request-1', step: 1, txId: '0xhash1' },
      { requestId: 'request-1', step: 2, txId: '0xhash2' },
    ])
    expect(
      signsOf(requests).map((req) => [
        'blockchain' in req && req.blockchain,
        'chainId' in req,
      ]),
    ).toEqual([
      ['ETH', false],
      ['BSC', false],
    ])
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.finishedSwapSteps).toBe(2)
    expect(view?._storage.transactions.s2?.execution).toMatchObject({
      status: 'completed',
      result: { walletResult: { hash: '0xhash2' } },
    })
  })

  test.each([
    { steps: 1, swaps: [swap()] },
    { steps: 2, swaps: [swap(), swap({ from: BSC_ASSET, to: BSC_ASSET })] },
  ])(
    'a $steps-Step Route emits one routeEvent succeeded, its view SUCCESS with finishedAt set',
    async ({ steps, swaps }) => {
      const { client, events } = await createExecutionClient()
      await confirmQuote(client, 'request-1', swaps)

      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()

      const ends = events.filter((event) => nameOf(event) === 'route:succeeded')
      expect(ends).toHaveLength(1)
      const [end] = ends
      expect(end && viewOf(end)._queue.status).toBe('SUCCESS')
      expect(end && viewOf(end)._storage).toMatchObject({
        finishedSwapSteps: steps,
        finishedAt: expect.any(Number),
      })
    },
  )

  test('execute() resolves once the Execution is stored and its first task has started', async () => {
    const { client } = await createExecutionClient()
    const { data: route } = await confirmQuote(client)
    httpClient.createTransaction.mockReset()
    httpClient.createTransaction.mockReturnValue(new Promise(() => undefined))

    await client.execute('request-1', EXECUTION_OPTIONS)

    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    const view = await client.history.get('request-1')
    expect(view).toEqual({
      _queue: {
        id: route.requestId,
        createdAt: expect.any(Number),
        status: 'RUNNING',
        blocked: null,
      },
      _storage: {
        data: route,
        options: EXECUTION_OPTIONS,
        transactions: {},
        finishedSwapSteps: 0,
        failure: null,
        finishedAt: null,
      },
    })
  })

  test('/tx/create gets the given slippage and validations with approve false, and no infiniteApprove when none was given', async () => {
    const { client } = await createExecutionClient()
    const { data: route } = await confirmQuote(client)

    await client.execute('request-1', EXECUTION_OPTIONS)

    expect(route.slippage).toBe('1.5')
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
    const [request] = httpClient.createTransaction.mock.calls[0] ?? []
    expect(request).toEqual({
      requestId: 'request-1',
      step: 1,
      userSettings: { slippage: '1' },
      validations: { balance: true, fee: true, approve: false },
    })
    expect(request?.userSettings.infiniteApprove).toBeUndefined()
    expect(JSON.parse(JSON.stringify(request?.userSettings))).toStrictEqual({
      slippage: '1',
    })
  })

  test('/tx/create gets the validations as given after an INSUFFICIENT_BALANCE warning', async () => {
    const { client } = await createExecutionClient()
    const shortOnFee: LegacySdk.WalletRequiredAssets = {
      asset: ETH,
      requiredAmount: { amount: '2000000000000000000', decimals: 18 },
      currentAmount: { amount: '1000000000000000000', decimals: 18 },
      ok: false,
      reason: 'FEE',
    }
    httpClient.confirmRoute.mockResolvedValueOnce(
      confirmResponse(
        'request-1',
        [swap()],
        [
          {
            blockchain: 'ETH',
            wallets: [
              {
                address: '0xfrom',
                addressIsValid: true,
                requiredAssets: [shortOnFee],
                validResult: true,
              },
            ],
          },
        ],
      ),
    )
    await cacheQuote(client)
    const { warnings } = await client.confirm('request-1', SELECTED_WALLETS)

    await client.execute('request-1', EXECUTION_OPTIONS)

    expect(warnings.map(({ type }) => type)).toContain('INSUFFICIENT_BALANCE')
    expect(httpClient.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        validations: { balance: true, fee: true, approve: false },
      }),
    )
  })

  test.each([true, false])(
    '/tx/create gets infiniteApprove %s and the validations exactly as given',
    async (infiniteApprove) => {
      const { client } = await createExecutionClient()
      await confirmQuote(client)

      await client.execute('request-1', {
        ...EXECUTION_OPTIONS,
        transactionOptions: {
          slippage: '3',
          infiniteApprove,
          validations: { balance: false, fee: true },
        },
      })

      expect(httpClient.createTransaction).toHaveBeenCalledWith({
        requestId: 'request-1',
        step: 1,
        userSettings: { slippage: '3', infiniteApprove },
        validations: { balance: false, fee: true, approve: false },
      })
    },
  )

  test("the view carries the options as given, and changing the caller's object afterwards changes nothing", async () => {
    const { client } = await createExecutionClient()
    await confirmQuote(client)
    const options: Sdk.ExecutionOptions = structuredClone(EXECUTION_OPTIONS)

    await client.execute('request-1', options)
    options.transactionOptions.slippage = '50'
    options.transactionOptions.validations.balance = false
    options.swapMode = 'swap'
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.options).toEqual(EXECUTION_OPTIONS)
    expect(httpClient.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userSettings: { slippage: '1' },
        validations: { balance: true, fee: true, approve: false },
      }),
    )
  })

  test("options without swapMode are stored with swapMode 'swap', in history and the first changed event, and the caller's object is unchanged", async () => {
    const { client, events } = await createExecutionClient()
    await confirmQuote(client)
    const options: Sdk.ExecutionOptions = {
      transactionOptions: structuredClone(EXECUTION_OPTIONS.transactionOptions),
    }
    const passed = structuredClone(options)

    await client.execute('request-1', options)
    await settle()

    expect(options).toStrictEqual(passed)
    const stored = { ...passed, swapMode: 'swap' }
    const view = await client.history.get('request-1')
    expect(view?._queue.status).toBe('SUCCESS')
    expect(view?._storage.options).toStrictEqual(stored)
    const firstChange = events.find(([type]) => type === 'changed')
    expect(firstChange && viewOf(firstChange)._storage.options).toStrictEqual(
      stored,
    )
  })

  test.each(SWAP_MODES)(
    "a given swapMode '%s' is stored as given",
    async (swapMode) => {
      const { client, events } = await createExecutionClient()
      await confirmQuote(client)
      const options: Sdk.ExecutionOptions = { ...EXECUTION_OPTIONS, swapMode }

      await client.execute('request-1', options)
      await settle()

      const view = await client.history.get('request-1')
      expect(view?._storage.options).toStrictEqual(options)
      const firstChange = events.find(([type]) => type === 'changed')
      expect(firstChange && viewOf(firstChange)._storage.options.swapMode).toBe(
        swapMode,
      )
    },
  )

  test('changing the confirmed Route before execute() changes nothing that runs', async () => {
    const { client, wallet } = await createExecutionClient()
    const confirmed = await confirmQuote(client)
    confirmed.data.selectedWallets.ETH.address = '0xchanged'
    confirmed.data.requestAmount = '99'

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    const view = await client.history.get('request-1')
    expect(view?._storage.data.selectedWallets.ETH).toEqual(
      SELECTED_WALLETS.ETH,
    )
    expect(view?._storage.data.requestAmount).toBe('1')
    // v14's sign takes no address: the stored one passed the Wallet gate, as `0xchanged` would not have.
    expect(wallet.evm.sign).toHaveBeenCalledTimes(1)
  })

  test('re-confirming the Quote before execute() runs the newest Route', async () => {
    const { client } = await createExecutionClient()
    await confirmQuote(client)
    httpClient.confirmRoute.mockResolvedValueOnce(
      confirmResponse('request-1', [swap({ swapperId: 'Newest' })]),
    )
    await client.confirm('request-1', SELECTED_WALLETS)

    await client.execute('request-1', EXECUTION_OPTIONS)

    const view = await client.history.get('request-1')
    expect(view?._storage.data.result.swaps[0]?.swapperId).toBe('Newest')
  })

  test('after execute(), confirming the Quote again changes nothing stored and execute() runs nothing new', async () => {
    const { client } = await createExecutionClient()
    await confirmQuote(client)
    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()
    const before = structuredClone(await client.history.get('request-1'))
    httpClient.confirmRoute.mockResolvedValueOnce(
      confirmResponse('request-1', [swap(), swap()]),
    )
    await client.confirm('request-1', SELECTED_WALLETS)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(await client.history.get('request-1')).toEqual(before)
    expect(httpClient.createTransaction).toHaveBeenCalledTimes(1)
  })

  test('every port request goes to the evm namespace and carries the blockchain with no address or Wallet ID; sign gets the transaction and no chain ID', async () => {
    const { client, requests } = await createExecutionClient()
    await confirmQuote(client)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    const target = { blockchain: 'ETH' }
    expect(requests).toEqual([
      ['evm', 'getChainId', target],
      ['evm', 'sign', { ...target, tx: evmTx() }],
    ])
  })

  test.each([
    ['hex', '0x1'],
    ['decimal', '1'],
  ])(
    'getChainId answering the chain in %s passes the gate',
    async (_, chainId) => {
      const { client, wallet } = await createExecutionClient(
        recordingNamespaces({ ETH: chainId }),
      )
      await confirmQuote(client)

      await client.execute('request-1', EXECUTION_OPTIONS)
      await settle()

      expect(wallet.evm.sign).toHaveBeenCalledTimes(1)
      expect((await client.history.get('request-1'))?._queue.status).toBe(
        'SUCCESS',
      )
    },
  )

  test('stores sign_requested before sign is called and signed with the hash after it resolves', async () => {
    const { client, wallet } = await createExecutionClient()
    await confirmQuote(client)
    const seen: unknown[] = []
    wallet.evm.sign.mockImplementationOnce(async () => {
      const view = await client.history.get('request-1')
      seen.push(structuredClone(view?._storage.transactions.s1?.execution))
      return { hash: '0xsigned' }
    })

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()

    expect(seen).toEqual([
      {
        status: 'sign_requested',
        result: { walletResult: null, checkResult: null },
      },
    ])
    const signed = httpClient.checkStatus.mock.calls[0]
    expect(signed).toEqual([
      { requestId: 'request-1', step: 1, txId: '0xsigned' },
    ])
    const view = await client.history.get('request-1')
    expect(
      view?._storage.transactions.s1?.execution.result.walletResult,
    ).toEqual({ hash: '0xsigned' })
  })

  test('polls checkStatus with the hash once per POLL_INTERVAL_MS until success', async () => {
    const { client } = await createExecutionClient()
    await confirmQuote(client)
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValue(succeeded)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(THIRD_CALL)
    expect((await client.history.get('request-1'))?._queue.status).toBe(
      'SUCCESS',
    )

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
    await settle()
    expect(httpClient.checkStatus).toHaveBeenCalledTimes(THIRD_CALL)
    for (const [req] of httpClient.checkStatus.mock.calls) {
      expect(req).toEqual({ requestId: 'request-1', step: 1, txId: '0xhash1' })
    }
  })

  test('emits the success-path events in order, each with a view that already shows its write', async () => {
    const { client, events } = await createExecutionClient()
    await confirmQuote(client)
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValueOnce(statusResponse({ outputAmount: '2995' }))
      .mockResolvedValue(succeeded)

    await client.execute('request-1', EXECUTION_OPTIONS)
    await settle()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2)
    await settle()

    expect(events.map(nameOf).filter((name) => name !== 'changed')).toEqual([
      'route:started',
      'step1:started',
      'step1:create_tx',
      'step1:send_tx',
      'step1:tx_sent',
      'step1:check_status',
      'step1:check_status',
      'step1:output_revealed',
      'step1:succeeded',
      'route:succeeded',
    ])
    const [change, last] = events.slice(-SUCCESS_TAIL)
    expect(change?.[0]).toBe('changed')
    expect(change && viewOf(change)._queue.status).toBe('SUCCESS')
    expect(last && nameOf(last)).toBe('route:succeeded')
    expect(last && viewOf(last)._queue.status).toBe('SUCCESS')

    const entryAt = (name: string) =>
      events
        .filter((event) => nameOf(event) === name)
        .map((event) => viewOf(event)._storage.transactions.s1)
    expect(entryAt('step1:create_tx')).toEqual([undefined])
    expect(entryAt('step1:send_tx')[0]?.execution.status).toBe('sign_requested')
    expect(entryAt('step1:tx_sent')[0]?.execution).toMatchObject({
      status: 'signed',
      result: { walletResult: { hash: '0xhash1' } },
    })
    expect(
      entryAt('step1:output_revealed')[0]?.execution.result.checkResult
        ?.outputAmount,
    ).toBe('2995')
    expect(entryAt('step1:succeeded')[0]?.execution.status).toBe('completed')
    const routeSucceeded = events.find(
      (event) => nameOf(event) === 'route:succeeded',
    )
    expect(routeSucceeded && viewOf(routeSucceeded)._storage).toMatchObject({
      finishedSwapSteps: 1,
      finishedAt: expect.any(Number),
    })

    // A `changed` follows every stored change: each event's storage was first sent in a `changed`.
    events.forEach((event, index) => {
      const { _storage: storage } = viewOf(event)
      const changes = events
        .slice(0, index + 1)
        .filter(([type]) => type === 'changed')
        .map((change) => viewOf(change)._storage)
      expect(changes).toContainEqual(storage)
    })
    for (const event of events) {
      expect(viewOf(event)._queue.id).toBe('request-1')
    }
  })

  test('history.getAll() returns one view per Execution, a copy of its ExecutionRecord', async () => {
    const { client } = await createExecutionClient()
    await confirmQuote(client, 'request-1')
    await confirmQuote(client, 'request-2')
    httpClient.checkStatus.mockReset()
    httpClient.checkStatus.mockResolvedValue(statusResponse())

    await client.execute('request-1', EXECUTION_OPTIONS)
    await client.execute('request-2', EXECUTION_OPTIONS)
    await settle()

    const views = await client.history.getAll()
    expect(views.map(({ _queue }) => _queue.id).sort()).toEqual([
      'request-1',
      'request-2',
    ])
    for (const view of views) {
      expect(view._queue).toMatchObject({
        status: 'RUNNING',
        blocked: null,
        createdAt: expect.any(Number),
      })
      expect(view._storage.data.requestId).toBe(view._queue.id)
    }

    httpClient.checkStatus.mockResolvedValue(succeeded)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await settle()

    // A view kept from before is a copy: only a fresh read shows the progress.
    for (const view of views) {
      expect(view._storage.finishedSwapSteps).toBe(0)
    }
    for (const view of await client.history.getAll()) {
      expect(view._storage.transactions.s1?.execution.status).toBe('completed')
      expect(view._storage.finishedSwapSteps).toBe(1)
    }
  })
})

describe('the execution engine', () => {
  // Counts every load of the queue core.
  const loaded = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    resetHttpClient()
    loaded.mockClear()
    vi.doMock('@rango-dev/queue-manager-core', async (importOriginal) => {
      loaded()
      return importOriginal()
    })
    factory = new IDBFactory()
    globalThis.indexedDB = factory
  })

  afterEach(() => {
    vi.doUnmock('@rango-dev/queue-manager-core')
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('building the client loads no queue core and opens no IndexedDB; the first execution call does', async () => {
    const open = vi.spyOn(factory, 'open')
    const { client } = await createExecutionClient()
    await settle()

    expect(loaded).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()

    expect(await client.history.getAll()).toEqual([])
    expect(await client.history.get('request-1')).toBeUndefined()

    expect(loaded).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('queues-manager', expect.anything())
  })

  /*
   * With `pauseOnStart`, core's Manager pauses as it is constructed, which needs `window.setInterval`: in Node, with
   * no `window`, the build rejects. The failed attempt's Manager still opens its database once, so each build counts
   * one `open('queues-manager')`.
   */
  test('a failed build is not kept: in Node with pauseOnStart and no window, pause() rejects, and after a window the next pause() builds again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const open = vi.spyOn(factory, 'open')
    const { client, all } = await createExecutionClient(
      undefined,
      evmBlockchains,
      { pauseOnStart: true },
    )

    const error = await expectSdkError(client.pause())

    expect(error).toMatchObject({
      type: 'REQUEST_FAILED',
      message: 'The request failed.',
    })
    expect(error).toHaveProperty('cause', expect.any(ReferenceError))
    await settle()
    expect(open).toHaveBeenCalledTimes(1)

    stubWindow()
    await expect(client.pause()).resolves.toBeUndefined()
    await settle()

    expect(open).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenLastCalledWith('queues-manager', expect.anything())
    expect(await client.history.getAll()).toEqual([])
    expect(all.every(([name]) => name === 'loaded')).toBe(true)
  })

  test('calls made during a failing build all get its error, and the calls after it share one rebuild', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const open = vi.spyOn(factory, 'open')
    const { client } = await createExecutionClient(undefined, evmBlockchains, {
      pauseOnStart: true,
    })

    const failed = await Promise.all([
      expectSdkError(client.pause()),
      expectSdkError(client.history.getAll()),
      expectSdkError(client.resume()),
    ])

    const [first] = failed
    for (const error of failed) {
      expect(error).toBe(first)
    }
    expect(first).toMatchObject({ type: 'REQUEST_FAILED' })
    await settle()
    expect(open).toHaveBeenCalledTimes(1)

    stubWindow()
    await Promise.all([
      client.pause(),
      client.history.getAll(),
      client.history.get('request-1'),
    ])
    await settle()

    expect(open).toHaveBeenCalledTimes(2)
    expect(loaded).toHaveBeenCalledTimes(1)
  })

  test('execution calls after a successful build reuse it: core is loaded once and IndexedDB opened once', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    stubWindow()
    const open = vi.spyOn(factory, 'open')
    const { client } = await createExecutionClient()

    await client.history.getAll()
    await client.pause()
    await client.resume()
    await client.history.get('request-1')
    await settle()

    expect(loaded).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
