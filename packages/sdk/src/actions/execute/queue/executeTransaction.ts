import type { SdkActions, TaskResult } from './types.js'

import { ErrorToReport } from './executionFailure.js'
import { gateSignAndProveMainTransaction } from './mainTransaction.js'
import { gateSignAndProvePrerequisite } from './prerequisite.js'
import { waitForHashThenPollStepStatus } from './transactionStatusPolling.js'

export async function executeTransaction(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
): Promise<TaskResult> {
  const { transactionId } = actions.payload
  const storage = actions.getStorage()

  const entry = storage.transactions[transactionId]

  if (entry.execution.status === 'completed') {
    return []
  }
  if (entry.data.type === 'prerequisite') {
    return gateSignAndProvePrerequisite(
      actions,
      transactionId,
      entry.data.value,
    )
  }
  const mainTx = entry.data.value
  // No gate on a resume.
  const { walletResult: storedWalletResult } = entry.execution.result
  const isSignedWithHash =
    entry.execution.status === 'signed' && storedWalletResult !== null
  if (isSignedWithHash) {
    return waitForHashThenPollStepStatus(actions, storedWalletResult.hash)
  }
  // Only Hyperliquid is stored `signed` without a hash, so any other is as unknown as a `sign_requested` one.
  if (entry.execution.status !== 'not_started') {
    throw new ErrorToReport(
      'TX_EXPIRED',
      'Transaction is expired. Please try again.',
    )
  }
  return gateSignAndProveMainTransaction(actions, mainTx)
}
