import type { ClientState } from '../../types.js'
import type { HistoryItem } from '../execute/mod.js'

// `history.get()`.
export async function getExecution(
  state: ClientState,
  requestId: string,
): Promise<HistoryItem | undefined> {
  const { context } = await state.executionEngine()
  return context.view(requestId)
}

// `history.getAll()`.
export async function getAllExecutions(
  state: ClientState,
): Promise<HistoryItem[]> {
  const { manager, context } = await state.executionEngine()
  return [...manager.getAll().keys()].flatMap((requestId) => {
    const item = context.view(requestId)
    return item === undefined ? [] : [item]
  })
}
