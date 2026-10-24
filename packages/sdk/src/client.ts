import type {
  ConfirmOptions,
  ConfirmResult,
  QuoteRequest,
  QuoteResult,
  QuotesOptions,
  QuotesResult,
  SelectedWallets,
} from './actions/mod.js'
import type { RangoClientConfig, ResolvedConfig } from './configs.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- for `{@link SdkError}` in the TSDoc
import type { SdkError } from './errors/mod.js'
import type { CacheSchema, ReadonlyCache, RequestOptions } from './types.js'
import type { Asset } from 'rango-sdk'

import { RangoClient as LegacyRangoClient } from 'rango-sdk'

import { confirmQuote, fetchQuote, fetchQuotes } from './actions/mod.js'
import { Cache } from './cache/mod.js'
import { resolveConfig } from './configs.js'

export class RangoClient {
  /**
   * What this client has cached. Read only.
   *
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#clientcache
   */
  readonly cache: ReadonlyCache

  readonly #config: ResolvedConfig
  readonly #httpClient: LegacyRangoClient
  readonly #cache: Cache<CacheSchema>

  /**
   * @param config - Your `apiKey`, and a `baseUrl` that defaults to `https://api.rango.exchange`.
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
    return fetchQuote(this.#httpClient, this.#cache, request, opts)
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
    return fetchQuotes(this.#httpClient, this.#cache, from, to, amount, options)
  }

  /**
   * Turns the cached Quote with this request ID into a Route for the user's wallets.
   *
   * A set `req.destination` is checked as in `quote()`.
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
    return confirmQuote(
      this.#httpClient,
      this.#cache,
      requestId,
      selectedWallets,
      options,
    )
  }
}
