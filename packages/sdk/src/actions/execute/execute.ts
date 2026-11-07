import type { StoredQueue } from './queue/mod.js'
import type { ExecutionOptions } from './types.js'
import type { ClientState } from '../../types.js'

import { createExecution, unblockExecution } from './helpers.js'

export async function startOrUnblockExecution(
  state: ClientState,
  requestId: string,
  options?: ExecutionOptions,
): Promise<void> {
  const { manager, context } = await state.executionEngine()

  const storedQueue: StoredQueue | undefined = manager.get(requestId)
  if (storedQueue !== undefined) {
    unblockExecution(storedQueue, context)
    return
  }
  await createExecution(state, manager, context, requestId, options)
}
