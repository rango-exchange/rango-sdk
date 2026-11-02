import type { StoredQueue } from './queue/mod.js'
import type { ExecutionOptions } from './types.js'
import type { ClientState } from '../../types.js'

import { SdkError, throwSdkError } from '../../errors/mod.js'

import { buildInitialExecutionRecord } from './helpers.js'
import { QUEUE_NAME } from './queue/mod.js'

export async function startOrUnblockExecution(
  state: ClientState,
  requestId: string,
  options?: ExecutionOptions,
): Promise<void> {
  const { manager, context } = await state.executionEngine()

  // Unblocking only reruns the gate.
  const storedQueue: StoredQueue | undefined = manager.get(requestId)
  if (storedQueue !== undefined) {
    if (storedQueue.status === 'BLOCKED' && !context.isPaused()) {
      storedQueue.list.unblock()
    }
    return
  }
  const confirmedRoute = state.cache.get('confirmed')?.get(requestId)
  if (confirmedRoute === undefined) {
    throw new SdkError(
      'INVALID_INPUT',
      'No confirmed route or stored execution has this `requestId`.',
      { metadata: { field: 'requestId', reason: 'NOT_FOUND' } },
    )
  }
  // The slippage is left to the types.
  if (options === undefined) {
    throw new SdkError('INVALID_INPUT', 'A new execution needs `options`.', {
      metadata: { field: 'options', reason: 'MISSING' },
    })
  }
  const blockchainWithoutWalletType = Object.keys(
    confirmedRoute.data.selectedWallets,
  ).find((blockchain) => {
    // Typed with `undefined`, since an index signature returns a value for any key.
    const walletTypeOption: { walletType: string } | undefined =
      options.walletTypes[blockchain]
    return !walletTypeOption?.walletType
  })
  if (blockchainWithoutWalletType !== undefined) {
    throw new SdkError(
      'INVALID_INPUT',
      `A new execution needs a \`walletType\` for ${blockchainWithoutWalletType}.`,
      { metadata: { field: 'walletTypes', reason: 'MISSING' } },
    )
  }

  // No `await` between the existing-record check and `create`, so a parallel call finds the record.
  await manager
    .create(QUEUE_NAME, buildInitialExecutionRecord(confirmedRoute, options), {
      id: requestId,
    })
    .catch((cause: unknown) => throwSdkError(cause))

  // A new map, so a slot the app read earlier keeps the entry.
  const confirmedWithoutThisRequest = new Map(state.cache.get('confirmed'))
  confirmedWithoutThisRequest.delete(requestId)
  state.cache.set('confirmed', confirmedWithoutThisRequest)
}
