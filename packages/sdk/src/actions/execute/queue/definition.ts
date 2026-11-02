import type { ActionName, SdkContext, SdkPayloads } from './types.js'
import type { ExecutionRecord } from '../mod.js'
import type { QueueDef } from '@rango-dev/queue-manager-core'

import { QUEUE_NAME } from './constants.js'
import { executeTransaction } from './execute-transaction.js'
import { fetchTransaction } from './fetch-transaction.js'
import { runTask } from './run-task.js'
import { stepFinished } from './step-finished.js'

export const queueDefinition: QueueDef<
  ExecutionRecord,
  ActionName,
  SdkContext,
  SdkPayloads
> = {
  name: QUEUE_NAME,
  actions: {
    SDK_FETCH_TRANSACTION: async (actions) =>
      runTask(actions, fetchTransaction),
    SDK_EXECUTE_TRANSACTION: async (actions) =>
      runTask(actions, executeTransaction),
    SDK_STEP_FINISHED: async (actions) => runTask(actions, stepFinished),
  },
  run: ['SDK_FETCH_TRANSACTION'],
}
