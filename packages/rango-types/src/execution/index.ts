import {
  CosmosTransaction,
  EvmTransaction,
  SuiTransaction,
  SimulationResult,
  SolanaTransaction,
  StarknetTransaction,
  SwapperStatusStep,
  Transfer as TransferTransaction,
  XrplTransaction,
  StellarTransaction,
} from '../api/main/index.js'
import { TransactionPrerequisiteResult } from '../api/shared/prerequisites/index.js'
import {
  AmountRestrictionType,
  SwapExplorerUrl,
  TronTransaction,
  TonTransaction,
} from '../api/shared/index.js'
import { HyperliquidTransaction } from '../api/shared/txs/hyperliquid.js'

export type StepStatus =
  | 'created'
  | 'running'
  | 'failed'
  | 'success'
  | 'waitingForApproval'
  | 'approved'

export type SwapStatus = 'running' | 'failed' | 'success'

export enum PendingSwapNetworkStatus {
  WaitingForConnectingWallet = 'waitingForConnectingWallet',
  WaitingForQueue = 'waitingForQueue',
  WaitingForNetworkChange = 'waitingForNetworkChange',
  NetworkChanged = 'networkChanged',
  NetworkChangeFailed = 'networkChangeFailed',
}

export type SwapStepRoute = {
  fromBlockchain: string
  fromBlockchainLogo: string | null
  fromSymbol: string
  fromSymbolAddress: string | null
  fromDecimals: number
  fromAmountPrecision: string | null
  fromAmountMinValue: string | null
  fromAmountMaxValue: string | null
  fromAmountRestrictionType: AmountRestrictionType | null
  fromLogo: string
  fromUsdPrice: number | null
  toBlockchain: string
  toBlockchainLogo: string | null
  toSymbol: string
  toSymbolAddress: string | null
  toDecimals: number
  toLogo: string
  toUsdPrice: number | null
  swapperId: string
  swapperLogo: string | null
  swapperType: string | null
  expectedOutputAmountHumanReadable: string | null
  estimatedTimeInSeconds: number | null
  feeInUsd: string | null
  internalSteps: SwapperStatusStep[] | null // used for solana internal steps
}

export type SwapStepTransaction = {
  cosmosTransaction: CosmosTransaction | null
  transferTransaction: TransferTransaction | null
  solanaTransaction: SolanaTransaction | null
  evmApprovalTransaction: EvmTransaction | null
  evmTransaction: EvmTransaction | null
  tronApprovalTransaction: TronTransaction | null
  tronTransaction: TronTransaction | null
  starknetApprovalTransaction: StarknetTransaction | null
  starknetTransaction: StarknetTransaction | null
  tonTransaction: TonTransaction | null
  suiTransaction: SuiTransaction | null
  xrplTransaction: XrplTransaction | null
  stellarTransaction: StellarTransaction | null
  hyperliquidTransaction: HyperliquidTransaction | null
}

export type SwapStepStatus = {
  startTransactionTime: number
  status: StepStatus
  networkStatus: PendingSwapNetworkStatus | null
  executedTransactionId: string | null
  executedTransactionTime: string | null
  explorerUrl: SwapExplorerUrl[] | null
  diagnosisUrl: string | null
  outputAmount: string | null
  prerequisiteResults: TransactionPrerequisiteResult[] | undefined
}

export type PendingSwapStep = SwapStepRoute &
  SwapStepTransaction &
  SwapStepStatus & {
    id: number
    internalSwaps: SwapStepRoute[] | null
  }

export enum MessageSeverity {
  error = 'error',
  warning = 'warning',
  info = 'info',
  success = 'success',
}

export type WalletTypeAndAddress = {
  walletType: string
  address: string
}

export type SwapSavedSettings = {
  slippage: string
  disabledSwappersIds?: string[]
  disabledSwappersGroups?: string[]
  infiniteApprove?: boolean
}

export type PendingSwap = {
  creationTime: string
  finishTime: string | null
  requestId: string
  inputAmount: string
  status: SwapStatus
  isPaused: boolean
  mode?: 'swap' | 'refuel'
  extraMessage: string | null
  extraMessageSeverity: MessageSeverity | null
  extraMessageErrorCode: string | null
  extraMessageDetail: string | null | undefined
  networkStatusExtraMessage: string | null
  networkStatusExtraMessageDetail: string | null
  lastNotificationTime: string | null
  wallets: { [p: string]: WalletTypeAndAddress }
  settings: SwapSavedSettings
  steps: PendingSwapStep[]
  simulationResult: SimulationResult
  validateBalanceOrFee: boolean
  hasAlreadyProceededToSign?: boolean | null
}
