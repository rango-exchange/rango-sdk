import type { RequiredWallet } from './types.js'
import type { SelectedWallet } from '../../quote/mod.js'
import type {
  Bip122Wallet,
  EvmWallet,
  ExecutionRecord,
  ExecutionTransaction,
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

export function getWalletOnBlockchain<Wallet extends EvmWallet | Bip122Wallet>(
  namespace:
    | Wallet
    | { [blockchain: string]: Wallet | undefined; default?: Wallet }
    | undefined,
  blockchain: string,
): Wallet | undefined {
  if (namespace === undefined || isOneWallet(namespace)) {
    return namespace
  }
  return namespace[blockchain] ?? namespace.default
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

// A map's `getAccount` is a key, which holds a wallet or nothing.
function isOneWallet<Wallet extends EvmWallet | Bip122Wallet>(
  namespace: Wallet | { [blockchain: string]: unknown },
): namespace is Wallet {
  return typeof namespace.getAccount === 'function'
}
