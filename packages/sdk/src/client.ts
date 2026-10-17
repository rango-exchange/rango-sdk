import type {
  ConfirmRequest,
  ConfirmResult,
  QuoteRequest,
  QuoteResult,
  QuotesRequest,
  QuotesResult,
} from './actions/mod.js'
import type { RangoClientConfig, ResolvedConfig } from './configs.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- for `{@link SdkError}` in the TSDoc
import type { SdkError } from './errors/mod.js'
import type { RequestOptions } from './types.js'

import { RangoClient as LegacyRangoClient } from 'rango-sdk'

import { confirmQuote, fetchQuote, fetchQuotes } from './actions/mod.js'
import { resolveConfig } from './configs.js'

export class RangoClient {
  readonly #config: ResolvedConfig
  readonly #httpClient: LegacyRangoClient

  /**
   * @param config - Your `apiKey`, a `baseUrl` that defaults to `https://api.rango.exchange`, and the meta API's blockchain list as `meta.blockchains`, used by `quote()` and `confirm()` to check a set `destination`.
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#usage
   */
  constructor(config: RangoClientConfig) {
    this.#config = resolveConfig(config)
    this.#httpClient = new LegacyRangoClient(
      this.#config.apiKey,
      this.#config.baseUrl,
    )
  }

  /**
   * The best Route in one step, when you have the user's wallets.
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
    return fetchQuote(this.#httpClient, request, {
      ...opts,
      meta: this.#config.meta,
    })
  }

  /**
   * Every available Quote for a swap, without a wallet.
   *
   * @returns `data.quotes`: one entry per server result, with its `warnings`. An entry's `error` is attached, not thrown.
   * @throws {@link SdkError}
   * @example
   * ```ts
   * const { data } = await client.quotes({
   *   from: { blockchain: 'ETH', symbol: 'ETH', address: null },
   *   to: {
   *     blockchain: 'BSC',
   *     symbol: 'USDC',
   *     address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
   *   },
   *   amount: '1',
   * })
   * ```
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#quotes
   */
  async quotes(
    request: QuotesRequest,
    opts?: RequestOptions,
  ): Promise<QuotesResult> {
    return fetchQuotes(this.#httpClient, request, opts)
  }

  /**
   * Turns the chosen Quote into a Route for the user's wallets.
   *
   * @param request - Pass the entry's `data` as `quote` unchanged.
   * @returns `data`: a Route, and the `warnings` that apply.
   * @throws {@link SdkError}
   * @example
   * ```ts
   * const chosen = data.quotes.find((entry) => !entry.error)
   * const selectedWallets = { ETH: '0x...', BSC: '0x...' }
   * const { data: route, warnings } = await client.confirm({
   *   quote: chosen.data,
   *   selectedWallets,
   * })
   * ```
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#confirm
   */
  async confirm(
    request: ConfirmRequest,
    options?: RequestOptions,
  ): Promise<ConfirmResult> {
    return confirmQuote(this.#httpClient, request, {
      ...options,
      meta: this.#config.meta,
    })
  }
}
