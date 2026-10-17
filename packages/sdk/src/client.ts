import type { QuoteRequest, QuoteResult } from './actions/mod.js'
import type { RangoClientConfig, ResolvedConfig } from './configs.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- for `{@link SdkError}` in the TSDoc
import type { SdkError } from './errors/mod.js'
import type { RequestOptions } from './types.js'

import { RangoClient as LegacyRangoClient } from 'rango-sdk'

import { fetchQuote } from './actions/mod.js'
import { resolveConfig } from './configs.js'

export class RangoClient {
  readonly #config: ResolvedConfig
  readonly #httpClient: LegacyRangoClient

  /**
   * @param config - Your `apiKey`, a `baseUrl` that defaults to `https://api.rango.exchange`, and the meta API's blockchain list as `meta.blockchains`, used by `quote()` to check a set `destination`.
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
}
