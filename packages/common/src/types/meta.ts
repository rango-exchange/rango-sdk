import { Asset, SwapperType } from './common'
import { TransactionType } from './transactions'

/**
 * EVM Chain Info
 *
 * @property {string} chainName - Chain name, e.g. Polygon Mainnet
 * @property {name: string, symbol: string, decimals: null} nativeCurrency
 * @property {string[]} rpcUrls - e.g. "https://polygon-rpc.com"
 * @property {string[]} blockExplorerUrls - e.g. "https://polygonscan.com"
 * @property {string} addressUrl - Explorer address base url for this blockchain,
 * e.g. "https://bscscan.com/address/{wallet}"
 * @property {string} transactionUrl - Explorer transaction base url for this blockchain,
 * e.g. "https://bscscan.com/tx/{txHash}"
 *
 */
export type EVMChainInfo = {
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: string[]
  blockExplorerUrls: string[]
  addressUrl: string
  transactionUrl: string
}

type StarkNetChainInfo = {
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  blockExplorerUrls: string[]
  addressUrl: string
  transactionUrl: string
}

/**
 * Cosmos Chain Info - Used for adding experimental chains to keplr if needed
 *
 * @see https://github.com/osmosis-labs/osmosis-frontend/blob/0b88e39740cb087be576f464bfcd6cc2971ed2fd/packages/web/config/chain-infos.ts
 *
 */
export type CosmosChainInfo = {
  experimental: boolean
  rpc: string
  rest: string
  cosmostationLcdUrl: string | null
  cosmostationApiUrl: string | null
  cosmostationDenomTracePath: string
  mintScanName: string | null
  chainName: string
  stakeCurrency: {
    coinDenom: string
    coinMinimalDenom: string
    coinDecimals: number
    coinGeckoId: string
    coinImageUrl: string
  }
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
  currencies: {
    coinDenom: string
    coinMinimalDenom: string
    coinDecimals: number
    coinGeckoId: string
    coinImageUrl: string
  }[]
  feeCurrencies: {
    coinDenom: string
    coinMinimalDenom: string
    coinDecimals: number
    coinGeckoId: string
    coinImageUrl: string
  }[]
  features: string[]
  explorerUrlToTx: string
  gasPriceStep: {
    low: number
    average: number
    high: number
  } | null
}

export interface CosmosInfo extends Omit<CosmosChainInfo, 'chianId'> {
  experimental: boolean
}

export type BlockchainInfo =
  | EVMChainInfo
  | CosmosInfo
  | StarkNetChainInfo
  | null

/**
 * Blockchain Meta Information
 *
 * @property {string} name - Unique name of blockchain, this field is used in all endpoints as the identifier
 * @property {number} defaultDecimals - The default decimals of blockchain, do not use it in computations, use Token.decimals instead
 * @property {Asset[]} feeAssets - List of assets that can be used as fee in this blockchain
 * @property {string[]} addressPatterns - List of all regex patterns for wallet addresses of this blockchain, can be
 * used for input validation, example: [ "^(0x)[0-9A-Fa-f]{40}$" ]
 * @property {string} logo - Logo of the blockchain
 * @property {string} displayName - Display name for the blockchain
 * @property {string} shortName - Short name for the blockchain
 * @property {string} color - Suggested color for the blockchain
 * @property {boolean} enabled - Is blockchain enabled or not in Rango
 * @property {TransactionType} type - Type of the blockchain
 * @property {string | null} chainId - e.g. "0xa86a" for Avax, "osmosis-1" for Osmosis, etc.
 * @property {BlockchainInfo} info - Chain specific information
 *
 */
export type BlockchainMetaBase = {
  name: string
  shortName: string
  displayName: string
  defaultDecimals: number
  feeAssets: Asset[]
  addressPatterns: string[]
  logo: string
  color: string
  enabled: boolean
  type: TransactionType
  chainId: string | null
  info: BlockchainInfo
}

export interface EvmBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.EVM
  chainId: string
  info: EVMChainInfo
}

export interface CosmosBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.COSMOS
  chainId: string
  info: CosmosChainInfo
}

export interface TransferBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.TRANSFER
  chainId: null
  info: null
}

export interface StarknetBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.STARKNET
  info: StarkNetChainInfo
  chainId: string
}

export interface TronBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.TRON
  info: null
  chainId: string
}

export interface NativeBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.TRANSFER
  info: null
  chainId: null
}

export interface SolanaBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.SOLANA
  chainId: string
  info: null
}

export const isEvmBlockchain = (
  blockchainMeta: BlockchainMeta
): blockchainMeta is EvmBlockchainMeta =>
  blockchainMeta.type === TransactionType.EVM

export const isCosmosBlockchain = (
  blockchainMeta: BlockchainMeta
): blockchainMeta is CosmosBlockchainMeta =>
  blockchainMeta.type === TransactionType.COSMOS

export const isSolanaBlockchain = (
  blockchainMeta: BlockchainMeta
): blockchainMeta is SolanaBlockchainMeta =>
  blockchainMeta.type === TransactionType.SOLANA

export const isNativeBlockchain = (
  blockchainMeta: BlockchainMeta
): blockchainMeta is NativeBlockchainMeta =>
  blockchainMeta.type === TransactionType.TRANSFER

export const isStarknetBlockchain = (
  blockchainMeta: BlockchainMeta
): blockchainMeta is StarknetBlockchainMeta =>
  blockchainMeta.type === TransactionType.STARKNET

export const isTronBlockchain = (
  blockchainMeta: BlockchainMeta
): blockchainMeta is TronBlockchainMeta =>
  blockchainMeta.type === TransactionType.TRON

export const evmBlockchains = (allBlockChains: BlockchainMeta[]) =>
  allBlockChains.filter(isEvmBlockchain)

export const solanaBlockchain = (allBlockChains: BlockchainMeta[]) =>
  allBlockChains.filter(isSolanaBlockchain)

export const starknetBlockchain = (allBlockChains: BlockchainMeta[]) =>
  allBlockChains.filter(isStarknetBlockchain)

export const tronBlockchain = (allBlockChains: BlockchainMeta[]) =>
  allBlockChains.filter(isTronBlockchain)

export const cosmosBlockchains = (allBlockChains: BlockchainMeta[]) =>
  allBlockChains.filter(isCosmosBlockchain)

export type BlockchainMeta =
  | EvmBlockchainMeta
  | CosmosBlockchainMeta
  | TransferBlockchainMeta
  | SolanaBlockchainMeta
  | StarknetBlockchainMeta
  | TronBlockchainMeta

/**
 * Metadata of Swapper
 *
 * @property {string} id - Unique identifier for the swapper
 * @property {string} title - Display name for the swapper
 * @property {string} logo - Icon logo for the swapper
 * @property {string} swapperGroup - Group of the swapper
 * @property {SwapperType[]} types - Type of the transaction supported by the swapper
 *
 */
export type SwapperMetaDto = {
  id: string
  title: string
  logo: string
  swapperGroup: string
  types: SwapperType[]
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
 * @property {SwapperMetaDto[]} swappers - List of all DEXes & Bridges
 *
 */
export type MetaResponse = {
  blockchains: BlockchainMeta[]
  tokens: Token[]
  swappers: SwapperMetaDto[]
}
