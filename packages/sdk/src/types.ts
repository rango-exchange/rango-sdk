import type { ConfirmResult, ExecutionEngine, Quote } from './actions/mod.js'
import type { Cache } from './cache/mod.js'
import type {
  BlockchainMeta,
  RangoClient as LegacyRangoClient,
} from 'rango-sdk'

/**
 * The legacy `rango-sdk` client as the SDK sees it: only the methods it calls.
 * The actions take this, not the whole legacy class, so a fake needs only these methods.
 * `createTransaction`, `checkStatus` and `reportFailure` are for the execution tasks.
 * Internal: not exported from the package entry.
 */
export type LegacyClient = Pick<
  LegacyRangoClient,
  | 'getBestRoute'
  | 'getAllRoutes'
  | 'confirmRoute'
  | 'getBlockchains'
  | 'createTransaction'
  | 'checkStatus'
  | 'reportFailure'
>

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
  /** `confirm()`'s results by request ID, for the last 10 confirms, each dropped once `execute()` stores it. */
  confirmed: ReadonlyMap<string, ConfirmResult>
  /** The blockchain list a destination is checked against, fetched on first need and never refetched. */
  blockchains: readonly BlockchainMeta[]
}

/**
 * The client's cache, read only. Don't mutate what you read.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#clientcache
 */
export type ReadonlyCache = Pick<Cache<CacheSchema>, 'get'>

// The client's private fields, passed whole to every action as one argument.
export type ClientState = {
  httpClient: LegacyClient
  cache: Cache<CacheSchema>
  /*
   * The client's execution engine, built on the first call and shared by every later one, once its first load is done.
   */
  executionEngine: () => Promise<ExecutionEngine>
}
