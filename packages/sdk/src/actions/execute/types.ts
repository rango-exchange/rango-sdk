import type { SdkContext } from './queue/mod.js'
import type { Route } from '../quote/mod.js'
import type { Manager } from '@rango-dev/queue-manager-core'
import type { Transaction } from 'rango-sdk'
import type { APIErrorCode, TransactionPrerequisite } from 'rango-types'

/**
 * The client config's `execution`: the settings the execution methods run with.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#setup
 */
export type ExecutionConfig = {
  /**
   * Receives the events of every Execution.
   *
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#events
   */
  emitter?: Emitter<ExecutionEvents>
  /**
   * `true` builds the client paused, for an app in several tabs; defaults to `false`.
   *
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#pause-and-resume
   */
  pauseOnStart?: boolean
}

/**
 * How an Execution runs, given to the `execute()` call that creates it.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#execute
 */
export type ExecutionOptions = {
  /** Sent to `/tx/create` for every Step. */
  transactionOptions: {
    /** Required to create an Execution; the Route's own slippage is not used. */
    slippage: string
    /** Sent as given; the server reads an absent one as `false`. */
    infiniteApprove?: boolean
    /** Sent as given, with `approve: false`. */
    validations: { balance: boolean; fee: boolean }
  }
  /** The wallet type the user picked per blockchain, keyed like the Route's `selectedWallets` (`HYPERLIQUID` included). */
  walletTypes: { [blockchain: string]: { walletType: string } }
  /** Not read by the SDK: stored as given, or as `'swap'` when absent. */
  swapMode?: 'swap' | 'refuel'
}

/**
 * Reads the stored Executions, each as a `HistoryItem`.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#history
 */
export type ExecutionHistory = {
  /** The Execution with this request ID, or `undefined` when none is stored. */
  get(requestId: string): Promise<HistoryItem | undefined>
  /** Every stored Execution. */
  getAll(): Promise<HistoryItem[]>
}

/**
 * A stored Execution as `history` and the events return it, in a provisional shape the underscores mark.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#history
 */
export type HistoryItem = {
  /** A copy of the stored record, which you can keep or change. */
  _storage: ExecutionRecord
  /** The queue's state. */
  _queue: {
    /** The Route's request ID, which is also the Execution's ID. */
    id: string
    /** When the Execution was stored, in milliseconds since the epoch. */
    createdAt: number
    /** The Execution's status. */
    status:
      | 'PENDING'
      | 'RUNNING'
      | 'BLOCKED'
      | 'SUCCESS'
      | 'FAILED'
      | 'CANCELED'
    /** Why the Execution waits while `status` is `BLOCKED`, else `null`. */
    blocked: BlockReason | null
  }
}

/**
 * Why an Execution is `BLOCKED`: the wallet of `blockchain` isn't connected, doesn't hold `address`, or isn't on
 * `requiredChainId`.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#history
 */
export type BlockReason =
  | {
      reason: 'NOT_CONNECTED'
      metadata: { blockchain: string; address: string }
    }
  | {
      reason: 'ACCOUNT_MISMATCH'
      metadata: { blockchain: string; address: string }
    }
  | {
      reason: 'NETWORK_MISMATCH'
      metadata: { blockchain: string; address: string; requiredChainId: string }
    }

/**
 * What is stored for an Execution.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#history
 */
export type ExecutionRecord = {
  /** The `confirm()` result's `data`, with `selectedWallets`. */
  data: Route
  /** A copy of what `execute()` was given, with an absent `swapMode` stored as `'swap'`. */
  options: ExecutionOptions
  /** One entry per fetched transaction: `s<step>` for a Step's main transaction, `s<step>.p<i>` for its Prerequisites. */
  transactions: { [id: string]: ExecutionTransaction }
  /** The number of Steps whose transaction succeeded. */
  finishedSwapSteps: number
  /** Why the Execution failed or was canceled, else `null`. */
  failure: ExecutionFailure | null
  /** When the Execution succeeded, failed or was canceled, in milliseconds since the epoch. */
  finishedAt: number | null
}

/**
 * Why an Execution failed or was canceled, stored and never thrown.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#errors-and-failures
 */
export type ExecutionFailure = {
  /** The failure's reason code. */
  reasonCode: APIErrorCode
  /** The failing error's message, or `Swap canceled by user.` for a cancel. */
  message: string
  /** What the signer or Rango said about the failure, or `null`. */
  detail: string | null
}

/**
 * A fetched transaction of an Execution, a Step's main transaction or a Prerequisite, and how far it has run.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#history
 */
export type ExecutionTransaction = {
  /** The transaction or Prerequisite as Rango sent it. */
  data:
    | { type: 'tx'; value: Transaction }
    | { type: 'prerequisite'; value: TransactionPrerequisite }
  /** The 1-based Step it belongs to. */
  step: number
  /** How far the transaction has run, and what came of it. */
  execution: {
    /** Where the transaction stands, from `not_started` to `completed`. */
    status: 'not_started' | 'sign_requested' | 'signed' | 'completed'
    /** What signing and Rango's status answers gave. */
    result: {
      /** The signed transaction's hash, or `null` until it is known. */
      walletResult: { hash: string } | null
      /** The signed transaction's explorer links and what Rango's status answers said about it, or `null` before any. */
      checkResult: {
        /** The step's output amount, once Rango knows it. */
        outputAmount: string | null
        /** The explorer links for the step. */
        explorerUrl: { url: string; description: string | null }[]
        /** Rango's page diagnosing the step, when it has one. */
        diagnosisUrl: string | null
      } | null
    }
  }
}

/**
 * Receives the execution events; a mitt emitter fits as it is.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#events
 */
export interface Emitter<Events extends Record<string, unknown>> {
  /** Called with each event's name and payload. */
  emit<K extends keyof Events>(type: K, event: Events[K]): void
}

/**
 * The events the `emitter` receives.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#events
 */
export type ExecutionEvents = {
  /** An Execution started, succeeded or failed. */
  routeEvent: { event: RouteEvent; view: HistoryItem }
  /** A Step's progress, with the entry's ID as `transactionId`, or `null` when none is involved yet. */
  stepEvent: {
    event: StepEvent
    step: number
    transactionId: string | null
    view: HistoryItem
  }
  /** A fresh `HistoryItem` after every stored change. */
  changed: HistoryItem
  /** Storage was loaded: read `history.getAll()` again. */
  loaded: undefined
}

/**
 * What a `routeEvent` reports.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#events
 */
export type RouteEvent = { type: 'started' | 'succeeded' | 'failed' }

/**
 * What a `stepEvent` reports.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#events
 */
export type StepEvent =
  | {
      type:
        | 'started'
        | 'succeeded'
        | 'failed'
        | 'check_status'
        | 'output_revealed'
        | 'approval_tx_succeeded'
    }
  | {
      type: 'tx_execution'
      status: 'create_tx' | 'switch_network' | 'send_tx' | 'tx_sent'
    }
  | {
      type: 'tx_execution_blocked'
      status:
        | 'waiting_for_wallet_connect'
        | 'waiting_for_change_wallet_account'
        | 'waiting_for_network_change'
    }

export type ExecutionEngine = {
  // Its first load is done, also after a load error.
  manager: Manager
  // The context every task gets, for what an execution method does outside a task.
  context: SdkContext
}
