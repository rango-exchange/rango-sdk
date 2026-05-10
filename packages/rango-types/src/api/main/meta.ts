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

/**
 * All metadata info for a token, unique by (blockchain, symbol, address) tuple
 *
 * @property {string} blockchain - The blockchain which this token belongs to
 * @property {string | null} address - Smart contract address of token, null for native tokens
 * @property {string} symbol - The token symbol, e.g: ADA
 * @property {string | null} name - Display name of token, e.g: Cardano for ADA. It can be null
 * @property {number} decimals - Decimals of token in blockchain, example: 18
 * @property {string} image - Url of its image, example: https://api.rango.exchange/tokens/ETH/ETH.png
 * @property {number | null} usdPrice - USD unit price of this token if available
 * @property {boolean} isSecondaryCoin - If true, means that the token's trading is high risk. Better to warn user before proceeding
 * @property {string | null} coinSource - If the token is secondary, coinSource indicates the third-party list
 * that Rango found this token in, example: Pancake Extended List
 * @property {string | null} coinSourceUrl - The absolute url of the source list that token was extracted from
 * @property {boolean} isPopular - If true, means that the token is popular
 * @property {string[]} [supportedSwappers] - List of swappers that support this token
 *
 */
export type Token = {
  blockchain: string
  address: string | null
  symbol: string
  name: string | null
  decimals: number
  image: string
  usdPrice: number | null
  isSecondaryCoin: boolean
  coinSource: string | null
  coinSourceUrl: string | null
  isPopular: boolean
  supportedSwappers?: string[]
}

/**
 * Compact version of token
 */
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

/**
 * Metadata info for all blockchains and tokens supported
 *
 * @property {BlockchainMeta[]} blockchains - List of all supported blockchains
 * @property {Token[]} tokens - List of all tokens
 * @property {Token[]} popularTokens - List of popular tokens, a subset of tokens field
 * @property {SwapperMeta[]} swappers - List of all DEXes & Bridges
 *
 */
export type MetaResponse = {
  blockchains: BlockchainMeta[]
  tokens: Token[]
  popularTokens: Token[]
  swappers: SwapperMeta[]
}

/**
 * Compact Metadata info for all blockchains and tokens supported
 *
 * @property {BlockchainMeta[]} blockchains - List of all supported blockchains
 * @property {CompactToken[]} tokens - List of all tokens in compact format
 * @property {Token[]} popularTokens - List of popular tokens, a subset of tokens field
 * @property {SwapperMeta[]} swappers - List of all DEXes & Bridges
 *
 */
export type CompactMetaResponse = {
  blockchains: BlockchainMeta[]
  tokens: CompactToken[]
  popularTokens: CompactToken[]
  swappers: SwapperMeta[]
}

/**
 * Custom token request
 *
 * @property {string} blockchain - The blockchain that token belong to
 * @property {string} address - The contract address for the desired token
 *
 */
export type CustomTokenRequest = {
  blockchain: string
  address: string
}

/**
 * The custom token response which includes:
 * Token details for user desired token that is not available on Rango official list.
 * Currently supports Solana and EVM based blockchains.
 *
 * @property {Token} token - The destination asset
 * @property {string | null} error - Error message
 * @property {number | null} errorCode - Error code
 * @property {number | null} traceId - Trace Id, for debug purpose
 */
export type CustomTokenResponse = {
  token: Token
  error: string | null
  errorCode: number | null
  traceId: number | null
}

/**
 * The request to search for custom tokens
 *
 * @property {string} query - The search query string
 * @property {string} [blockchain] - An optional parameter to specify the blockchain for filtering results
 */
export type SearchCustomTokensRequest = { query: string; blockchain?: string }

/**
 * The response for a custom token search
 *
 * @property {Token[]} tokens - List of tokens found in the searcH
 * @property {string | null} error - Error message
 * @property {number | null} errorCode - Error code
 * @property {number | null} traceId - Trace Id, for debug purpose
 */
export type SearchCustomTokensResponse = {
  tokens: Token[]
  error: string | null
  errorCode: number | null
  traceId: number | null
}
