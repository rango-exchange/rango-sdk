import type { ActionName, SdkContext, SdkPayloads } from './types.js'
import type { ExecutionRecord } from '../mod.js'
import type { QueueDef } from '@rango-dev/queue-manager-core'

import { QUEUE_NAME } from './constants.js'
import { fetchTransaction } from './fetchTransaction.js'
import { runTask } from './runTask.js'
import { stepFinished } from './stepFinished.js'

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
    SDK_EXECUTE_TRANSACTION: async () => {},
    SDK_STEP_FINISHED: async (actions) => runTask(actions, stepFinished),
  },
  run: ['SDK_FETCH_TRANSACTION'],
}
