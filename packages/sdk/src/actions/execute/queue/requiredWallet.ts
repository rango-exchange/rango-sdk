import type { RequiredWallet, SdkActions } from './types.js'
import type { SelectedWallet } from '../../quote/mod.js'
import type {
  ExecutionRecord,
  ExecutionTransaction,
  Namespace,
  WalletByNamespace,
} from '../mod.js'
import type { Transaction } from 'rango-sdk'
import type { TransactionPrerequisite } from 'rango-types'

import { TransactionType } from 'rango-types'

// The selected-wallet key of a Hyperliquid transaction, which an EVM wallet signs.
const HYPERLIQUID_SELECTED_WALLET_KEY = 'HYPERLIQUID'

export function getRequiredWallet(
  storage: ExecutionRecord,
  entry: Transaction | TransactionPrerequisite,
): RequiredWallet {
  if (entry.type === TransactionType.TRANSFER) {
    return { blockchain: entry.blockChain, address: entry.fromWalletAddress }
  }
  const selectedWalletKey =
    entry.type === TransactionType.HYPERLIQUID
      ? HYPERLIQUID_SELECTED_WALLET_KEY
      : entry.blockChain
  return {
    blockchain: selectedWalletKey,
    address: storage.data.selectedWallets[selectedWalletKey].address,
  }
}

export function readWallet<N extends Namespace>(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  namespace: N,
): WalletByNamespace[N] | undefined {
  const storage = actions.getStorage()
  const { transactionId } = actions.getCurrentTask().payload
  const entry = storage.transactions[transactionId].data.value
  const { blockchain } = getRequiredWallet(storage, entry)
  const selectedWallet = storage.data.selectedWallets[blockchain]
  return actions.context.getWallet?.({
    namespace,
    blockchain,
    walletId: selectedWallet.walletId,
  })
}

export function getCurrentStepWalletIdForReport(
  storage: ExecutionRecord,
): string | undefined {
  const mainEntryId = `s${storage.finishedSwapSteps + 1}`
  // Typed with `undefined`, since an index signature returns a value for any key.
  const mainEntry: ExecutionTransaction | undefined =
    storage.transactions[mainEntryId]
  const firstPrerequisiteEntry: ExecutionTransaction | undefined =
    storage.transactions[`${mainEntryId}.p0`]
  const entryToReport = mainEntry ?? firstPrerequisiteEntry
  if (entryToReport === undefined) {
    return undefined
  }
  const { blockchain } = getRequiredWallet(storage, entryToReport.data.value)
  const selectedWallet: SelectedWallet | undefined =
    storage.data.selectedWallets[blockchain]
  return selectedWallet?.walletId
}
