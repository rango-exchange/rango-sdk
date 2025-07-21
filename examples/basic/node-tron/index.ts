// run `node --import=tsx index.ts` in the terminal

import {
  RangoClient,
  TransactionStatus,
  TransactionType,
} from 'rango-sdk-basic'
import {
  logQuote,
  logWallet,
  logSwap,
  logSwapStatus,
  logTransactionHash,
} from '../shared/utils/logger.js'
import { setTimeout } from 'timers/promises'
import { DefaultTronSigner } from '@rango-dev/signer-tron'
import { TronWeb } from 'tronweb'

// setup wallet and tron web
const privateKey = 'YOUR_PRIVATE_KEY' // Replace with your private key

// in web based apps, you could use injected provider instead
// e.g. use window.tronLink.tronWeb or ... instead
const TRON_API = 'https://api.trongrid.io'
const tronWeb = new TronWeb(TRON_API, TRON_API, TRON_API, privateKey)
const walletAddress = tronWeb.address.fromPrivateKey(privateKey) || ''

logWallet(walletAddress)

// initiate sdk using your api key
const API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
const rango = new RangoClient(API_KEY)

// some example tokens for test purpose
const sourceBlockchain = 'TRON'
const sourceTokenAddress = null
const targetBlockchain = 'TRON'
const targetTokenAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const amount = '1000' // 0.001 TRX

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

if (tx.type === TransactionType.TRON) {
  const defaultSigner = new DefaultTronSigner({ tronWeb })

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
