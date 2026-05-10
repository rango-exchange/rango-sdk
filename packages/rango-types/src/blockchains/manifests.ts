export type StdEvmManifest = {
  name: string
  shortName: string
  chain: string
  chainId: string
  rpc: string[]
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  networkId: string
  icon: string
  explorers: { url: string }[]
}

export type StdCosmosManifest = {
  id: string
  experimental: boolean
  info: StdCosmosChainInfo
}

export interface StdCosmosChainInfo {
  chainId: string
  rpc: string
  rest: string
  cosmostationLcdUrl: string
  cosmostationApiUrl: string
  cosmostationDenomTracePath: string
  mintScanName: string
  chainName: string
  stakeCurrency: CosmosCurrency
  bip44: {
    coinType: number
  }
  bech32Config: {
    bech32PrefixAccAddr: string
    bech32PrefixAccPub: string
    bech32PrefixValAddr: string
    bech32PrefixValPub: string
    bech32PrefixConsAddr: string
    bech32PrefixConsPub: string
  }
  currencies: CosmosCurrency[]
  feeCurrencies: CosmosCurrency[]
  features: string[]
}

export interface CosmosCurrency {
  coinDenom: string
  coinMinimalDenom: string
  coinDecimals: number
  coinGeckoId: string
  coinImageUrl: string
}
