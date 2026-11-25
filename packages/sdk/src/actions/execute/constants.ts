import type { HistoryItem } from './types.js'

/*
 * The ends an Execution can reach, shared by `delete()` and `cancel()`: only an Execution that has ended is deleted,
 * and cancel returns on one. Core's `deleteQueue` fires no event, so `delete()` emits none.
 */
export const ENDED_QUEUE_STATUSES: ReadonlySet<
  HistoryItem['_queue']['status']
> = new Set(['SUCCESS', 'FAILED', 'CANCELED'])
