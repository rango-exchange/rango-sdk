import type { ClientState } from '../../types.js'
import type { StoredQueue } from '../execute/mod.js'

import { ENDED_QUEUE_STATUSES } from '../execute/mod.js'

export async function deleteExecution(
  state: ClientState,
  requestId: string,
): Promise<void> {
  const { manager } = await state.executionEngine()
  const stored: StoredQueue | undefined = manager.get(requestId)
  if (stored !== undefined && ENDED_QUEUE_STATUSES.has(stored.status)) {
    manager.deleteQueue(requestId)
  }
}
