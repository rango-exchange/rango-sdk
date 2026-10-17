import type { BlockchainMeta } from 'rango-sdk'

export type RangoClientConfig = {
  apiKey: string
  baseUrl?: string
  meta: { blockchains: readonly BlockchainMeta[] }
}

export type ResolvedConfig = {
  readonly apiKey: string
  readonly baseUrl: string
  readonly meta: { readonly blockchains: readonly BlockchainMeta[] }
}

const DEFAULT_BASE_URL = 'https://api.rango.exchange'

export function resolveConfig(config: RangoClientConfig): ResolvedConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    meta: { blockchains: config.meta.blockchains },
  }
}
