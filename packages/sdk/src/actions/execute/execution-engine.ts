import type { SdkContext, StoredQueue } from './queue/mod.js'
import type { ExecutionConfig, ExecutionEngine } from './types.js'
import type { Cache } from '../../cache/mod.js'
import type { CacheSchema, LegacyClient } from '../../types.js'
import type { Manager } from '@rango-dev/queue-manager-core'

import { loadBlockchains } from '../quote/mod.js'

import { queueDefinition } from './queue/mod.js'

export async function createExecutionEngine(
  config: ExecutionConfig | undefined,
  httpClient: LegacyClient,
  cache: Cache<CacheSchema>,
): Promise<ExecutionEngine> {
  // A dynamic import, so apps that never execute don't bundle core.
  const { Manager } = await import('@rango-dev/queue-manager-core')
  const { pauseOnStart } = config ?? {}
  const { promise: firstLoadDone, resolve: resolveFirstLoad } =
    Promise.withResolvers<void>()
  // Core runs a queue's next task even while paused, so every task checks this first.
  const isClientPaused = pauseOnStart === true

  const context: SdkContext = {
    httpClient,
    loadBlockchainsMeta: async () => loadBlockchains(httpClient, cache),
    signResponsesAwaitingWait: new Map(),
    isPaused: () => isClientPaused,
    getQueueStatus: (requestId) => {
      const queue: StoredQueue | undefined = manager.get(requestId)
      return queue?.status
    },
  }

  // Core keeps this very object and reads its `current` at the start of each run, for that run's tasks.
  const managerContext: { current: SdkContext } = { current: context }

  const manager: Manager = new Manager({
    queuesDefs: [queueDefinition],
    isPaused: isClientPaused,
    context: managerContext,
    events: {
      onPersistedDataLoaded: () => {
        resolveFirstLoad()
      },
    },
  })

  // `firstLoadDone` resolves after the first load, also after a load error, and never rejects.
  await firstLoadDone
  return { manager, context }
}
