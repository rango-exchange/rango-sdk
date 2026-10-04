const DEFAULT_BASE_URL = 'https://api.rango.exchange'

export type RangoClientConfig = {
  apiKey: string
  baseUrl?: string
}

type ResolvedConfig = {
  readonly apiKey: string
  readonly baseUrl: string
}

export class RangoClient {
  // eslint-disable-next-line no-unused-private-class-members -- read by the API methods
  readonly #config: ResolvedConfig

  constructor(config: RangoClientConfig) {
    this.#config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    }
  }
}
