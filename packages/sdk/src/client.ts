import type { QuoteRequest, QuoteResult } from './quote.js'
import type { Quote, QuotesRequest } from './quotes.js'
import type { ValidationConfig } from './thresholds.js'
import type { RequestOptions } from './transport.js'

import { RangoClient as LegacyRangoClient } from 'rango-sdk'

import { fetchQuote } from './quote.js'
import { fetchQuotes } from './quotes.js'
import { resolveThresholds } from './thresholds.js'

const DEFAULT_BASE_URL = 'https://api.rango.exchange'

export type Affiliate = {
  ref: string
  percent?: number
  wallets?: { [chain: string]: string }
}

export type RangoClientConfig = {
  apiKey: string
  baseUrl?: string
  affiliate?: Affiliate
  validation?: ValidationConfig
}

type ResolvedConfig = {
  readonly apiKey: string
  readonly baseUrl: string
  affiliate?: Affiliate
  readonly validation?: ValidationConfig
}

export class RangoClient {
  #config: ResolvedConfig
  #legacy: LegacyRangoClient

  constructor(config: RangoClientConfig) {
    this.#config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      affiliate: config.affiliate && structuredClone(config.affiliate),
      validation: config.validation && structuredClone(config.validation),
    }
    this.#legacy = new LegacyRangoClient(
      this.#config.apiKey,
      this.#config.baseUrl,
    )
  }

  setAffiliate(affiliate: Affiliate): void {
    this.#config.affiliate = structuredClone(affiliate)
  }

  async quote(
    request: QuoteRequest,
    opts?: RequestOptions,
  ): Promise<QuoteResult> {
    return fetchQuote(
      this.#legacy,
      this.#config.affiliate,
      resolveThresholds(this.#config.validation, opts?.validation),
      request,
      opts,
    )
  }

  async quotes(
    request: QuotesRequest,
    opts?: RequestOptions,
  ): Promise<Quote[]> {
    return fetchQuotes(
      this.#legacy,
      this.#config.affiliate,
      resolveThresholds(this.#config.validation, opts?.validation),
      request,
      opts,
    )
  }
}

let defaultClient: RangoClient | undefined

export function createClient(config: RangoClientConfig): RangoClient {
  if (defaultClient) {
    throw new Error(
      'The default Rango client has already been created. Call createClient only once, or use getClient() to reach it.',
    )
  }
  defaultClient = new RangoClient(config)
  return defaultClient
}

export function getClient(): RangoClient {
  if (!defaultClient) {
    throw new Error(
      'The default Rango client has not been created yet. Call createClient({ apiKey }) before getClient().',
    )
  }
  return defaultClient
}
