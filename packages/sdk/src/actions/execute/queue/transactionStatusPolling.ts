import type { CheckResult, SdkActions, TaskResult } from './types.js'
import type { TransactionStatusResponse } from 'rango-sdk'

import { TransactionStatus, TransactionType } from 'rango-types'

import { loadBlockchainMetaOf } from './blockchainMeta.js'
import { POLL_INTERVAL_MS } from './constants.js'
import { ErrorToReport, isCanceledOrPaused } from './executionFailure.js'
import { replaceLastExplorerLinkWithReplacedHash } from './explorerLink.js'
import { getRequiredWallet, getWalletOnBlockchain } from './requiredWallet.js'
import { sleep } from './utils.js'

function mergeStatusAnswerIntoCheckResult(
  storedCheckResult: CheckResult | null,
  statusAnswer: TransactionStatusResponse,
): CheckResult {
  return {
    outputAmount:
      statusAnswer.outputAmount || storedCheckResult?.outputAmount || null,
    explorerUrl: statusAnswer.explorerUrl
      ? statusAnswer.explorerUrl.map(({ url, description }) => ({
          url,
          description: description ?? null,
        }))
      : (storedCheckResult?.explorerUrl ?? []),
    diagnosisUrl:
      statusAnswer.diagnosisUrl || storedCheckResult?.diagnosisUrl || null,
  }
}

async function tryPollStepStatusUntilFinished(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  step: number,
  hash: string,
): Promise<TaskResult> {
  const { httpClient, emit } = actions.context
  const { requestId } = actions.getStorage().data
  while (true) {
    const statusAnswer = await httpClient
      .checkStatus({ requestId, step, txId: hash })
      .then((statusAnswer) => statusAnswer || null)
      .catch(() => null)
    if (isCanceledOrPaused(actions)) {
      return []
    }
    if (statusAnswer !== null) {
      const storage = actions.getStorage()
      const entry = storage.transactions[transactionId]
      const storedCheckResult = entry.execution.result.checkResult
      const checkResult = mergeStatusAnswerIntoCheckResult(
        storedCheckResult,
        statusAnswer,
      )
      const failedCheck = { transactionId, checkResult }

      // The server knows, so `failExecution` doesn't report it.
      if (statusAnswer.status === TransactionStatus.FAILED) {
        throw new ErrorToReport(
          'TX_FAIL',
          'Transaction failed in blockchain',
          statusAnswer.extraMessage || null,
          failedCheck,
        )
      }
      // Whatever the status, the SDK never signs a transaction it didn't fetch. A plain `Error`, so not reported.
      if (statusAnswer.newTx) {
        throw new Error('Unexpected Error: newTx is not supported.')
      }

      const isOutputAmountNewlyRevealed =
        (storedCheckResult?.outputAmount ?? null) === null &&
        checkResult.outputAmount !== null
      // `check_status` only while no output amount is stored.
      const progressEventType = isOutputAmountNewlyRevealed
        ? 'output_revealed'
        : checkResult.outputAmount === null
          ? 'check_status'
          : null

      if (statusAnswer.status === TransactionStatus.SUCCESS) {
        entry.execution.result.checkResult = checkResult
        entry.execution.status = 'completed'
        actions.setStorage(storage)
        if (progressEventType !== null) {
          emit.stepEvent(requestId, step, transactionId, {
            type: progressEventType,
          })
        }
        emit.stepEvent(requestId, step, transactionId, { type: 'succeeded' })
        return [['SDK_STEP_FINISHED', { step }]]
      }

      if (JSON.stringify(storedCheckResult) !== JSON.stringify(checkResult)) {
        entry.execution.result.checkResult = checkResult
        actions.setStorage(storage)
      }
      if (progressEventType !== null) {
        emit.stepEvent(requestId, step, transactionId, {
          type: progressEventType,
        })
      }
    }
    await sleep(POLL_INTERVAL_MS, actions.context.runController.signal)
    if (isCanceledOrPaused(actions)) {
      return []
    }
  }
}

/*
 * The Blockchain list is read only to replace a stored link, before the write. A rejected `wait` still tells the
 * server the hash, with one status call that isn't awaited. `null` once the Execution is canceled.
 */
async function waitForFinalEvmHash(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  hash: string,
): Promise<string | null> {
  const { wallet, httpClient, signResponsesAwaitingWait } = actions.context
  const { transactionId } = actions.payload
  const storage = actions.getStorage()
  const { requestId } = storage.data
  const signResponseKey = `${requestId}/${transactionId}`
  const { data: entryTx } = storage.transactions[transactionId]
  if (entryTx.type !== 'tx' || entryTx.value.type !== TransactionType.EVM) {
    return hash
  }
  const requiredWallet = getRequiredWallet(storage, entryTx.value)
  const evm = getWalletOnBlockchain(wallet?.evm, requiredWallet.blockchain)
  if (evm?.wait === undefined) {
    return hash
  }
  const signResponse = signResponsesAwaitingWait.get(signResponseKey)
  signResponsesAwaitingWait.delete(signResponseKey)
  let waitResult: { hash: string }
  try {
    waitResult = await evm.wait({ hash, response: signResponse })
  } catch (error) {
    if (!isCanceledOrPaused(actions)) {
      const { step } = actions.getStorage().transactions[transactionId]
      httpClient
        .checkStatus({ requestId, step, txId: hash })
        .catch(() => undefined)
    }
    throw error
  }
  if (isCanceledOrPaused(actions)) {
    return null
  }
  if (waitResult.hash !== hash) {
    const hasStoredExplorerLink =
      (actions.getStorage().transactions[transactionId].execution.result
        .checkResult?.explorerUrl.length ?? 0) > 0
    const blockchainMeta = hasStoredExplorerLink
      ? await loadBlockchainMetaOf(actions, requiredWallet.blockchain)
      : null
    if (isCanceledOrPaused(actions)) {
      return null
    }
    const freshStorage = actions.getStorage()
    const { result } = freshStorage.transactions[transactionId].execution
    result.walletResult = { hash: waitResult.hash }
    if (blockchainMeta !== null && result.checkResult !== null) {
      result.checkResult = replaceLastExplorerLinkWithReplacedHash(
        result.checkResult,
        blockchainMeta,
        waitResult.hash,
      )
    }
    actions.setStorage(freshStorage)
  }
  return waitResult.hash
}

export async function waitForHashThenPollStepStatus(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  hash: string,
): Promise<TaskResult> {
  const { transactionId } = actions.payload
  const { step } = actions.getStorage().transactions[transactionId]
  const finalHash = await waitForFinalEvmHash(actions, hash)
  return finalHash === null
    ? []
    : tryPollStepStatusUntilFinished(actions, transactionId, step, finalHash)
}
