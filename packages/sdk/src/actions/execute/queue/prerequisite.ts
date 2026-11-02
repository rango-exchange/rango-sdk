import type { SdkActions, TaskResult } from './types.js'
import type { EvmWallet, TronWallet, XrplWallet } from '../mod.js'
import type {
  EvmApprovePrerequisite,
  TransactionPrerequisite,
  TronApprovePrerequisite,
} from 'rango-types'

import BigNumber from 'bignumber.js'

import {
  ALLOWANCE_CONSECUTIVE_SUFFICIENT_READS,
  ALLOWANCE_READ_INTERVAL_MS,
  ALLOWANCE_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  TRUSTLINE_LIMIT_BY_BLOCKCHAIN,
} from './constants.js'
import { ErrorToReport } from './execution-failure.js'
import { sleep } from './utils.js'

type OnChainTxStatus = 'pending' | 'success' | 'failed'

export function getRequiredGrantAmount(
  prerequisite: TransactionPrerequisite,
): string {
  switch (prerequisite.type) {
    case 'XRPL_CHANGE_TRUSTLINE':
      return TRUSTLINE_LIMIT_BY_BLOCKCHAIN.XRPL
    case 'STELLAR_CHANGE_TRUSTLINE':
      return TRUSTLINE_LIMIT_BY_BLOCKCHAIN.STELLAR
    case 'EVM_APPROVE':
    case 'TRON_APPROVE':
      return prerequisite.amount
  }
}

export function isGrantedAmountEnough(
  granted: string | null,
  required: string,
): boolean {
  return granted !== null && new BigNumber(granted).gte(required)
}

function getTronTxStatus(info: {
  blockNumber?: number
  receipt?: { result?: string }
}): OnChainTxStatus {
  if (info.blockNumber === undefined) {
    return 'pending'
  }
  const result = info.receipt?.result
  return result === undefined || result === 'SUCCESS' ? 'success' : 'failed'
}

function getXrplTxStatus(info: {
  validated: boolean
  meta?: { TransactionResult: string }
}): OnChainTxStatus {
  if (!info.validated) {
    return 'pending'
  }
  return info.meta?.TransactionResult === 'tesSUCCESS' ? 'success' : 'failed'
}

// A failed read or build is reported.
export async function tryRunPrerequisiteReadOrBuild<T>(
  readOrBuild: () => Promise<T>,
  failureMessage: string,
): Promise<T> {
  try {
    return await readOrBuild()
  } catch {
    throw new ErrorToReport('CLIENT_UNEXPECTED_BEHAVIOUR', failureMessage, null)
  }
}

// The timeout is wall-clock time from the first read, the time the reads take included.
async function tryWaitUntilAllowanceConfirmed(
  readGrantedAllowance: () => Promise<string | null>,
  requiredAmount: string,
): Promise<boolean> {
  const allowanceDeadlineMs = Date.now() + ALLOWANCE_TIMEOUT_MS
  let consecutiveSufficientReads = 0
  while (true) {
    let grantedAmount: string | null
    try {
      grantedAmount = await readGrantedAllowance()
    } catch {
      grantedAmount = null
    }
    consecutiveSufficientReads = isGrantedAmountEnough(
      grantedAmount,
      requiredAmount,
    )
      ? consecutiveSufficientReads + 1
      : 0
    if (consecutiveSufficientReads >= ALLOWANCE_CONSECUTIVE_SUFFICIENT_READS) {
      return true
    }
    if (Date.now() >= allowanceDeadlineMs) {
      throw new ErrorToReport(
        'INSUFFICIENT_APPROVE',
        'Insufficient approve, please try again.',
      )
    }
    await sleep(ALLOWANCE_READ_INTERVAL_MS)
  }
}

// A Prerequisite's on-chain proof.
async function tryWaitUntilProvedOnChain(
  readOnChainStatus: (hash: string) => Promise<OnChainTxStatus>,
  hash: string,
): Promise<boolean> {
  while (true) {
    const onChainStatus = await readOnChainStatus(hash).catch(
      (): 'pending' => 'pending',
    )
    if (onChainStatus === 'failed') {
      throw new ErrorToReport(
        'CLIENT_UNEXPECTED_BEHAVIOUR',
        'Prerequisite transaction failed on chain.',
      )
    }
    if (onChainStatus === 'success') {
      return true
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

/*
 * An approve emits `approval_tx_succeeded`. A Stellar trustline needs no proof: its `sign`
 * resolves only once the network accepted it.
 */
export function storeEntryCompletedAndEmitApprovalSucceeded(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  shouldEmitApprovalSucceeded: boolean,
): TaskResult {
  const storage = actions.getStorage()
  const entry = storage.transactions[transactionId]
  entry.execution.status = 'completed'
  actions.setStorage(storage)
  if (shouldEmitApprovalSucceeded) {
    actions.context.emit.stepEvent(
      storage.data.requestId,
      entry.step,
      transactionId,
      { type: 'approval_tx_succeeded' },
    )
  }
  return []
}

export async function proveEvmApproveOnChain(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  evm: EvmWallet,
  transactionId: string,
  prerequisite: EvmApprovePrerequisite,
  hash: string,
): Promise<TaskResult> {
  const { blockChain: blockchain } = prerequisite
  const readOnChainStatus = async (
    signedHash: string,
  ): Promise<OnChainTxStatus> =>
    evm.getTransactionInfo({ blockchain, hash: signedHash })
  if (!(await tryWaitUntilProvedOnChain(readOnChainStatus, hash))) {
    return []
  }
  const readGrantedAllowance = async () =>
    evm.getAllowance({ blockchain, prerequisite })
  if (
    !(await tryWaitUntilAllowanceConfirmed(
      readGrantedAllowance,
      prerequisite.amount,
    ))
  ) {
    return []
  }
  return storeEntryCompletedAndEmitApprovalSucceeded(
    actions,
    transactionId,
    true,
  )
}

export async function proveTronApproveOnChain(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  tron: TronWallet,
  transactionId: string,
  prerequisite: TronApprovePrerequisite,
  hash: string,
): Promise<TaskResult> {
  const readOnChainStatus = async (
    signedHash: string,
  ): Promise<OnChainTxStatus> =>
    getTronTxStatus(await tron.getTransactionInfo({ hash: signedHash }))
  if (!(await tryWaitUntilProvedOnChain(readOnChainStatus, hash))) {
    return []
  }
  const readGrantedAllowance = async () => tron.getAllowance({ prerequisite })
  if (
    !(await tryWaitUntilAllowanceConfirmed(
      readGrantedAllowance,
      prerequisite.amount,
    ))
  ) {
    return []
  }
  return storeEntryCompletedAndEmitApprovalSucceeded(
    actions,
    transactionId,
    true,
  )
}

export async function proveXrplTrustlineOnChain(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  xrpl: XrplWallet,
  transactionId: string,
  hash: string,
): Promise<TaskResult> {
  const readOnChainStatus = async (
    signedHash: string,
  ): Promise<OnChainTxStatus> =>
    getXrplTxStatus(await xrpl.getTransactionInfo({ hash: signedHash }))
  if (!(await tryWaitUntilProvedOnChain(readOnChainStatus, hash))) {
    return []
  }
  return storeEntryCompletedAndEmitApprovalSucceeded(
    actions,
    transactionId,
    false,
  )
}
