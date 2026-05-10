import { BaseTransaction, TransactionType } from '../../shared/index.js'

export interface SuiTransaction extends BaseTransaction {
  type: TransactionType.SUI
  unsignedPtbBase64: string
}

export const isSuiTransaction = (transaction: {
  type: TransactionType
}): transaction is SuiTransaction => transaction.type === TransactionType.SUI
