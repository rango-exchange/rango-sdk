import type { SdkContext } from './queue/mod.js'
import type { Route } from '../quote/mod.js'
import type { Manager } from '@rango-dev/queue-manager-core'
import type { Transaction } from 'rango-sdk'
import type {
  APIErrorCode,
  TransactionPrerequisite,
  TransactionType,
} from 'rango-types'

/**
 * The client config's `execution`: the wallet and settings the execution methods run with.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#setup
 */
export type ExecutionConfig = {
  /**
   * Signs and reads for the user's wallets, one optional key per namespace.
   *
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
   */
  wallet?: WalletPort
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
  /**
   * Called before each run of an Execution, to set the wallet that run uses.
   *
   * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#beforeresume
   */
  beforeResume?: BeforeResume
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

// A namespace's transaction, and a Prerequisite of one type, as the Rango types define them.
type TxOf<T extends TransactionType> = Extract<Transaction, { type: T }>
type PrerequisiteOf<T extends TransactionPrerequisite['type']> = Extract<
  TransactionPrerequisite,
  { type: T }
>

/**
 * What a namespace's `sign` resolves with.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export type SignResult = {
  /** The sent transaction's hash. */
  hash: string
  /** A live response that `wait` gets back in the same page. */
  response?: unknown
  /** `true` when the hash is provisional and `wait` will return the real one. */
  hashRequiringUpdate?: boolean
}

/**
 * An EVM chain's EIP-3085 description, without `chainId` and `iconUrls`.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export type EvmChainDescription = {
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls: string[]
}

/**
 * The EVM namespace, for every EVM blockchain.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface EvmWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(req: { blockchain: string }): Promise<string[] | null>
  /** Answer the wallet's chain ID, hex or decimal, or `null` when it isn't ready. */
  getChainId(req: { blockchain: string }): Promise<string | null>
  /** Switch the wallet to `chainId`, first adding `{ chainId, ...chain }` when it doesn't know the chain, or reject when it can't. */
  switchChain(req: {
    blockchain: string
    chainId: string
    chain?: EvmChainDescription
  }): Promise<void>
  /** Sign and send `tx`, an approve the SDK built included, and resolve with its hash. */
  sign(req: {
    blockchain: string
    tx: TxOf<TransactionType.EVM>
  }): Promise<SignResult>
  /** Resolve with the hash to follow, or the same `hash` when you have no signer for it. */
  wait?(req: {
    blockchain: string
    hash: string
    response?: unknown
  }): Promise<{ hash: string; response?: unknown }>
  /** Answer the allowance the wallet already grants as a decimal string, or `null` for nothing. */
  getAllowance(req: {
    blockchain: string
    prerequisite: PrerequisiteOf<'EVM_APPROVE'>
  }): Promise<string | null>
  /** Answer `'pending'`, `'success'` or `'failed'` for a signed approve, from its receipt. */
  getTransactionInfo(req: {
    blockchain: string
    hash: string
  }): Promise<'pending' | 'success' | 'failed'>
}

/**
 * The Hyperliquid namespace, for Hyperliquid actions signed as EIP-712 typed data.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface HyperliquidWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Answer the wallet's chain ID, hex or decimal, or `null` when it isn't ready. */
  getChainId(): Promise<string | null>
  /** Switch the wallet to `chainId`, or reject when it can't. */
  switchChain(req: { chainId: string }): Promise<void>
  /** Sign ethers' `{ domain, types, value }` on `chainId` and resolve with the `0x` signature. */
  signTypedData(req: { typedData: unknown; chainId: string }): Promise<string>
}

/**
 * The TRON namespace.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface TronWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Sign and send `tx`, an approve `buildTransaction` built included, and resolve with its hash. */
  sign(req: { tx: TxOf<TransactionType.TRON> }): Promise<SignResult>
  /** Answer the allowance the wallet already grants as a decimal string, or `null` for nothing. */
  getAllowance(req: {
    prerequisite: PrerequisiteOf<'TRON_APPROVE'>
  }): Promise<string | null>
  /** Build the approve that meets `prerequisite` as plain data, without prompting. */
  buildTransaction(req: {
    prerequisite: PrerequisiteOf<'TRON_APPROVE'>
  }): Promise<TxOf<TransactionType.TRON>>
  /** Answer the node's transaction info for a signed approve, as it is. */
  getTransactionInfo(req: {
    hash: string
  }): Promise<{ blockNumber?: number; receipt?: { result?: string } }>
}

/**
 * The XRPL namespace.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface XrplWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Sign and send `tx`, a `TrustSet` the SDK built included, and resolve with its hash. */
  sign(req: { tx: TxOf<TransactionType.XRPL> }): Promise<SignResult>
  /** Answer the trustline's limit the wallet already holds as a decimal string, or `null` for none. */
  getTrustline(req: {
    prerequisite: PrerequisiteOf<'XRPL_CHANGE_TRUSTLINE'>
  }): Promise<string | null>
  /** Answer the ledger's transaction for a signed `TrustSet`, as it is. */
  getTransactionInfo(req: {
    hash: string
  }): Promise<{ validated: boolean; meta?: { TransactionResult: string } }>
}

/**
 * The Stellar namespace.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface StellarWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Sign and send `tx`, a trustline `buildTransaction` built included, and resolve once the network accepted it. */
  sign(req: { tx: TxOf<TransactionType.STELLAR> }): Promise<SignResult>
  /** Answer the trustline's limit the wallet already holds as a decimal string, or `null` for none. */
  getTrustline(req: {
    prerequisite: PrerequisiteOf<'STELLAR_CHANGE_TRUSTLINE'>
  }): Promise<string | null>
  /** Build a `changeTrust` with the given `limit` as plain data, without prompting. */
  buildTransaction(req: {
    prerequisite: PrerequisiteOf<'STELLAR_CHANGE_TRUSTLINE'>
    limit: string
  }): Promise<TxOf<TransactionType.STELLAR>>
}

/**
 * The BIP-122 namespace, for transfers on every UTXO blockchain.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface Bip122Wallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(req: { blockchain: string }): Promise<string[] | null>
  /** Sign and send `tx`, and resolve with its hash. */
  sign(req: {
    blockchain: string
    tx: TxOf<TransactionType.TRANSFER>
  }): Promise<SignResult>
}

/**
 * The Solana namespace.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface SolanaWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Sign and send `tx`, and resolve with its hash. */
  sign(req: { tx: TxOf<TransactionType.SOLANA> }): Promise<SignResult>
}

/**
 * The Starknet namespace.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface StarknetWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Sign and send `tx`, and resolve with its hash. */
  sign(req: { tx: TxOf<TransactionType.STARKNET> }): Promise<SignResult>
}

/**
 * The TON namespace.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface TonWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Sign and send `tx`, and resolve with its hash. */
  sign(req: { tx: TxOf<TransactionType.TON> }): Promise<SignResult>
}

/**
 * The Sui namespace.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export interface SuiWallet {
  /** Answer the addresses the chosen wallet holds, or `null` when it isn't connected, without prompting. */
  getAccounts(): Promise<string[] | null>
  /** Sign and send `tx`, and resolve with its hash. */
  sign(req: { tx: TxOf<TransactionType.SUI> }): Promise<SignResult>
}

/**
 * The user's wallets, one optional key per namespace, holding the methods the SDK calls for it.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#wallet-port
 */
export type WalletPort = {
  /** EVM transactions and approves, on every EVM blockchain. */
  evm?: EvmWallet
  /** Hyperliquid actions. */
  hyperliquid?: HyperliquidWallet
  /** TRON transactions and approves. */
  tron?: TronWallet
  /** XRPL payments and trustlines. */
  xrpl?: XrplWallet
  /** Stellar transactions and trustlines. */
  stellar?: StellarWallet
  /** Transfers on every UTXO blockchain. */
  bip122?: Bip122Wallet
  /** Solana transactions. */
  solana?: SolanaWallet
  /** Starknet transactions. */
  starknet?: StarknetWallet
  /** TON transactions. */
  ton?: TonWallet
  /** Sui transactions. */
  sui?: SuiWallet
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
 * Called before each run of an Execution with the wallet, a client-wide `setContext` that sets it and the Execution's
 * `HistoryItem`.
 *
 * @see https://github.com/rango-exchange/rango-sdk/blob/main/packages/sdk/README.md#beforeresume
 */
export type BeforeResume = (
  context: { wallet?: WalletPort },
  setContext: (next: { wallet?: WalletPort }) => void,
  item: HistoryItem,
) => void

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
  // Core's `pause()`, a no-op when the execution engine is already paused.
  pause: () => void
  // Core's `run()`, a no-op when the execution engine isn't paused.
  resume: () => void
}
