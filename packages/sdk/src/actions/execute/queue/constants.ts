import type { BlockReason, StepEvent } from '../mod.js'
import type { APIErrorCode, TransactionPrerequisiteType } from 'rango-types'

import { SignerErrorCode, TransactionType } from 'rango-types'

export const QUEUE_NAME = 'sdk-swap'

export const POLL_INTERVAL_MS = 5_000

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
