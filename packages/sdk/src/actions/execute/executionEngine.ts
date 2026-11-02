import type { Emit, SdkContext, StoredQueue } from './queue/mod.js'
import type {
  BlockReason,
  ExecutionConfig,
  ExecutionEngine,
  HistoryItem,
} from './types.js'
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
  const { wallet, emitter, pauseOnStart, beforeResume } = config ?? {}
  const { promise: firstLoadDone, resolve: resolveFirstLoad } =
    Promise.withResolvers<void>()
  // Core runs a queue's next task even while paused, so every task checks this first.
  const isClientPaused = pauseOnStart === true

  /*
   * Read from the Manager on every call, since every status change and every paused load replaces core's queue object.
   * The clones keep a change to the item from reaching the stored record and block reason.
   */
  const view = (requestId: string): HistoryItem | undefined => {
    const queue: StoredQueue | undefined = manager.get(requestId)
    if (queue === undefined) {
      return undefined
    }
    const { status, list } = queue
    // Typed with `undefined`, since an array index and an index signature return a value for any key.
    const activeTask: { id: string } | undefined =
      list.tasks[list.state.activeTaskIndex]
    const activeTaskState: { blockedFor: BlockReason | null } | undefined =
      activeTask === undefined ? undefined : list.state.tasks[activeTask.id]
    return {
      _storage: structuredClone(queue.actions.getStorage()),
      _queue: {
        id: requestId,
        createdAt: queue.createdAt,
        status,
        // Read only while `BLOCKED`, since core never clears a task's block reason.
        blocked:
          status === 'BLOCKED'
            ? structuredClone(activeTaskState?.blockedFor ?? null)
            : null,
      },
    }
  }

  // An emitter error isn't caught: inside a task it fails the task, and elsewhere it reaches the caller.
  const emit: Emit = {
    routeEvent(requestId, event) {
      const historyItem = view(requestId)
      if (historyItem !== undefined) {
        emitter?.emit('routeEvent', { event, view: historyItem })
      }
    },
    stepEvent(requestId, step, transactionId, event) {
      const historyItem = view(requestId)
      if (historyItem !== undefined) {
        emitter?.emit('stepEvent', {
          event,
          step,
          transactionId,
          view: historyItem,
        })
      }
    },
    changed(requestId) {
      const historyItem = view(requestId)
      if (historyItem !== undefined) {
        emitter?.emit('changed', historyItem)
      }
    },
    loaded() {
      emitter?.emit('loaded', undefined)
    },
  }

  const context: SdkContext = {
    httpClient,
    wallet,
    loadBlockchainsMeta: async () => loadBlockchains(httpClient, cache),
    emit,
    signResponsesAwaitingWait: new Map(),
    isPaused: () => isClientPaused,
    view,
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
    /*
     * Core calls this before it reads the context for a run, and passes `current`, not the object, so `setContext`
     * writes the object the Manager was given, replacing only its wallet. No `try`: a throw is a Host bug.
     */
    ...(beforeResume === undefined
      ? {}
      : {
          beforeResume: (_: unknown, queue: { id: string }) => {
            const historyItem = view(queue.id)
            if (historyItem !== undefined) {
              beforeResume(
                { wallet: managerContext.current.wallet },
                (next) => {
                  managerContext.current = {
                    ...managerContext.current,
                    wallet: next.wallet,
                  }
                },
                historyItem,
              )
            }
          },
        }),
    events: {
      onStorageUpdate: (requestId) => {
        emit.changed(requestId)
      },
      onUpdateQueue: (requestId) => {
        emit.changed(requestId)
      },
      // After each load, also a paused tab's, in place of a `changed` per ID: the host reads `history` again.
      onPersistedDataLoaded: () => {
        resolveFirstLoad()
        emit.loaded()
      },
    },
  })

  // `firstLoadDone` resolves after the first load, also after a load error, and never rejects.
  await firstLoadDone
  return { manager, context }
}
