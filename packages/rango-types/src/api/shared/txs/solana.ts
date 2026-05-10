import { TransactionType } from '../transactions.js'
import { BaseTransaction } from './base.js'

/**
 * Account metadata used to define instructions
 */
export type SolanaInstructionKey = {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

/**
 * Transaction Instruction class
 */
export type SolanaInstruction = {
  keys: SolanaInstructionKey[]
  programId: string
  data: number[]
}

/**
 * Pair of signature and corresponding public key
 */
export type SolanaSignature = {
  signature: number[]
  publicKey: string
}

/**
 * This type of transaction is used for all solana transactions
 *
 * @property {TransactionType} type - This fields equals to SOLANA for all SolanaTransactions
 * @property {'LEGACY' | 'VERSIONED'} txType - Type of the solana transaction
 * @property {string} blockChain, equals to SOLANA
 * @property {string} from, Source wallet address
 * @property {string} identifier, Transaction hash used in case of retry
 * @property {string | null} recentBlockhash, A recent blockhash
 * @property {SolanaSignature[]} signatures, Signatures for the transaction
 * @property {number[] | null} serializedMessage, The byte array of the transaction
 * @property {SolanaInstruction[]} instructions, The instructions to atomically execute
 *
 */
export interface SolanaTransaction extends BaseTransaction {
  type: TransactionType.SOLANA
  txType: 'LEGACY' | 'VERSIONED'
  from: string
  identifier: string
  recentBlockhash: string | null
  signatures: SolanaSignature[]
  serializedMessage: number[] | null
  instructions: SolanaInstruction[]
}

export const isSolanaTransaction = (transaction: {
  type: TransactionType
}): transaction is SolanaTransaction =>
  transaction.type === TransactionType.SOLANA
