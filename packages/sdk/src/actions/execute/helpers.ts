import type { ExecutionOptions, ExecutionRecord } from './types.js'
import type { ConfirmResult } from '../confirm/mod.js'

// Cloned, so a later change to the route or the options never reaches the stored record.
export function buildInitialExecutionRecord(
  confirmedRoute: ConfirmResult,
  options: ExecutionOptions,
): ExecutionRecord {
  const storedOptions = structuredClone(options)
  storedOptions.swapMode ??= 'swap'
  return {
    data: structuredClone(confirmedRoute.data),
    options: storedOptions,
    transactions: {},
    finishedSwapSteps: 0,
    failure: null,
    finishedAt: null,
  }
}
