import type { ClientState } from '../../types.js'
import type { ExecutionFailure, StoredQueue } from '../execute/mod.js'

import {
  ENDED_QUEUE_STATUSES,
  reportAndEmitExecutionFailure,
  storeExecutionFailure,
} from '../execute/mod.js'

import { CANCELED } from './constants.js'

/*
 * Any Execution that hasn't ended is canceled, by the `ENDED_QUEUE_STATUSES` set both `delete()` and `cancel()` use.
 * Core's `cancel()` stops the queue, then one write stores `USER_CANCEL`, so the running task stops at its next cancel
 * check. Step `failed` carries `transactionId: null`. No `await` after core's `cancel()`.
 */
export async function cancelExecution(
  state: ClientState,
  requestId: string,
): Promise<void> {
  const { manager, context } = await state.executionEngine()
  const stored: StoredQueue | undefined = manager.get(requestId)
  if (stored === undefined || ENDED_QUEUE_STATUSES.has(stored.status)) {
    return
  }
  const failure: ExecutionFailure = {
    reasonCode: 'USER_CANCEL',
    message: CANCELED,
    detail: null,
  }
  stored.actions.cancel()
  storeExecutionFailure(stored.actions, failure)
  reportAndEmitExecutionFailure(
    context,
    stored.actions.getStorage(),
    failure,
    null,
    CANCELED,
  )
}
