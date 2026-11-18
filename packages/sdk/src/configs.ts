import type { ExecutionConfig } from './actions/mod.js'

/**
 * The client config. `quotes()`, `quote()` and `confirm()` need only `apiKey`; `execution` turns on the execution
 * methods.
 */
export type RangoClientConfig = {
  apiKey: string
  /** Defaults to `https://api.rango.exchange`. */
  baseUrl?: string
  /** The execution settings: the `wallet` that `execute()` and the other execution methods need, and how they run. */
  execution?: ExecutionConfig
}

export type ResolvedConfig = {
  readonly apiKey: string
  readonly baseUrl: string
  readonly execution?: ExecutionConfig
}

const DEFAULT_BASE_URL = 'https://api.rango.exchange'

export function resolveConfig(config: RangoClientConfig): ResolvedConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    execution: config.execution,
  }
}
