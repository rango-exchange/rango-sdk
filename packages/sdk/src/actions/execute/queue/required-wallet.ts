import type { RequiredWallet } from './types.js'
import type { ExecutionRecord, ExecutionTransaction } from '../mod.js'
import type { Transaction } from 'rango-sdk'

import { TransactionType } from 'rango-types'

// The selected-wallet key of a Hyperliquid transaction, which an EVM wallet signs.
const HYPERLIQUID_SELECTED_WALLET_KEY = 'HYPERLIQUID'

export function getRequiredWallet(
  storage: ExecutionRecord,
  tx: Transaction,
): RequiredWallet {
  if (tx.type === TransactionType.TRANSFER) {
    return { blockchain: tx.blockChain, address: tx.fromWalletAddress }
  }
  const selectedWalletKey =
    tx.type === TransactionType.HYPERLIQUID
      ? HYPERLIQUID_SELECTED_WALLET_KEY
      : tx.blockChain
  return {
    blockchain: selectedWalletKey,
    address: storage.data.selectedWallets[selectedWalletKey],
  }
}

export function getCurrentStepWalletTypeForReport(
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
  const blockchain =
    entryToReport.data.type === 'tx'
      ? getRequiredWallet(storage, entryToReport.data.value).blockchain
      : entryToReport.data.value.blockChain
  const walletTypeOption: { walletType: string } | undefined =
    storage.options.walletTypes[blockchain]
  return walletTypeOption?.walletType
}
