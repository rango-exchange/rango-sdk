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
 */
export type ChainInfoBase = {
  /** Type of chain info */
  infoType: MetaInfoType
  /** e.g. "https://polygonscan.com" */
  blockExplorerUrls: string[]
  /** Explorer address base url for this blockchain, e.g. "https://bscscan.com/address/{wallet}" */
  addressUrl: string
  /** Explorer transaction base url for this blockchain, e.g. "https://bscscan.com/tx/{txHash}" */
  transactionUrl: string
  /** Explorer token base url for this blockchain, e.g. "https://suiscan.xyz/mainnet/coin/{address}" */
  tokenUrl: string | null
}

/** EVM Chain Info */
export interface EVMChainInfo extends ChainInfoBase {
  /** equals to EvmMetaInfo for EvmChainInfo */
  infoType: 'EvmMetaInfo'
  /** Chain name, e.g. Polygon Mainnet */
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  /** e.g. "https://polygon-rpc.com" */
  rpcUrls: string[]
  /** It's true for some chains like Ethereum which we support new model of gas price (i.e. maxFeePerGas and maxPriorityFeePerGas) for them */
  enableGasV2: boolean
}

/** StarkNet Chain Info */
export interface StarkNetChainInfo extends ChainInfoBase {
  /** equals to StarkNetMetaInfo for StarkNet */
  infoType: 'StarkNetMetaInfo'
  /** Chain name */
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
}

/** Tron Chain Info */
export type TronChainInfo = EVMChainInfo

/** Solana Chain Info */
export interface SolanaChainInfo extends ChainInfoBase {
  /** equals to SolanaMetaInfo for Solana */
  infoType: 'SolanaMetaInfo'
}

/** Transfer Chain Info */
export interface TransferChainInfo extends ChainInfoBase {
  /** equals to TransferMetaInfo for blockhains that uses UTXO */
  infoType: 'TransferMetaInfo'
}

/** Sui Chain Info */
export interface SuiChainInfo extends ChainInfoBase {
  /** equals to SuiMetaInfo for Sui */
  infoType: 'SuiMetaInfo'
}

/** Xrpl Chain Info */
export interface XrplChainInfo extends ChainInfoBase {
  /** equals to XrplMetaInfo for XRPL */
  infoType: 'XRPLMetaInfo'
}

/** Hyperliquid Chain Info */
export interface HyperliquidChainInfo extends ChainInfoBase {
  /** equals to HyperliquidMetaInfo for Hyperliquid */
  infoType: 'HyperliquidMetaInfo'
}

/** Stellar Chain Info */
export interface StellarChainInfo extends ChainInfoBase {
  /** equals to SteallarMetaInfo for STELLAR */
  infoType: 'StellarMetaInfo'
}

/**
 * Cosmos Chain Info - Used for adding experimental chains to keplr if needed
 *
 * @see https://github.com/osmosis-labs/osmosis-frontend/blob/0b88e39740cb087be576f464bfcd6cc2971ed2fd/packages/web/config/chain-infos.ts
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

/** Metadata of Swapper */
export type SwapperMeta = {
  /** Unique identifier for the swapper */
  id: string
  /** Display name for the swapper */
  title: string
  /** Icon logo for the swapper */
  logo: string
  /** Group name for swapper */
  swapperGroup: string
  /** Type of the transaction supported by the swapper */
  types: SwapperType[]
  /** It indicates whether swapper is currently enabled or not */
  enabled: boolean
}

/** Supported blockchains for a swapper */
export type SupportedBlockchains = {
  /** Name of the source blockchain */
  source: string
  /** List of all possible target blockchains for this source blockchain */
  destinations: string[]
}

/** Metadata of Swapper plus additional info e.g. supported blockchains */
export type SwapperMetaExtended = SwapperMeta & {
  /** supported blockchains for the swapper */
  supportedBlockchains: SupportedBlockchains[]
}

/**
 * Metadata of Swapper
 * @deprecated use SwapperMeta istead
 */
export type SwapperMetaDto = SwapperMeta

/** Chain specific information */
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

/** Blockchain Meta Information */
export type BlockchainMetaBase = {
  /** Type of the blockchain */
  type: TransactionType
  /** Unique name of blockchain, this field is used in all endpoints as the identifier */
  name: string
  /** Short name for the blockchain */
  shortName: string
  /** Display name for the blockchain */
  displayName: string
  /** The default decimals of blockchain, do not use it in computations, use Token.decimals instead */
  defaultDecimals: number
  /** List of assets that can be used as fee in this blockchain */
  feeAssets: Asset[]
  /** List of all regex patterns for wallet addresses of this blockchain, can be used for input validation, example: [ "^(0x)[0-9A-Fa-f]{40}$" ] */
  addressPatterns: string[]
  /** Logo of the blockchain */
  logo: string
  /** Suggested color for the blockchain */
  color: string
  /** Suggested sort for the blockchain */
  sort: number
  /** Is blockchain enabled or not in Rango */
  enabled: boolean
  /** e.g. "0xa86a" for Avax, "osmosis-1" for Osmosis, etc. */
  chainId: string | null
  /** Chain specific information */
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

/** MessagingProtocol */
export type MessagingProtocol = {
  /** The unique identifier for the messaging protocol. */
  id: string
}

/** Metadata info for all supported messaging protcols */
export type MessagingProtocolsResponse = {
  /** List of all supported messaging protocols, e.g. AXELAR, ... */
  protocols: MessagingProtocol[]
}

/** The MetaRequest type is used to specify the filter parameters for the meta endpoint. */
export type MetaRequest = {
  /** An array of strings representing the blockchains to include in the request. */
  blockchains?: string[]
  /**
   * A boolean value indicating whether the specified blockchains should be excluded or included in the response. If set to true, the specified blockchains
   * will be excluded. If set to false or not provided, the specified blockchains will be included.
   */
  blockchainsExclude?: boolean
  /** An array of strings representing the Id of swappers. */
  swappers?: string[]
  /**
   * The `swappersExclude` property is a boolean value that
   * indicates whether to exclude or include specific swappers in the response. If set to `true`, it means
   * that the swappers specified in the `swappers` property should be excluded from the response. If set
   * to `false` or not
   */
  swappersExclude?: boolean
  /**
   * The `swappersGroups` property is an array of strings that
   * represents the groups of swappers. This property allows you to
   * specify which swapper groups you want to include or exclude
   */
  swappersGroups?: string[]
  /**
   * The `swappersGroupsExclude` property is a boolean value
   * that determines whether to exclude or include swapper groups. If set to `true`, it means that the
   * specified swapper groups should be excluded from the response. If set to `false` or not provided, the
   * specified swapper groups should
   */
  swappersGroupsExclude?: boolean
  /**
   * The `transactionTypes` property is an array of
   * `TransactionType` values. It specifies the types of transactions that should be included in the meta
   * response.
   */
  transactionTypes?: TransactionType[]
  /**
   * The `transactionTypesExclude` property is a boolean
   * value that indicates whether the specified transaction types should be excluded or included in the
   * response. If set to `true`, the specified transaction types will be excluded from the response. If set
   * to `false` or not provided, the specified transaction types will be
   */
  transactionTypesExclude?: boolean
  /** The `excludeSecondaries` property is a boolean flag that indicates whether secondary tokens should be excluded from the response. */
  excludeSecondaries?: boolean
  /** The `excludeNonPopulars` property is a boolean value that indicates whether non-popular token should be excluded from the response. */
  excludeNonPopulars?: boolean
  /** A boolean value indicating whether to include supported swappers list per token in response. */
  ignoreSupportedSwappers?: boolean
  /**
   * You could set this parameter to true if you want to enable routing from the centralized protocols like Exodus.
   * By default, this parameter is false.
   */
  enableCentralizedSwappers?: boolean
}
