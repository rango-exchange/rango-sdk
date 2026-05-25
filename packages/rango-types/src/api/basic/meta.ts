import {
  EVMChainInfo,
  CosmosChainInfo,
  SwapperMetaDto,
  SwapperMeta,
  SwapperMetaExtended,
  BlockchainMetaBase,
  EvmBlockchainMeta,
  CosmosBlockchainMeta,
  TransferBlockchainMeta,
  BlockchainMeta,
  MessagingProtocol,
  MessagingProtocolsResponse,
} from '../shared/index.js'

export {
  EVMChainInfo,
  CosmosChainInfo,
  SwapperMetaDto,
  SwapperMeta,
  SwapperMetaExtended,
  BlockchainMetaBase,
  EvmBlockchainMeta,
  CosmosBlockchainMeta,
  TransferBlockchainMeta,
  BlockchainMeta,
  MessagingProtocol,
  MessagingProtocolsResponse,
}

/** All metadata info for a token, unique by (blockchain, symbol, address) tuple */
export type Token = {
  /** The blockchain which this token belongs to */
  blockchain: string
  /** The chainId which this token belongs to, e.g. 1 for ETH, 56 for BSC and ... */
  chainId: string | null
  /** Smart contract address of token, null for native tokens */
  address: string | null
  /** The token symbol, e.g: ADA */
  symbol: string
  /** The token name, e.g: Binance Pegged ETH */
  name: string | null
  /** Decimals of token in blockchain, example: 18 */
  decimals: number
  /** Url of its image, example: https://api.rango.exchange/tokens/ETH/ETH.png */
  image: string
  /** Url of the blockchain image */
  blockchainImage: string
  /** The token unit price */
  usdPrice: number | null
  /** If true, means that the token is popular */
  isPopular: boolean
  /** Supported Swappers for this token */
  supportedSwappers: string[]
}

/** Metadata info for all blockchains and tokens supported */
export type MetaResponse = {
  /** List of all supported blockchains */
  blockchains: BlockchainMeta[]
  /** List of all tokens */
  tokens: Token[]
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
