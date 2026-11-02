import type { ClientState } from '../../types.js'

import { throwSdkError } from '../../errors/mod.js'

// Core's `run()`. The SDK adds no lock beyond the host's tab election.
export async function resumeExecutions(state: ClientState): Promise<void> {
  const executionEngine = await state.executionEngine()
  try {
    executionEngine.resume()
  } catch (cause: unknown) {
    throwSdkError(cause)
  }
}
