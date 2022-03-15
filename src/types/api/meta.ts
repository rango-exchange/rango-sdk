import type { Asset } from './common'

/**
 * Blockchain information
 *
 * @property {string} name - Unique name of blockchain, this field is used in all endpoints as the identifier
 * @property {number} defaultDecimals - The default decimals of blockchain, do not use it in computations, use Token.decimals instead
 * @property {Asset[]} feeAssets - List of assets that can be used as fee in this blockchain
 * @property {string[]} addressPatterns - List of all regex patterns for wallet addresses of this blockchain, can be
 * used for input validation, example: [ "^(0x)[0-9A-Fa-f]{40}$" ]
 *
 */
export type BlockchainMeta = {
  name: string
  defaultDecimals: number
  feeAssets: Asset[]
  addressPatterns: string[]
}

/**
 * Metadata of Swapper
 */
export type SwapperMetaDto = {
  id: string
  title: string
  logo: string
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
}

/**
 * Metadata info for all blockchains and tokens supported
 *
 * @property {BlockchainMeta[]} blockchains - List of all supported blockchains
 * @property {Token[]} tokens - List of all tokens
 * @property {Token[]} popularTokens - List of popular tokens, a subset of tokens field
 * @property {SwapperMetaDto[]} swappers - List of all DEXes & Bridges
 *
 */
export type MetaResponse = {
  blockchains: BlockchainMeta[]
  tokens: Token[]
  popularTokens: Token[]
  swappers: SwapperMetaDto[]
}
