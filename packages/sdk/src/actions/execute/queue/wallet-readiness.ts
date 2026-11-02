import type { RequiredWallet, SdkActions } from './types.js'
import type { BlockReason } from '../mod.js'

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

// The gate's account check. A caller reads a rejected `getAccounts`, whatever it rejects with, as `null`.
export function getAccountBlockReason(
  requiredWallet: RequiredWallet,
  connectedAccounts: string[] | null,
): BlockReason | null {
  if (connectedAccounts === null || connectedAccounts.length === 0) {
    return { reason: 'NOT_CONNECTED', metadata: requiredWallet }
  }
  const requiredAddressLowerCase = requiredWallet.address.toLowerCase()
  if (
    !connectedAccounts.some(
      (account) => account.toLowerCase() === requiredAddressLowerCase,
    )
  ) {
    return { reason: 'ACCOUNT_MISMATCH', metadata: requiredWallet }
  }
  return null
}

// The gate's chain check.
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
  if (isSameChainId(currentChainId, requiredChainId)) {
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
  const chainIdAfterSwitch = await readWalletChainId().catch(() => null)
  if (isSameChainId(chainIdAfterSwitch, requiredChainId)) {
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
