import type { BlockReason, StepEvent } from '../mod.js'
import type { APIErrorCode, TransactionPrerequisiteType } from 'rango-types'

import { SignerErrorCode, TransactionType } from 'rango-types'

export const QUEUE_NAME = 'sdk-swap'

export const HEX = 16

export const POLL_INTERVAL_MS = 5_000

export const ALLOWANCE_CONSECUTIVE_SUFFICIENT_READS = 2

export const ALLOWANCE_READ_INTERVAL_MS = 3_000

export const ALLOWANCE_TIMEOUT_MS = 30_000

// The trustline limit the SDK sets, and a trustline's need in the met test, per blockchain.
export const TRUSTLINE_LIMIT_BY_BLOCKCHAIN: Readonly<{
  XRPL: string
  STELLAR: string
}> = {
  XRPL: '10000000000000',
  STELLAR: '922337203685.4775807',
}

export const BLOCKED_EVENT_STATUS_BY_BLOCK_REASON: Readonly<
  Record<
    BlockReason['reason'],
    Extract<StepEvent, { type: 'tx_execution_blocked' }>['status']
  >
> = {
  NOT_CONNECTED: 'waiting_for_wallet_connect',
  ACCOUNT_MISMATCH: 'waiting_for_change_wallet_account',
  NETWORK_MISMATCH: 'waiting_for_network_change',
}

export const REASON_CODE_BY_SIGNER_ERROR_CODE: Readonly<
  Record<SignerErrorCode, APIErrorCode>
> = {
  [SignerErrorCode.REJECTED_BY_USER]: 'USER_REJECT',
  [SignerErrorCode.SIGN_TX_ERROR]: 'CALL_WALLET_FAILED',
  [SignerErrorCode.SEND_TX_ERROR]: 'SEND_TX_FAILED',
  [SignerErrorCode.TX_FAILED_IN_BLOCKCHAIN]: 'TX_FAILED_IN_BLOCKCHAIN',
  [SignerErrorCode.NOT_IMPLEMENTED]: 'CLIENT_UNEXPECTED_BEHAVIOUR',
  [SignerErrorCode.OPERATION_UNSUPPORTED]: 'CLIENT_UNEXPECTED_BEHAVIOUR',
  [SignerErrorCode.UNEXPECTED_BEHAVIOUR]: 'CLIENT_UNEXPECTED_BEHAVIOUR',
}

export const PREREQUISITE_READ_FAILURE_MESSAGE_BY_TYPE: Readonly<
  Record<TransactionPrerequisiteType, string>
> = {
  EVM_APPROVE: 'Could not read the current allowance from the node.',
  TRON_APPROVE: 'Could not read the current allowance from the node.',
  XRPL_CHANGE_TRUSTLINE: 'Could not get account lines from XRPL.',
  STELLAR_CHANGE_TRUSTLINE: 'Could not get account lines from Stellar.',
}

// A Prerequisite type that isn't a key is refused.
export const TX_TYPE_BY_PREREQUISITE_TYPE = {
  EVM_APPROVE: TransactionType.EVM,
  TRON_APPROVE: TransactionType.TRON,
  XRPL_CHANGE_TRUSTLINE: TransactionType.XRPL,
  STELLAR_CHANGE_TRUSTLINE: TransactionType.STELLAR,
} satisfies Readonly<Record<TransactionPrerequisiteType, TransactionType>>

export const SUPPORTED_HYPERLIQUID_ACTION_TYPES: ReadonlySet<string> = new Set([
  'withdraw3',
  'usdSend',
])

export const HYPERLIQUID_EXCHANGE_URL = 'https://api.hyperliquid.xyz/exchange'

export const HYPERLIQUID_EXPLORER_URL = 'https://rpc.hyperliquid.xyz/explorer'
