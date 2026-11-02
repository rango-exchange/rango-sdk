import type { FailedCheck, SdkActions, SdkContext } from './types.js'
import type { LegacyClient } from '../../../types.js'
import type { ExecutionFailure, ExecutionRecord } from '../mod.js'
import type { APIErrorCode } from 'rango-types'

import { SignerError } from 'rango-types'

import { REASON_CODE_BY_SIGNER_ERROR_CODE } from './constants.js'
import { getCurrentStepWalletIdForReport } from './requiredWallet.js'

export class ErrorToReport extends Error {
  override readonly name = 'ErrorToReport'
  readonly reasonCode: APIErrorCode
  readonly detail: string | null
  readonly failedCheck: FailedCheck | null

  constructor(
    reasonCode: APIErrorCode,
    message: string,
    detail: string | null = null,
    failedCheck: FailedCheck | null = null,
  ) {
    super(message)
    this.reasonCode = reasonCode
    this.detail = detail
    this.failedCheck = failedCheck
  }
}

export function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  try {
    return String(error)
  } catch {
    return 'Unexpected Error'
  }
}

function convertErrorToExecutionFailure(error: unknown): ExecutionFailure {
  if (error instanceof ErrorToReport) {
    return {
      reasonCode: error.reasonCode,
      message: error.message,
      detail: error.detail,
    }
  }
  if (SignerError.isSignerError(error)) {
    const reasonCode = REASON_CODE_BY_SIGNER_ERROR_CODE[error.code]
    try {
      const { message, detail } = error.getErrorDetail()
      return { reasonCode, message, detail: detail ?? null }
    } catch {
      // `getErrorDetail` throws on a root it can't stringify.
      return { reasonCode, message: getErrorMessage(error), detail: null }
    }
  }
  return {
    reasonCode: 'CLIENT_UNEXPECTED_BEHAVIOUR',
    message: getErrorMessage(error),
    detail: null,
  }
}

function getFailureReportReason(
  error: unknown,
  failure: ExecutionFailure,
): string {
  if (
    failure.reasonCode !== 'USER_REJECT' &&
    typeof error === 'object' &&
    error !== null &&
    'cause' in error
  ) {
    const { cause } = error
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'message' in cause &&
      typeof cause.message === 'string'
    ) {
      return cause.message
    }
  }
  return failure.detail || ''
}

// Not awaited: a failed report changes nothing.
function reportFailureToRango(
  httpClient: LegacyClient,
  storage: ExecutionRecord,
  failure: ExecutionFailure,
  reason: string = failure.detail || '',
): void {
  const walletId = getCurrentStepWalletIdForReport(storage)
  httpClient
    .reportFailure({
      requestId: storage.data.requestId,
      step: storage.finishedSwapSteps + 1,
      eventType: failure.reasonCode,
      reason,
      tags: walletId ? { wallet: walletId } : undefined,
    })
    .catch(() => undefined)
}

// One write. The failing entry keeps its status.
export function storeExecutionFailure(
  storageAccess: SdkActions,
  failure: ExecutionFailure,
  failedCheck: FailedCheck | null = null,
): void {
  const storage = storageAccess.getStorage()
  storage.failure = failure
  storage.finishedAt = Date.now()
  const failedTransactionEntry =
    failedCheck === null
      ? undefined
      : storage.transactions[failedCheck.transactionId]
  if (failedCheck !== null && failedTransactionEntry !== undefined) {
    failedTransactionEntry.execution.result.checkResult =
      failedCheck.checkResult
  }
  storageAccess.setStorage(storage)
}

// No report for `TX_FAIL`: the server already knows.
export function reportAndEmitExecutionFailure(
  context: Pick<SdkContext, 'httpClient' | 'emit'>,
  storage: ExecutionRecord,
  failure: ExecutionFailure,
  transactionId: string | null,
  reason: string | null = failure.detail || '',
): void {
  const { httpClient, emit } = context
  const { requestId } = storage.data
  const step = storage.finishedSwapSteps + 1
  if (reason !== null && failure.reasonCode !== 'TX_FAIL') {
    reportFailureToRango(httpClient, storage, failure, reason)
  }
  emit.stepEvent(requestId, step, transactionId, { type: 'failed' })
  emit.routeEvent(requestId, { type: 'failed' })
}

// The write comes first, so the `FAILED` queue's `HistoryItem` already shows the failure. Nothing here is caught.
export function failExecution(
  actions: SdkActions,
  error: unknown,
  transactionId: string | null,
): void {
  const failure = convertErrorToExecutionFailure(error)
  // Rango is told only of an `ErrorToReport` or a `SignerError`; any other is stored and announced.
  const shouldReportToRango =
    error instanceof ErrorToReport || SignerError.isSignerError(error)
  storeExecutionFailure(
    actions,
    failure,
    error instanceof ErrorToReport ? error.failedCheck : null,
  )
  actions.failed()
  reportAndEmitExecutionFailure(
    actions.context,
    actions.getStorage(),
    failure,
    transactionId,
    shouldReportToRango ? getFailureReportReason(error, failure) : null,
  )
}
