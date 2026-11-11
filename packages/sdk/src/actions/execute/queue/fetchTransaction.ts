import type {
  ExecuteTransactionPayload,
  SdkActions,
  TaskResult,
} from './types.js'
import type { ExecutionTransaction } from '../mod.js'
import type { Transaction } from 'rango-sdk'

import { TransactionType } from 'rango-types'

import { getResponseErrorMessage } from '../../../errors/mod.js'

import {
  SUPPORTED_HYPERLIQUID_ACTION_TYPES,
  TX_TYPE_BY_PREREQUISITE_TYPE,
} from './constants.js'
import { ErrorToReport, isCanceledOrPaused } from './executionFailure.js'

const CREATE_TX_FAILED_MESSAGE = 'Create transaction failed in Rango Server'
const KNOWN_TRANSACTION_TYPES: ReadonlySet<string> = new Set(
  Object.values(TransactionType),
)

function buildNotStartedTransactionEntry(
  data: ExecutionTransaction['data'],
  step: number,
): ExecutionTransaction {
  return {
    data,
    step,
    execution: {
      status: 'not_started',
      result: { walletResult: null, checkResult: null },
    },
  }
}

// Before anything is written. The first failing check wins.
function throwIfTransactionIsUnsupported(tx: Transaction): void {
  // The type is the server's: read at run time, since a new chain may not be a `TransactionType` yet.
  if (tx.type === TransactionType.COSMOS) {
    throw new ErrorToReport(
      'FETCH_TX_FAILED',
      'Cosmos transactions are no longer supported.',
    )
  }
  if (!KNOWN_TRANSACTION_TYPES.has(tx.type)) {
    throw new ErrorToReport('FETCH_TX_FAILED', `${tx.type} was unhandled!`)
  }
  if ('isApprovalTx' in tx && tx.isApprovalTx === true) {
    throw new ErrorToReport(
      'CLIENT_UNEXPECTED_BEHAVIOUR',
      'Unexpected Error: Legacy approval transactions are not supported.',
    )
  }
  if (
    tx.type === TransactionType.XRPL &&
    tx.data.TransactionType !== 'Payment'
  ) {
    throw new ErrorToReport(
      'CLIENT_UNEXPECTED_BEHAVIOUR',
      'Unexpected Error: Only XRPL transactions with payment type are supported',
    )
  }
  if (tx.type === TransactionType.HYPERLIQUID) {
    if (!SUPPORTED_HYPERLIQUID_ACTION_TYPES.has(tx.action.type)) {
      throw new ErrorToReport(
        'CLIENT_UNEXPECTED_BEHAVIOUR',
        'Unexpected Error: Transaction action is not supported.',
      )
    }
    if (!tx.message) {
      throw new ErrorToReport(
        'CLIENT_UNEXPECTED_BEHAVIOUR',
        'Unexpected Error: Transaction message does not exist.',
      )
    }
  }
  for (const prerequisite of tx.prerequisites) {
    if (!Object.hasOwn(TX_TYPE_BY_PREREQUISITE_TYPE, prerequisite.type)) {
      throw new ErrorToReport(
        'CLIENT_UNEXPECTED_BEHAVIOUR',
        'Unexpected Error: unknown prerequisite type!',
      )
    }
  }
}

export async function fetchTransaction(
  actions: SdkActions<'SDK_FETCH_TRANSACTION'>,
): Promise<TaskResult> {
  const { httpClient, emit } = actions.context
  const storage = actions.getStorage()
  const { requestId } = storage.data

  const step = storage.finishedSwapSteps + 1
  const mainEntryId = `s${step}`

  // Already stored: its execute tasks are queued behind this one.
  if (storage.transactions[mainEntryId] !== undefined) {
    return []
  }

  if (step === 1) {
    emit.routeEvent(requestId, { type: 'started' })
  }
  emit.stepEvent(requestId, step, null, { type: 'started' })
  emit.stepEvent(requestId, step, null, {
    type: 'tx_execution',
    status: 'create_tx',
  })
  const { slippage, infiniteApprove, validations } =
    storage.options.transactionOptions
  const createTransactionResponse = await httpClient
    .createTransaction({
      requestId,
      step,
      userSettings: { slippage, infiniteApprove },
      validations: { ...validations, approve: false },
    })
    .catch((error: unknown) => {
      throw new ErrorToReport(
        'FETCH_TX_FAILED',
        getResponseErrorMessage(error) ?? CREATE_TX_FAILED_MESSAGE,
      )
    })
  if (isCanceledOrPaused(actions)) {
    return []
  }
  const tx = createTransactionResponse.transaction
  if (!createTransactionResponse.ok || !tx) {
    throw new ErrorToReport(
      'FETCH_TX_FAILED',
      CREATE_TX_FAILED_MESSAGE,
      createTransactionResponse.error || 'bad response from create tx endpoint',
    )
  }

  throwIfTransactionIsUnsupported(tx)

  // One write, synchronous through `runTask()`'s `schedule` calls, so the entries and their tasks persist together.
  const freshStorage = actions.getStorage()
  const prerequisiteEntryIds = tx.prerequisites.map((prerequisite, index) => {
    const id = `${mainEntryId}.p${index}`
    freshStorage.transactions[id] = buildNotStartedTransactionEntry(
      { type: 'prerequisite', value: prerequisite },
      step,
    )
    return id
  })
  freshStorage.transactions[mainEntryId] = buildNotStartedTransactionEntry(
    { type: 'tx', value: tx },
    step,
  )
  actions.setStorage(freshStorage)

  return [...prerequisiteEntryIds, mainEntryId].map(
    (transactionId): ['SDK_EXECUTE_TRANSACTION', ExecuteTransactionPayload] => [
      'SDK_EXECUTE_TRANSACTION',
      { transactionId },
    ],
  )
}
