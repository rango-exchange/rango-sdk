import type { RequiredWallet, SdkActions } from './types.js'
import type { BlockReason } from '../mod.js'

import { isCanceledOrPaused } from './executionFailure.js'

// Chain IDs compare as BigInts, so hex and decimal match. A value BigInt cannot read matches nothing.
function isSameChainId(current: string | null, required: string): boolean {
  if (current === null) {
    return false
  }
  try {
    return BigInt(current) === BigInt(required)
  } catch {
    return false
  }
}

// The gate's account check. A caller reads a rejected `getAccount`, whatever it rejects with, as `null`.
export function getAccountBlockReason(
  requiredWallet: RequiredWallet,
  activeAccount: string | null,
): BlockReason | null {
  if (!activeAccount) {
    return { reason: 'NOT_CONNECTED', metadata: requiredWallet }
  }
  if (activeAccount.toLowerCase() !== requiredWallet.address.toLowerCase()) {
    return { reason: 'ACCOUNT_MISMATCH', metadata: requiredWallet }
  }
  return null
}

/*
 * The gate's chain check. A canceled Execution is left unprompted, and no port method is called after: the caller
 * checks it after.
 */
export async function switchToRequiredChainOrGetBlockReason(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  requiredWallet: RequiredWallet,
  requiredChainId: string | null,
  readWalletChainId: () => Promise<string | null>,
  askWalletToSwitchChain: (chainId: string) => Promise<void>,
): Promise<BlockReason | null> {
  if (!requiredChainId) {
    throw new Error(
      `Unexpected Error: ${requiredWallet.blockchain} has no chain ID.`,
    )
  }
  const currentChainId = await readWalletChainId().catch(() => null)
  if (
    isCanceledOrPaused(actions) ||
    isSameChainId(currentChainId, requiredChainId)
  ) {
    return null
  }
  const storage = actions.getStorage()
  const { step } = storage.transactions[transactionId]
  actions.context.emit.stepEvent(storage.data.requestId, step, transactionId, {
    type: 'tx_execution',
    status: 'switch_network',
  })
  // A rejected switch is ignored: the chain is read again.
  await askWalletToSwitchChain(requiredChainId).catch(() => undefined)
  if (isCanceledOrPaused(actions)) {
    return null
  }
  const chainIdAfterSwitch = await readWalletChainId().catch(() => null)
  if (
    isCanceledOrPaused(actions) ||
    isSameChainId(chainIdAfterSwitch, requiredChainId)
  ) {
    return null
  }
  return {
    reason: 'NETWORK_MISMATCH',
    metadata: {
      blockchain: requiredWallet.blockchain,
      address: requiredWallet.address,
      requiredChainId,
    },
  }
}
