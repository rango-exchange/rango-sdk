export type RangoClientConfig = {
  apiKey: string
  baseUrl?: string
}

export type ResolvedConfig = {
  readonly apiKey: string
  readonly baseUrl: string
}

const DEFAULT_BASE_URL = 'https://api.rango.exchange'

export function resolveConfig(config: RangoClientConfig): ResolvedConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
  }
}
