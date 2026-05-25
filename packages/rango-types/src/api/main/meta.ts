import {
  EVMChainInfo,
  CosmosChainInfo,
  SwapperMetaDto,
  BlockchainMetaBase,
  EvmBlockchainMeta,
  CosmosBlockchainMeta,
  TransferBlockchainMeta,
  BlockchainMeta,
  SwapperMeta,
  MessagingProtocol,
  MessagingProtocolsResponse,
} from '../shared/index.js'

export {
  EVMChainInfo,
  CosmosChainInfo,
  SwapperMetaDto,
  BlockchainMetaBase,
  EvmBlockchainMeta,
  CosmosBlockchainMeta,
  TransferBlockchainMeta,
  BlockchainMeta,
  SwapperMeta,
  MessagingProtocol,
  MessagingProtocolsResponse,
}

/** All metadata info for a token, unique by (blockchain, symbol, address) tuple */
export type Token = {
  /** The blockchain which this token belongs to */
  blockchain: string
  /** Smart contract address of token, null for native tokens */
  address: string | null
  /** The token symbol, e.g: ADA */
  symbol: string
  /** Display name of token, e.g: Cardano for ADA. It can be null */
  name: string | null
  /** Decimals of token in blockchain, example: 18 */
  decimals: number
  /** Url of its image, example: https://api.rango.exchange/tokens/ETH/ETH.png */
  image: string
  /** USD unit price of this token if available */
  usdPrice: number | null
  /** If true, means that the token's trading is high risk. Better to warn user before proceeding */
  isSecondaryCoin: boolean
  /** If the token is secondary, coinSource indicates the third-party list that Rango found this token in, example: Pancake Extended List */
  coinSource: string | null
  /** The absolute url of the source list that token was extracted from */
  coinSourceUrl: string | null
  /** If true, means that the token is popular */
  isPopular: boolean
  /** List of swappers that support this token */
  supportedSwappers?: string[]
}

/** Compact version of token */
export type CompactToken = {
  b: string
  a: string | null
  s: string
  n?: string
  d: number
  i: string
  p?: number
  ip?: boolean
  is?: boolean
  c?: string
  cu?: string
  ss?: string[]
}

/** Metadata info for all blockchains and tokens supported */
export type MetaResponse = {
  /** List of all supported blockchains */
  blockchains: BlockchainMeta[]
  /** List of all tokens */
  tokens: Token[]
  /** List of popular tokens, a subset of tokens field */
  popularTokens: Token[]
  /** List of all DEXes & Bridges */
  swappers: SwapperMeta[]
}

/** Compact Metadata info for all blockchains and tokens supported */
export type CompactMetaResponse = {
  /** List of all supported blockchains */
  blockchains: BlockchainMeta[]
  /** List of all tokens in compact format */
  tokens: CompactToken[]
  /** List of popular tokens, a subset of tokens field */
  popularTokens: CompactToken[]
  /** List of all DEXes & Bridges */
  swappers: SwapperMeta[]
}

/** Custom token request */
export type CustomTokenRequest = {
  /** The blockchain that token belong to */
  blockchain: string
  /** The contract address for the desired token */
  address: string
}

/**
 * The custom token response which includes:
 * Token details for user desired token that is not available on Rango official list.
 * Currently supports Solana and EVM based blockchains.
 */
export type CustomTokenResponse = {
  /** The destination asset */
  token: Token
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}

/** The request to search for custom tokens */
export type SearchCustomTokensRequest = {
  /** The search query string */
  query: string
  /** An optional parameter to specify the blockchain for filtering results */
  blockchain?: string
}

/** The response for a custom token search */
export type SearchCustomTokensResponse = {
  /** List of tokens found in the searcH */
  tokens: Token[]
  /** Error message */
  error: string | null
  /** Error code */
  errorCode: number | null
  /** Trace Id, for debug purpose */
  traceId: number | null
}
