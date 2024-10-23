// run `node --import=tsx index.ts` in the terminal

import {
  RangoClient,
  TransactionStatus,
  TransactionType,
} from 'rango-sdk-basic'
import {
  logMeta,
  logQuote,
  logWallet,
  logSwap,
  logSwapStatus,
  logTransactionHash,
} from '../shared/utils/logger.js'
import { setTimeout } from 'timers/promises'
import bs58 from 'bs58'
import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  DefaultSolanaSigner,
  setSolanaSignerConfig,
} from '@rango-dev/signer-solana'

// setup wallet key pair
const base58PrivateKey = 'YOUR_BASE58_ENCODED_PRIVATE_KEY'
const privateKey = bs58.decode(base58PrivateKey)
const keypair = Keypair.fromSecretKey(privateKey)
const walletAddress = keypair.publicKey.toString()

// in web based apps, you could use injected provider instead
// e.g. use window.phantom.solana  intead of SolanaProvider
class SolanaProvider {
  public publicKey?: PublicKey
  private keypair: Keypair

  constructor(keypair: Keypair) {
    this.keypair = keypair
    this.publicKey = keypair.publicKey
  }

  async signTransaction(transaction: VersionedTransaction | Transaction) {
    if (transaction instanceof VersionedTransaction)
      transaction.sign([this.keypair])
    else transaction.sign(this.keypair)
    return transaction
  }
}
const solana = new SolanaProvider(keypair)

logWallet(walletAddress)

// initiate sdk using your api key
const API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
const rango = new RangoClient(API_KEY)

// get blockchains and tokens meta data
const meta = await rango.meta()
logMeta(meta)

// some example tokens for test purpose
const sourceBlockchain = 'SOLANA'
const sourceTokenAddress = null
const targetBlockchain = 'SOLANA'
const targetTokenAddress = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const amount = '10000'

// get quote
const quoteRequest = {
  from: { blockchain: sourceBlockchain, address: sourceTokenAddress },
  to: { blockchain: targetBlockchain, address: targetTokenAddress },
  amount,
  slippage: 1.0,
}
const quote = await rango.quote(quoteRequest)
logQuote(quote)

const swapRequest = {
  ...quoteRequest,
  fromAddress: walletAddress,
  toAddress: walletAddress,
}

// create transaction
const swap = await rango.swap(swapRequest)
logSwap(swap)

const tx = swap.tx

if (!tx) {
  throw new Error(`Error creating the transaction ${swap.error}`)
}

if (tx.type === TransactionType.SOLANA) {
  const defaultSigner = new DefaultSolanaSigner(solana as any)
  setSolanaSignerConfig('customRPC', 'https://api.mainnet-beta.solana.com/')

  const { hash } = await defaultSigner.signAndSendTx(tx)
  logTransactionHash(hash, false)

  // track swap status
  while (true) {
    await setTimeout(10_000)
    const state = await rango.status({
      requestId: swap.requestId,
      txId: hash,
    })
    logSwapStatus(state)

    const status = state.status
    if (
      status &&
      [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(status)
    ) {
      break
    }
  }
}
