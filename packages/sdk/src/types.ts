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
  /** The blockchain list a destination is checked against, fetched on first need and never refetched. */
  blockchains: readonly BlockchainMeta[]
}

/**
 * The client's Cache as the app sees it, to read only. `get('blockchains')` is the blockchain list, `undefined` until
 * a `quote()` or `confirm()` with a destination has fetched it. Don't mutate what you read.
 */
export type ReadonlyCache = Pick<Cache<CacheSchema>, 'get'>
