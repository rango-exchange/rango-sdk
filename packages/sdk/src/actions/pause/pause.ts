import type { ClientState } from '../../types.js'

import { throwSdkError } from '../../errors/mod.js'

// Core's `pause()`. The SDK adds no lock beyond the host's tab election.
export async function pauseExecutions(state: ClientState): Promise<void> {
  const executionEngine = await state.executionEngine()
  try {
    executionEngine.pause()
  } catch (cause: unknown) {
    throwSdkError(cause)
  }
}
