import { TransactionType } from '../transactions.js'
import { BaseTransaction } from './base.js'

/** Account metadata used to define instructions */
export type SolanaInstructionKey = {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

/** Transaction Instruction class */
export type SolanaInstruction = {
  keys: SolanaInstructionKey[]
  programId: string
  data: number[]
}

/** Pair of signature and corresponding public key */
export type SolanaSignature = {
  signature: number[]
  publicKey: string
}

/** This type of transaction is used for all solana transactions */
export interface SolanaTransaction extends BaseTransaction {
  /** This fields equals to SOLANA for all SolanaTransactions */
  type: TransactionType.SOLANA
  /** Type of the solana transaction */
  txType: 'LEGACY' | 'VERSIONED'
  /** Source wallet address */
  from: string
  /** Transaction hash used in case of retry */
  identifier: string
  /** A recent blockhash */
  recentBlockhash: string | null
  /** Signatures for the transaction */
  signatures: SolanaSignature[]
  /** The byte array of the transaction */
  serializedMessage: number[] | null
  /** The instructions to atomically execute */
  instructions: SolanaInstruction[]
}

export const isSolanaTransaction = (transaction: {
  type: TransactionType
}): transaction is SolanaTransaction =>
  transaction.type === TransactionType.SOLANA
