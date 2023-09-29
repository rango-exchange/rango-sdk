import { TransactionType } from 'rango-sdk'

export type ExampleTxType = TransactionType.EVM | TransactionType.COSMOS

export enum ExampleWallet {
  Metamask = 'Metamask',
  Keplr = 'Keplr',
}
