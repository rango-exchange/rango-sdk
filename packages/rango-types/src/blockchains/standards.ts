import { TransactionType } from '../api/shared/index.js'
import { StdCosmosManifest, StdEvmManifest } from './manifests.js'

export type StdBlockchain = {
  id: string
  type: TransactionType
  chainId: string | null
  icon: string
  transactionUrl: string
}

export type StdBasicBlockchainInfo = StdBlockchain & { manifest: null }

export interface StdEvmBlockchainInfo extends StdBlockchain {
  type: TransactionType.EVM
  chainId: string
  manifest: StdEvmManifest
}

export interface StdCosmosBlockchainInfo extends StdBlockchain {
  type: TransactionType.COSMOS
  chainId: string
  manifest: StdCosmosManifest
}

export type StdBlockchainInfo =
  | StdBasicBlockchainInfo
  | StdEvmBlockchainInfo
  | StdCosmosBlockchainInfo
