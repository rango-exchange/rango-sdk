import { Asset, SwapperType } from './common.js'
import { TransactionType } from './transactions.js'

export type MetaInfoType =
  | 'CosmosMetaInfo'
  | 'EvmMetaInfo'
  | 'StarkNetMetaInfo'
  | 'TronMetaInfo'
  | 'SolanaMetaInfo'
  | 'TransferMetaInfo'
  | 'SuiMetaInfo'
  | 'XRPLMetaInfo'
  | 'StellarMetaInfo'
  | 'HyperliquidMetaInfo'

/**
 * ChainInfoBase
 * Base type for all chains info type
 *
 * @property {MetaInfoType} infoType - Type of chain info
 * @property {string[]} blockExplorerUrls - e.g. "https://polygonscan.com"
 * @property {string} addressUrl - Explorer address base url for this blockchain,
 * e.g. "https://bscscan.com/address/{wallet}"
 * @property {string} transactionUrl - Explorer transaction base url for this blockchain,
 * e.g. "https://bscscan.com/tx/{txHash}"
 * @property {string | null} tokenUrl - Explorer token base url for this blockchain,
 * e.g. "https://suiscan.xyz/mainnet/coin/{address}"
 *
 */
export type ChainInfoBase = {
  infoType: MetaInfoType
  blockExplorerUrls: string[]
  addressUrl: string
  transactionUrl: string
  tokenUrl: string | null
}

/**
 * EVM Chain Info
 *
 * @property {MetaInfoType} infoType - equals to EvmMetaInfo for EvmChainInfo
 * @property {string} chainName - Chain name, e.g. Polygon Mainnet
 * @property {name: string, symbol: string, decimals: number} nativeCurrency
 * @property {string[]} rpcUrls - e.g. "https://polygon-rpc.com"
 * @property {boolean} enableGasV2 - It's true for some chains like Ethereum which we support
 * new model of gas price (i.e. maxFeePerGas and maxPriorityFeePerGas) for them
 *
 */
export interface EVMChainInfo extends ChainInfoBase {
  infoType: 'EvmMetaInfo'
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: string[]
  enableGasV2: boolean
}

/**
 * StarkNet Chain Info
 *
 * @property {MetaInfoType} infoType - equals to StarkNetMetaInfo for StarkNet
 * @property {string} chainName - Chain name
 * @property {name: string, symbol: string, decimals: number} nativeCurrency
 *
 */
export interface StarkNetChainInfo extends ChainInfoBase {
  infoType: 'StarkNetMetaInfo'
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
}

/**
 * Tron Chain Info
 *
 */
export type TronChainInfo = EVMChainInfo

/**
 * Solana Chain Info
 *
 * @property {MetaInfoType} infoType - equals to SolanaMetaInfo for Solana
 *
 */
export interface SolanaChainInfo extends ChainInfoBase {
  infoType: 'SolanaMetaInfo'
}

/**
 * Transfer Chain Info
 *
 * @property {MetaInfoType} infoType - equals to TransferMetaInfo for blockhains that uses UTXO
 *
 */
export interface TransferChainInfo extends ChainInfoBase {
  infoType: 'TransferMetaInfo'
}

/**
 * Sui Chain Info
 *
 * @property {MetaInfoType} infoType - equals to SuiMetaInfo for Sui
 *
 */
export interface SuiChainInfo extends ChainInfoBase {
  infoType: 'SuiMetaInfo'
}

/**
 * Xrpl Chain Info
 *
 * @property {MetaInfoType} infoType - equals to XrplMetaInfo for XRPL
 *
 */
export interface XrplChainInfo extends ChainInfoBase {
  infoType: 'XRPLMetaInfo'
}

/**
 * Hyperliquid Chain Info
 *
 * @property {MetaInfoType} infoType - equals to HyperliquidMetaInfo for Hyperliquid
 *
 */
export interface HyperliquidChainInfo extends ChainInfoBase {
  infoType: 'HyperliquidMetaInfo'
}

/**
 * Stellar Chain Info
 *
 * @property {MetaInfoType} infoType - equals to SteallarMetaInfo for STELLAR
 *
 */
export interface StellarChainInfo extends ChainInfoBase {
  infoType: 'StellarMetaInfo'
}

/**
 * Cosmos Chain Info - Used for adding experimental chains to keplr if needed
 *
 * @see https://github.com/osmosis-labs/osmosis-frontend/blob/0b88e39740cb087be576f464bfcd6cc2971ed2fd/packages/web/config/chain-infos.ts
 *
 */
export interface CosmosChainInfo extends ChainInfoBase {
  infoType: 'CosmosMetaInfo'
  experimental: boolean
  rpc: string
  rest: string
  cosmostationLcdUrl?: string | null
  cosmostationApiUrl?: string | null
  cosmostationDenomTracePath?: string | null
  mintScanName?: string | null
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
  gasPriceStep?: {
    low: number
    average: number
    high: number
  } | null
}

/**
 * Metadata of Swapper
 *
 * @property {string} id - Unique identifier for the swapper
 * @property {string} title - Display name for the swapper
 * @property {string} logo - Icon logo for the swapper
 * @property {string} swapperGroup - Group name for swapper
 * @property {SwapperType[]} types - Type of the transaction supported by the swapper
 * @property {boolean} enabled - It indicates whether swapper is currently enabled or not
 *
 */
export type SwapperMeta = {
  id: string
  title: string
  logo: string
  swapperGroup: string
  types: SwapperType[]
  enabled: boolean
}

/**
 * Supported blockchains for a swapper
 *
 * @property {string} source - Name of the source blockchain
 * @property {string} destinations - List of all possible target blockchains for this source blockchain
 *
 */
export type SupportedBlockchains = {
  source: string
  destinations: string[]
}

/**
 * Metadata of Swapper plus additional info e.g. supported blockchains
 *
 * @property {SupportedBlockchains[]} supportedBlockchains - supported blockchains for the swapper
 *
 */
export type SwapperMetaExtended = SwapperMeta & {
  supportedBlockchains: SupportedBlockchains[]
}

/**
 * Metadata of Swapper
 * @deprecated use SwapperMeta istead
 *
 */
export type SwapperMetaDto = SwapperMeta

/**
 * Chain specific information
 */
export type ChainInfo =
  | EVMChainInfo
  | CosmosChainInfo
  | StarkNetChainInfo
  | TronChainInfo
  | SolanaChainInfo
  | TransferChainInfo
  | SuiChainInfo
  | XrplChainInfo
  | StellarChainInfo
  | HyperliquidChainInfo

/**
 * Blockchain Meta Information
 *
 * @property {TransactionType} type - Type of the blockchain
 * @property {string} name - Unique name of blockchain, this field is used in all endpoints as the identifier
 * @property {number} defaultDecimals - The default decimals of blockchain, do not use it in computations, use Token.decimals instead
 * @property {Asset[]} feeAssets - List of assets that can be used as fee in this blockchain
 * @property {string[]} addressPatterns - List of all regex patterns for wallet addresses of this blockchain, can be
 * used for input validation, example: [ "^(0x)[0-9A-Fa-f]{40}$" ]
 * @property {string} logo - Logo of the blockchain
 * @property {string} displayName - Display name for the blockchain
 * @property {string} shortName - Short name for the blockchain
 * @property {string} color - Suggested color for the blockchain
 * @property {number} sort - Suggested sort for the blockchain
 * @property {boolean} enabled - Is blockchain enabled or not in Rango
 * @property {string | null} chainId - e.g. "0xa86a" for Avax, "osmosis-1" for Osmosis, etc.
 * @property {ChainInfo | null} info - Chain specific information
 *
 */
export type BlockchainMetaBase = {
  type: TransactionType
  name: string
  shortName: string
  displayName: string
  defaultDecimals: number
  feeAssets: Asset[]
  addressPatterns: string[]
  logo: string
  color: string
  sort: number
  enabled: boolean
  chainId: string | null
  info: ChainInfo | null
}

export interface EvmBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.EVM
  chainId: string
  info: EVMChainInfo
}

export interface CosmosBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.COSMOS
  chainId: string | null
  info: CosmosChainInfo | null
}

export interface TransferBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.TRANSFER
  chainId: null
  info: TransferChainInfo
}

export interface SolanaBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.SOLANA
  chainId: string
  info: SolanaChainInfo
}

export interface StarkNetBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.STARKNET
  chainId: string
  info: StarkNetChainInfo
}

export interface TronBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.TRON
  chainId: string
  info: TronChainInfo
}

export interface TonBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.TON
  chainId: string
  info: null
}

export interface SuiBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.SUI
  chainId: string
  info: SuiChainInfo
}

export interface XrplBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.XRPL
  chainId: string
  info: XrplChainInfo
}

export interface HyperliquidBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.HYPERLIQUID
  chainId: string
  info: HyperliquidChainInfo
}

export interface StellarBlockchainMeta extends BlockchainMetaBase {
  type: TransactionType.STELLAR
  chainId: null
  info: StellarChainInfo
}

export type BlockchainMeta =
  | EvmBlockchainMeta
  | CosmosBlockchainMeta
  | TransferBlockchainMeta
  | SolanaBlockchainMeta
  | StarkNetBlockchainMeta
  | TronBlockchainMeta
  | TonBlockchainMeta
  | SuiBlockchainMeta
  | XrplBlockchainMeta
  | StellarBlockchainMeta
  | HyperliquidBlockchainMeta

/**
 * MessagingProtocol
 *
 * @property {string} id - The unique identifier for the messaging protocol.
 *
 */
export type MessagingProtocol = {
  id: string
}

/**
 * Metadata info for all supported messaging protcols
 *
 * @property {MessagingProtocol[]} protocols - List of all supported messaging protocols, e.g. AXELAR, ...
 *
 */
export type MessagingProtocolsResponse = {
  protocols: MessagingProtocol[]
}

/**
 * The MetaRequest type is used to specify the filter parameters for the meta endpoint.
 *
 * @property {string[]} [blockchains] - An array of strings representing the blockchains to include in
 * the request.
 * @property {boolean} [blockchainsExclude] - A boolean value indicating whether the specified
 * blockchains should be excluded or included in the response. If set to true, the specified blockchains
 * will be excluded. If set to false or not provided, the specified blockchains will be included.
 * @property {string[]} [swappers] - An array of strings representing the Id of swappers.
 * @property {boolean} [swappersExclude] - The `swappersExclude` property is a boolean value that
 * indicates whether to exclude or include specific swappers in the response. If set to `true`, it means
 * that the swappers specified in the `swappers` property should be excluded from the response. If set
 * to `false` or not
 * @property {string[]} [swappersGroups] - The `swappersGroups` property is an array of strings that
 * represents the groups of swappers. This property allows you to
 * specify which swapper groups you want to include or exclude
 * @property {boolean} [swappersGroupsExclude] - The `swappersGroupsExclude` property is a boolean value
 * that determines whether to exclude or include swapper groups. If set to `true`, it means that the
 * specified swapper groups should be excluded from the response. If set to `false` or not provided, the
 * specified swapper groups should
 * @property {TransactionType[]} [transactionTypes] - The `transactionTypes` property is an array of
 * `TransactionType` values. It specifies the types of transactions that should be included in the meta
 * response.
 * @property {boolean} [transactionTypesExclude] - The `transactionTypesExclude` property is a boolean
 * value that indicates whether the specified transaction types should be excluded or included in the
 * response. If set to `true`, the specified transaction types will be excluded from the response. If set
 * to `false` or not provided, the specified transaction types will be
 * @property {boolean} [excludeSecondaries] - The `excludeSecondaries` property is a boolean flag that
 * indicates whether secondary tokens should be excluded from the response.
 * @property {boolean} [excludeNonPopulars] - The `excludeNonPopulars` property is a boolean value that
 * indicates whether non-popular token should be excluded from the response.
 * @property {boolean} [ignoreSupportedSwappers] - A boolean value indicating whether to include supported
 * swappers list per token in response.
 * @property {boolean} [enableCentralizedSwappers] - You could set this parameter to true if you want to enable routing from the centralized protocols like Exodus.
 * By default, this parameter is false.
 */
export type MetaRequest = {
  blockchains?: string[]
  blockchainsExclude?: boolean
  swappers?: string[]
  swappersExclude?: boolean
  swappersGroups?: string[]
  swappersGroupsExclude?: boolean
  transactionTypes?: TransactionType[]
  transactionTypesExclude?: boolean
  excludeSecondaries?: boolean
  excludeNonPopulars?: boolean
  ignoreSupportedSwappers?: boolean
  enableCentralizedSwappers?: boolean
}
