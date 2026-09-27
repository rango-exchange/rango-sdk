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
}

type ResolvedConfig = {
  readonly apiKey: string
  readonly baseUrl: string
  affiliate?: Affiliate
}

export class RangoClient {
  #config: ResolvedConfig

  constructor(config: RangoClientConfig) {
    this.#config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      affiliate: config.affiliate && structuredClone(config.affiliate),
    }
  }

  setAffiliate(affiliate: Affiliate): void {
    this.#config.affiliate = structuredClone(affiliate)
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
