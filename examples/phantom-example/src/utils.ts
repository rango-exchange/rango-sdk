import { Amount, SolanaTransaction } from 'rango-sdk'
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import BigNumber from 'bignumber.js'
import { Buffer } from 'buffer'

declare global {
  interface Window {
    solana: any
  }
}

const SOLANA_RPC_URLS = ['https://api.mainnet-beta.solana.com/']

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()

const retryPromise = async <Type>(
  promise: Promise<Type>,
  count: number,
  timeoutMs: number,
  verifier: ((input: Type) => boolean) | null = null
): Promise<Type> => {
  let remained = count
  while (remained > 0) {
    try {
      const result = (await Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        ),
      ])) as Type
      if (remained > 1 && verifier != null && !verifier(result))
        throw new Error('bad result')
      return result
    } catch (er) {
      console.log(
        'cant get result. time=' +
          new Date().toLocaleTimeString() +
          ' i=' +
          remained +
          ' , err=',
        er
      )
      remained--
    }
  }
  throw new Error('function reached max retry count')
}

function getSolanaConnection(): Connection {
  console.log('getSolanaConnection')
  return new Connection(
    SOLANA_RPC_URLS[Math.floor(Math.random() * SOLANA_RPC_URLS.length)],
    {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
    }
  )
}

function confirmTx(signature: string): Promise<boolean> {
  return new Promise(async function (resolve, reject) {
    let confirmRetry = 3
    let successfulConfirm = false
    while (confirmRetry > 0) {
      try {
        let confirmResult = await getSolanaConnection().confirmTransaction(
          signature
        )
        if (
          !!confirmResult &&
          !!confirmResult.value &&
          confirmResult.value.err == null
        ) {
          successfulConfirm = true
          break
        } else if (
          confirmRetry === 1 &&
          !!confirmResult &&
          !!confirmResult.value &&
          !!confirmResult.value.err
        )
          reject(confirmResult.value.err)
      } catch (e) {
        if (confirmRetry === 1) reject(e)
      }

      confirmRetry -= 1
    }
    resolve(successfulConfirm)
  })
}

const getFailedHash = (tx: SolanaTransaction) => {
  const random = Math.floor(Math.random() * 9000) + 1000
  return 'failed::' + tx.identifier + '::' + random
}

export const executeSolanaTransaction = async (
  tx: SolanaTransaction
): Promise<string> => {
  const connection = getSolanaConnection()
  var transaction: Transaction
  if (tx.serializedMessage != null) {
    transaction = Transaction.from(
      Buffer.from(new Uint8Array(tx.serializedMessage))
    )
    transaction.feePayer = new PublicKey(tx.from)
    transaction.recentBlockhash = undefined
  } else {
    transaction = new Transaction()
    transaction.feePayer = new PublicKey(tx.from)
    transaction.recentBlockhash = tx.recentBlockhash || undefined
    tx.instructions.forEach((instruction) => {
      transaction.add(
        new TransactionInstruction({
          keys: instruction.keys.map((accountMeta) => ({
            pubkey: new PublicKey(accountMeta.pubkey),
            isSigner: accountMeta.isSigner,
            isWritable: accountMeta.isWritable,
          })),
          programId: new PublicKey(instruction.programId),
          data: Buffer.from(instruction.data),
        })
      )
    })

    tx.signatures.forEach(function (signatureItem, index, array) {
      let signature = Buffer.from(new Uint8Array(signatureItem.signature))
      let publicKey = new PublicKey(signatureItem.publicKey)
      transaction.addSignature(publicKey, signature)
    })
  }

  if (!transaction) throw Error('error creating transaction')
  try {
    if (!transaction.recentBlockhash)
      transaction.recentBlockhash = (
        await retryPromise(connection.getRecentBlockhash(), 5, 10000)
      ).blockhash
    const signedTransaction = await window.solana.signTransaction(transaction)
    const raw = signedTransaction.serialize()
    const signature = await retryPromise(
      connection.sendRawTransaction(raw),
      2,
      30_000
    )
    if (!signature)
      throw new Error('tx cant send to blockchain. signature=' + signature)

    const confirmed = await confirmTx(signature)
    if (!confirmed)
      throw new Error('tx cant confirm on blockchain. signature=' + signature)
    return signature
  } catch (e) {
    if (e && (e as any).hasOwnProperty('code') && (e as any).code === 4001)
      // user rejection
      throw e
    return getFailedHash(tx)
  }
}
