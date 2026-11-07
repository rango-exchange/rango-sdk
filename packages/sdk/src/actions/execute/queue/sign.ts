import type { CheckResult, SdkActions, SignedEntryResult } from './types.js'
import type { SignResult } from '../mod.js'
import type { BlockchainMeta } from 'rango-sdk'

import { loadBlockchainMetaOf } from './blockchainMeta.js'
import { isCanceled } from './executionFailure.js'
import { buildCheckResultWithExplorerLink } from './explorerLink.js'
import { getRequiredWallet } from './requiredWallet.js'

// What `signWithWallet` resolved with, or `null` when it did or once the Execution is canceled.
export async function signEntryAndStoreSignedHash<
  SignedEntry extends {
    walletResult: { hash: string } | null
    checkResult?: CheckResult | null
  },
>(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  signWithWallet: () => Promise<SignedEntry | null>,
): Promise<SignedEntry | null> {
  const { context } = actions
  const storageBeforeSign = actions.getStorage()
  const { requestId } = storageBeforeSign.data
  const entry = storageBeforeSign.transactions[transactionId]
  const { step } = entry
  entry.execution.status = 'sign_requested'
  actions.setStorage(storageBeforeSign)
  context.emit.stepEvent(requestId, step, transactionId, {
    type: 'tx_execution',
    status: 'send_tx',
  })

  const signResult = await signWithWallet()
  if (signResult === null || isCanceled(actions)) {
    return null
  }
  const storageAfterSign = actions.getStorage()
  const storedEntry = storageAfterSign.transactions[transactionId]
  storedEntry.execution.status = 'signed'
  storedEntry.execution.result.walletResult = signResult.walletResult
  if (signResult.checkResult) {
    storedEntry.execution.result.checkResult = signResult.checkResult
  }
  actions.setStorage(storageAfterSign)
  context.emit.stepEvent(requestId, step, transactionId, {
    type: 'tx_execution',
    status: 'tx_sent',
  })
  context.emit.stepEvent(requestId, step, transactionId, {
    type: 'check_status',
  })
  return signResult
}

// A provisional hash (`hashRequiringUpdate`) gets no link, and the flag goes no further.
export async function awaitSignResultAndBuildExplorerLink(
  pendingSignResult: Promise<SignResult>,
  blockchainMeta: BlockchainMeta,
  explorerLinkDescription: 'Approve' | 'Swap',
): Promise<SignedEntryResult & { checkResult: CheckResult | null }> {
  const { hash, response, hashRequiringUpdate } = await pendingSignResult
  const checkResult =
    hashRequiringUpdate === true
      ? null
      : buildCheckResultWithExplorerLink(
          blockchainMeta,
          hash,
          explorerLinkDescription,
        )
  return { walletResult: { hash }, checkResult, response }
}

/*
 * The Blockchain list is read after the gate and before `sign_requested` is stored, so a failed load fails the swap
 * with nothing signed. `null` once the Execution is canceled during the read.
 */
export function buildMainTransactionSigner(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  signWithNamespaceWallet: () => Promise<SignResult>,
): () => Promise<
  (SignedEntryResult & { checkResult: CheckResult | null }) | null
> {
  const { transactionId } = actions.payload
  return async () => {
    const storage = actions.getStorage()
    const { data } = storage.transactions[transactionId]
    // A Prerequisite is signed on its own path, so one here is a bug.
    if (data.type === 'prerequisite') {
      throw new Error(
        'Unexpected Error: A Prerequisite is not a main transaction.',
      )
    }
    const { blockchain: requiredBlockchain } = getRequiredWallet(
      storage,
      data.value,
    )
    const blockchainMeta = await loadBlockchainMetaOf(
      actions,
      requiredBlockchain,
    )
    if (isCanceled(actions)) {
      return null
    }
    return signEntryAndStoreSignedHash(actions, transactionId, async () =>
      awaitSignResultAndBuildExplorerLink(
        signWithNamespaceWallet(),
        blockchainMeta,
        'Swap',
      ),
    )
  }
}
