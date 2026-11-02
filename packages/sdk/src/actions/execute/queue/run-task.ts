import type {
  ActionName,
  SdkActions,
  SdkPayloads,
  TaskResult,
} from './types.js'

import { BLOCKED_EVENT_STATUS_BY_BLOCK_REASON } from './constants.js'
import { failExecution, isCanceled } from './execution-failure.js'

// The only caller of `schedule`, `next`, `block` and `failed`. No task calls `retry()`.
export async function runTask<K extends ActionName>(
  actions: SdkActions<K>,
  task: (actions: SdkActions<K>) => Promise<TaskResult>,
): Promise<void> {
  const taskPayload: SdkPayloads[ActionName] = actions.payload
  const transactionId =
    taskPayload && 'transactionId' in taskPayload
      ? taskPayload.transactionId
      : null

  // Core still runs the next task while paused, so this one stays `RUNNING` for a reload or `resume()` to resume.
  if (actions.context.isPaused()) {
    return
  }

  let taskResult: TaskResult
  try {
    taskResult = await task(actions)
  } catch (error) {
    if (!isCanceled(actions)) {
      failExecution(actions, error, transactionId)
    }
    return
  }

  if (isCanceled(actions)) {
    return
  }
  // Core stores the reason and sets `BLOCKED`; `execute()` unblocks.
  if (!Array.isArray(taskResult)) {
    actions.block(taskResult.block)
    const storage = actions.getStorage()
    actions.context.emit.stepEvent(
      storage.data.requestId,
      storage.finishedSwapSteps + 1,
      transactionId,
      {
        type: 'tx_execution_blocked',
        status: BLOCKED_EVENT_STATUS_BY_BLOCK_REASON[taskResult.block.reason],
      },
    )
    return
  }

  /*
   * Replayed after a reload, the task that stored `finishedAt` still ends the queue `SUCCESS` here, so the end is
   * never missed.
   */
  for (const [name, nextTaskPayload] of taskResult) {
    actions.schedule(name, nextTaskPayload)
  }
  actions.next()
  const { requestId } = actions.getStorage().data
  if (actions.context.getQueueStatus(requestId) === 'SUCCESS') {
    actions.context.emit.routeEvent(requestId, { type: 'succeeded' })
  }
}
