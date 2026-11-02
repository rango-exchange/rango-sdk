import type {
  ConfirmOptions,
  ConfirmResult,
  ExecutionEngine,
  ExecutionHistory,
  ExecutionOptions,
  QuoteRequest,
  QuoteResult,
  QuotesOptions,
  QuotesResult,
  SelectedWallets,
} from './actions/mod.js'
import type { RangoClientConfig, ResolvedConfig } from './configs.js'
import type {
  CacheSchema,
  ClientState,
  LegacyClient,
  ReadonlyCache,
  RequestOptions,
} from './types.js'
import type { Asset } from 'rango-sdk'

import { RangoClient as LegacyRangoClient } from 'rango-sdk'

import {
  confirmQuote,
  createExecutionEngine,
  fetchQuote,
  fetchQuotes,
  getAllExecutions,
  getExecution,
  startOrUnblockExecution,
} from './actions/mod.js'
import { Cache } from './cache/mod.js'
import { resolveConfig } from './configs.js'
import { throwSdkError } from './errors/mod.js'

export class RangoClient {
  /**
   * What this client has cached. Read only.
   *
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#clientcache
   */
  readonly cache: ReadonlyCache

  /**
   * The Executions stored in this browser, each as a `HistoryItem`.
   *
   * @returns `get()`: the Execution's `HistoryItem`, or `undefined` for an unknown request ID. `getAll()`: one
   * `HistoryItem` per Execution the execution engine loaded.
   * @throws {@link SdkError}
   * @example
   * ```ts
   * const item = await client.history.get(route.requestId) // a HistoryItem, or undefined
   * const items = await client.history.getAll()
   * ```
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#history
   */
  readonly history: ExecutionHistory

  readonly #config: ResolvedConfig
  readonly #httpClient: LegacyClient
  readonly #cache: Cache<CacheSchema>
  /*
   * The execution engine's build, started by the first execution call. A failed build is not kept: the next execution
   * call builds again.
   */
  #executionEnginePromise: Promise<ExecutionEngine> | undefined

  /**
   * @param config - Your `apiKey`, a `baseUrl` that defaults to `https://api.rango.exchange`, and the `execution`
   * config: the optional `emitter` and `pauseOnStart` that `execute()` runs with.
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#usage
   */
  constructor(config: RangoClientConfig) {
    this.#config = resolveConfig(config)
    this.#httpClient = new LegacyRangoClient(
      this.#config.apiKey,
      this.#config.baseUrl,
    )
    this.#cache = new Cache()
    this.cache = { get: (key) => this.#cache.get(key) }
    this.history = {
      get: async (requestId) => getExecution(this.#state(), requestId),
      getAll: async () => getAllExecutions(this.#state()),
    }
  }

  /**
   * The best Route in one step, when you have the user's wallets.
   *
   * A set `destination` is checked against the cached blockchain list, fetched on first need.
   *
   * @param request - `checkPrerequisites` defaults to `true`.
   * @returns `data`: a Route, and the `warnings` that apply.
   * @throws {@link SdkError}
   * @example
   * ```ts
   * const { data: route, warnings } = await client.quote({
   *   from,
   *   to,
   *   amount,
   *   selectedWallets,
   * })
   * ```
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#quote
   */
  async quote(
    request: QuoteRequest,
    opts?: RequestOptions,
  ): Promise<QuoteResult> {
    return fetchQuote(this.#state(), request, opts)
  }

  /**
   * Every available Quote for a swap, without a wallet.
   *
   * Each successful call caches the returned Quotes for `confirm()`.
   *
   * @returns `data.quotes`: one entry per server result, with its `warnings`. An entry's `error` is attached, not thrown.
   * @throws {@link SdkError}
   * @example
   * ```ts
   * const { data } = await client.quotes(
   *   { blockchain: 'ETH', symbol: 'ETH', address: null },
   *   {
   *     blockchain: 'BSC',
   *     symbol: 'USDC',
   *     address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
   *   },
   *   '1',
   *   { req: { slippage: '1' } },
   * )
   * ```
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#quotes
   */
  async quotes(
    from: Asset,
    to: Asset,
    amount: string,
    options?: QuotesOptions,
  ): Promise<QuotesResult> {
    return fetchQuotes(this.#state(), from, to, amount, options)
  }

  /**
   * Turns the cached Quote with this request ID into a Route for the user's wallets.
   *
   * A set `req.destination` is checked as in `quote()`. A copy of the result is kept in the cache's
   * `confirmed` slot for `execute()`, for the last 10 confirms; confirming the same Quote again replaces it.
   *
   * @param requestId - The `requestId` of a Quote cached by `quotes()`.
   * @returns `data`: a Route, and the `warnings` that apply.
   * @throws {@link SdkError}
   * @example
   * ```ts
   * const chosen = data.quotes.find((entry) => !entry.error)
   * const selectedWallets = { ETH: '0x...', BSC: '0x...' }
   * const { data: route, warnings } = await client.confirm(
   *   chosen.data.requestId,
   *   selectedWallets,
   * )
   * ```
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#confirm
   */
  async confirm(
    requestId: string,
    selectedWallets: SelectedWallets,
    options?: ConfirmOptions,
  ): Promise<ConfirmResult> {
    return confirmQuote(this.#state(), requestId, selectedWallets, options)
  }

  /**
   * Runs a confirmed Route to its end, or unblocks its stored Execution.
   *
   * @param requestId - The `requestId` of a Route that `confirm()` returned, or of a stored Execution.
   * @returns Once the Execution is stored and its first task has started.
   * @throws {@link SdkError}
   * @example
   * ```ts
   * await client.execute(route.requestId, {
   *   transactionOptions: {
   *     slippage: '1',
   *     validations: { balance: true, fee: true },
   *   },
   *   walletTypes: { ETH: { walletType: 'metamask' } },
   * })
   * ```
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#execute
   */
  async execute(requestId: string, options?: ExecutionOptions): Promise<void> {
    return startOrUnblockExecution(this.#state(), requestId, options)
  }

  #state(): ClientState {
    return {
      httpClient: this.#httpClient,
      cache: this.#cache,
      executionEngine: this.#executionEngine.bind(this),
    }
  }

  /*
   * Built by the first execution call, with core loaded only then, and shared by the calls made while it is in
   * flight. A failed build is not kept: the calls waiting on it get its error, and the next execution call builds
   * again.
   */
  async #executionEngine(): Promise<ExecutionEngine> {
    if (this.#executionEnginePromise) {
      return this.#executionEnginePromise
    }
    this.#executionEnginePromise = createExecutionEngine(
      this.#config.execution,
      this.#httpClient,
      this.#cache,
    ).catch((cause: unknown) => throwSdkError(cause))
    this.#executionEnginePromise.catch(() => {
      this.#executionEnginePromise = undefined
    })
    return this.#executionEnginePromise
  }
}
