import type { SdkActions, TaskResult } from './types.js'

// One synchronous block.
export async function stepFinished(
  actions: SdkActions<'SDK_STEP_FINISHED'>,
): Promise<TaskResult> {
  const { step } = actions.payload
  const storage = actions.getStorage()

  // Already counted: a second run.
  if (storage.finishedSwapSteps >= step) {
    return []
  }

  storage.finishedSwapSteps += 1

  // The last step only stores `finishedAt`; `runTask()` emits `routeEvent` `succeeded` once `next()` set `SUCCESS`.
  const stepCount = storage.data.result.swaps.length
  if (storage.finishedSwapSteps < stepCount) {
    actions.setStorage(storage)
    return [['SDK_FETCH_TRANSACTION']]
  }
  storage.finishedAt = Date.now()
  actions.setStorage(storage)
  return []
}
