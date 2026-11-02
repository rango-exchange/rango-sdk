import type { SdkContext, StoredQueue } from './queue/mod.js'
import type {
  ExecutionEngine,
  ExecutionOptions,
  ExecutionRecord,
} from './types.js'
import type { ClientState } from '../../types.js'
import type { ConfirmResult } from '../confirm/mod.js'

import { SdkError, throwSdkError } from '../../errors/mod.js'

import { QUEUE_NAME } from './queue/mod.js'

// Cloned, so a later change to the route or the options never reaches the stored record.
export function buildInitialExecutionRecord(
  confirmedRoute: ConfirmResult,
  options: ExecutionOptions,
): ExecutionRecord {
  const storedOptions = structuredClone(options)
  storedOptions.swapMode ??= 'swap'
  return {
    data: structuredClone(confirmedRoute.data),
    options: storedOptions,
    transactions: {},
    finishedSwapSteps: 0,
    failure: null,
    finishedAt: null,
  }
}

// Unblocking only reruns the gate, and core's queue update for it emits `changed`.
export function unblockExecution(
  storedQueue: StoredQueue,
  context: SdkContext,
): void {
  if (storedQueue.status === 'BLOCKED' && !context.isPaused()) {
    try {
      storedQueue.list.unblock()
    } catch (cause: unknown) {
      throwSdkError(cause)
    }
  }
}

export async function createExecution(
  state: ClientState,
  executionEngine: ExecutionEngine,
  requestId: string,
  options: ExecutionOptions,
): Promise<void> {
  const { manager } = executionEngine
  const confirmedRoute = state.cache.get('confirmed')?.get(requestId)
  if (confirmedRoute === undefined) {
    throw new SdkError(
      'INVALID_INPUT',
      'No confirmed route or stored execution has this `requestId`.',
      { metadata: { field: 'requestId', reason: 'NOT_FOUND' } },
    )
  }

  // No `await` between the existing-record check and `create`, so a parallel call finds the record.
  await manager
    .create(QUEUE_NAME, buildInitialExecutionRecord(confirmedRoute, options), {
      id: requestId,
    })
    .catch((cause: unknown) => throwSdkError(cause))

  // A new map, so a slot the app read earlier keeps the entry.
  const confirmedWithoutThisRequest = new Map(state.cache.get('confirmed'))
  confirmedWithoutThisRequest.delete(requestId)
  state.cache.set('confirmed', confirmedWithoutThisRequest)
}
