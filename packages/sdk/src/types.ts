import type { Quote } from './actions/mod.js'
import type { Cache } from './cache/mod.js'
import type { BlockchainMeta } from 'rango-sdk'

export type RequestOptions = {
  signal?: AbortSignal
}

/**
 * What a client caches, one value per slot.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#clientcache
 */
export type CacheSchema = {
  /** Quotes by route ID, then by request ID, for the last 10 route IDs. */
  quotes: ReadonlyMap<string, ReadonlyMap<string, Quote>>
  /** The blockchain list a destination is checked against, fetched on first need and never refetched. */
  blockchains: readonly BlockchainMeta[]
}

/**
 * The client's cache, read only. Don't mutate what you read.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#clientcache
 */
export type ReadonlyCache = Pick<Cache<CacheSchema>, 'get'>
