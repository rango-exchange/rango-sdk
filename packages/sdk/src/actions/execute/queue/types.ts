import type { LegacyClient } from '../../../types.js'
import type { ExecutionRecord, ExecutionTransaction } from '../mod.js'
import type {
  ExecuterActions,
  PayloadArg,
  QueueInfo,
  SetStorage,
} from '@rango-dev/queue-manager-core'
import type { BlockchainMeta, Transaction } from 'rango-sdk'
import type { TransactionType } from 'rango-types'

export type CheckResult = NonNullable<
  ExecutionTransaction['execution']['result']['checkResult']
>

export type SdkContext = {
  httpClient: LegacyClient
  // From the client's Cache, or with an HTTP call on a miss.
  loadBlockchainsMeta: () => Promise<readonly BlockchainMeta[]>
  // Each signed `EVM` main entry's `sign` response until its `wait` takes it, keyed `requestId/transactionId`; a reload loses it.
  signResponsesAwaitingWait: Map<string, unknown>
  // `true` while this client is paused by `pauseOnStart: true` or `pause()`.
  isPaused: () => boolean
  // The status of the Execution's queue.
  getQueueStatus: (requestId: string) => StoredQueue['status'] | undefined
}

/*
 * Core keeps the stored record as given (its fields are `any`), so a `QueueInfo` is assigned to this without a cast or
 * a shape check. `list` is only the part of core's queue we read.
 */
export type StoredQueue = Omit<QueueInfo, 'status' | 'list' | 'actions'> & {
  status: 'PENDING' | 'RUNNING' | 'BLOCKED' | 'SUCCESS' | 'FAILED' | 'CANCELED'
  list: {
    unblock: () => void
  }
  actions: {
    run: () => void
    setStorage: SetStorage<ExecutionRecord>
    getStorage: () => ExecutionRecord
  }
}

// Payloads are `type` aliases: an `interface` has no index signature, so it isn't a JSON payload.
export type ExecuteTransactionPayload = { transactionId: string }
export type StepFinishedPayload = { step: number }

export type SdkPayloads = {
  SDK_FETCH_TRANSACTION: undefined
  SDK_EXECUTE_TRANSACTION: ExecuteTransactionPayload
  SDK_STEP_FINISHED: StepFinishedPayload
}

export type ActionName = keyof SdkPayloads

export type SdkActions<K extends ActionName = ActionName> = ExecuterActions<
  ExecutionRecord,
  ActionName,
  SdkContext,
  SdkPayloads,
  K
>

export type TaskResult = Array<
  { [N in ActionName]: [N, ...PayloadArg<SdkPayloads[N]>] }[ActionName]
>

// An entry's new `checkResult`, stored in the same write as the failure.
export type FailedCheck = { transactionId: string; checkResult: CheckResult }

export type HyperliquidTransaction = Extract<
  Transaction,
  { type: TransactionType.HYPERLIQUID }
>

// Where an entry is signed: the `selectedWallets` key, or `'HYPERLIQUID'`, and the entry's address on it.
export type RequiredWallet = { blockchain: string; address: string }

// `response` is kept for an EVM port's `wait`.
export type SignedEntryResult = {
  walletResult: { hash: string }
  response?: unknown
}
