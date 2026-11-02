import type { StoredQueue } from './queue/mod.js'
import type { ExecutionOptions } from './types.js'
import type { ClientState } from '../../types.js'

import { SdkError } from '../../errors/mod.js'

import { createExecution, unblockExecution } from './helpers.js'

export async function startOrUnblockExecution(
  state: ClientState,
  requestId: string,
  options?: ExecutionOptions,
): Promise<void> {
  const executionEngine = await state.executionEngine()

  const storedQueue: StoredQueue | undefined =
    executionEngine.manager.get(requestId)
  if (storedQueue !== undefined) {
    unblockExecution(storedQueue, executionEngine.context)
    return
  }
  if (options === undefined) {
    throw new SdkError('INVALID_INPUT', 'A new execution needs `options`.', {
      metadata: { field: 'options', reason: 'MISSING' },
    })
  }
  await createExecution(state, executionEngine, requestId, options)
}
