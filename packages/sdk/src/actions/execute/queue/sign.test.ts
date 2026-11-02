// The main transaction's sign builder, given a stored record directly: a Prerequisite entry can't reach it through the client.
import type { SdkActions } from './types.js'
import type { ExecutionRecord } from '../mod.js'

import { describe, expect, test, vi } from 'vitest'

import {
  confirmResponse,
  evmApprove,
  EXECUTION_OPTIONS,
  httpClient,
  SELECTED_WALLETS,
} from '../../../../tests/support.js'

import { buildMainTransactionSigner } from './sign.js'

// A one-Step record whose `s1` entry is a Prerequisite, not started.
function recordWithPrerequisiteAtMainEntry(): ExecutionRecord {
  const route = confirmResponse('request-1').result
  if (route === null || route.result === null) {
    throw new Error('No route')
  }
  return {
    data: { ...route, result: route.result, selectedWallets: SELECTED_WALLETS },
    options: EXECUTION_OPTIONS,
    transactions: {
      s1: {
        data: { type: 'prerequisite', value: evmApprove() },
        step: 1,
        execution: {
          status: 'not_started',
          result: { walletResult: null, checkResult: null },
        },
      },
    },
    finishedSwapSteps: 0,
    failure: null,
    finishedAt: null,
  }
}

function actionsOn(
  storage: ExecutionRecord,
): SdkActions<'SDK_EXECUTE_TRANSACTION'> {
  return {
    next: vi.fn(),
    retry: vi.fn(),
    failed: vi.fn(),
    schedule: vi.fn(),
    payload: { transactionId: 's1' },
    setStorage: vi.fn(),
    getStorage: () => storage,
    block: vi.fn(),
    unblock: vi.fn(),
    context: {
      httpClient,
      wallet: undefined,
      loadBlockchainsMeta: vi.fn(async () => []),
      emit: {
        routeEvent: vi.fn(),
        stepEvent: vi.fn(),
        changed: vi.fn(),
        loaded: vi.fn(),
      },
      signResponsesAwaitingWait: new Map(),
      isPaused: () => false,
      view: () => undefined,
      getQueueStatus: () => undefined,
    },
  }
}

describe('buildMainTransactionSigner', () => {
  test('throws a plain Error on a Prerequisite entry, with nothing loaded, stored or signed', async () => {
    const actions = actionsOn(recordWithPrerequisiteAtMainEntry())
    const sign = vi.fn(async () => ({ hash: '0xhash' }))

    await expect(buildMainTransactionSigner(actions, sign)()).rejects.toThrow(
      expect.objectContaining({
        name: 'Error',
        message: 'Unexpected Error: A Prerequisite is not a main transaction.',
      }),
    )
    expect(actions.context.loadBlockchainsMeta).not.toHaveBeenCalled()
    expect(actions.setStorage).not.toHaveBeenCalled()
    expect(sign).not.toHaveBeenCalled()
  })
})
