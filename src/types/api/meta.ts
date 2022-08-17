import type { Asset, SwapperType } from './common'
import { TransactionType } from './transactions'

/**
 * Blockchain information
 *
 * @property {string} name - Unique name of blockchain, this field is used in all endpoints as the identifier
 * @property {number} defaultDecimals - The default decimals of blockchain, do not use it in computations, use Token.decimals instead
 * @property {Asset[]} feeAssets - List of assets that can be used as fee in this blockchain
 * @property {string[]} addressPatterns - List of all regex patterns for wallet addresses of this blockchain, can be
 * used for input validation, example: [ "^(0x)[0-9A-Fa-f]{40}$" ]
 * @property {TransactionType | null} type - Type of transactions in this blockchain
 * @property {string | null} chainId - Chain Id (e.g. 1 for Ethereum)
 *
 */
export type BlockchainMeta = {
  name: string
  defaultDecimals: number
  feeAssets: Asset[]
  addressPatterns: string[]
  type: TransactionType | null
  chainId: string | null
}

/**
 * Metadata of Swapper
 *
 * @property {string} id - Unique identifier for the swapper
 * @property {string} title - Display name for the swapper
 * @property {string} logo - Icon logo for the swapper
 * @property {SwapperType[]} types - Type of the transaction supported by the swapper
 *
 */
export type SwapperMetaDto = {
  id: string
  title: string
  logo: string
  types: SwapperType[]
}

/**
 * All metadata info for a token, unique by (blockchain, symbol, address) tuple
 *
 * @property {string} blockchain - The blockchain which this token belongs to
 * @property {string | null} address - Smart contract address of token, null for native tokens
 * @property {string} symbol - The token symbol, e.g: ADA
 * @property {number} decimals - Decimals of token in blockchain, example: 18
 * @property {string} image - Url of its image, example: https://api.rango.exchange/tokens/ETH/ETH.png
 *
 */
export type Token = {
  blockchain: string
  address: string | null
  symbol: string
  decimals: number
  image: string
}

/**
 * Metadata info for all blockchains and tokens supported
 *
 * @property {BlockchainMeta[]} blockchains - List of all supported blockchains
 * @property {Token[]} tokens - List of all tokens
 * @property {SwapperMetaDto[]} swappers - List of all DEXes & Bridges
 *
 */
export type MetaResponse = {
  blockchains: BlockchainMeta[]
  tokens: Token[]
  swappers: SwapperMetaDto[]
}
