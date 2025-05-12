// run `node --import=tsx index.ts` in the terminal

import { RangoClient, SwapRequest, TransactionStatus } from 'rango-sdk-basic'
import process from 'node:process'

import {
  logMeta,
  logQuote,
  logWallet,
  logSwap,
  logSwapStatus,
  logTransactionHash,
} from '../shared/utils/logger.js'
import { setTimeout } from 'timers/promises'
import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import * as tinysecp from 'tiny-secp256k1'

// Configuration constants
const BTC_RPC_URL = 'https://go.getblock.io/f37bad28a991436483c0a3679a3acbee'
const BITCOIN_WIF = 'YOUR_BITCOIN_PRIVATE_KEY'
const EVM_ADDRESS = 'YOUR_EVM_ADDRESS'
const API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
const NETWORK = bitcoin.networks.bitcoin // switch to bitcoin.networks.testnet for testnet

// quote request example for test purpose
const sourceBlockchain = 'BTC'
const sourceTokenAddress = null
const targetBlockchain = 'ARBITRUM'
const targetTokenAddress = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'
const transactionAmount = '20000'
const transactionSlippage = 1.0

async function executeSwapTransaction() {
  // 1. Initialize key pair and derive address
  const ECPair = ECPairFactory(tinysecp)
  const keyPair = ECPair.fromWIF(BITCOIN_WIF, NETWORK)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: NETWORK,
  })

  if (!address) throw new Error('Invalid wallet address')
  logWallet(address)

  // 2. Initialize SDK client and fetch metadata
  const rango = new RangoClient(API_KEY)
  const meta = await rango.meta()
  logMeta(meta)

  // 3. Request a quote
  const quoteRequest = {
    from: { blockchain: sourceBlockchain, address: sourceTokenAddress },
    to: { blockchain: targetBlockchain, address: targetTokenAddress },
    amount: transactionAmount,
    slippage: transactionSlippage,
  }

  const quote = await rango.quote(quoteRequest)
  logQuote(quote)

  // 4. Build and send swap request
  const swapRequest: SwapRequest = {
    ...quoteRequest,
    fromAddress: address,
    toAddress: EVM_ADDRESS,
  }
  const swap = await rango.swap(swapRequest)
  logSwap(swap)
  const { tx } = swap
  if (tx?.type !== 'TRANSFER' || !tx.psbt)
    throw new Error('Invalid transaction structure')

  // 5. Sign and finalize PSBT
  const psbt = bitcoin.Psbt.fromBase64(tx.psbt.unsignedPsbtBase64)
  const signer: bitcoin.Signer = {
    publicKey: Buffer.from(keyPair.publicKey),
    sign: (hash: Buffer) => Buffer.from(keyPair.sign(Uint8Array.from(hash))),
  }
  tx.psbt.inputsToSign.forEach((input) => {
    input.signingIndexes.forEach((index) => psbt.signInput(index, signer))
  })
  psbt.finalizeAllInputs()
  const rawTransactionHex = psbt.extractTransaction().toHex()

  // 6. Broadcast raw transaction
  const response = await fetch(BTC_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'sendrawtransaction',
      params: [rawTransactionHex],
    }),
  })
  if (!response.ok)
    throw new Error(`Broadcast failed: ${await response.text()}`)
  const { result: transactionId } = await response.json()
  logTransactionHash(transactionId, false)

  // 7. Monitor transaction status

  while (true) {
    await setTimeout(10_000)
    const state = await rango.status({
      requestId: swap.requestId,
      txId: transactionId,
    })
    logSwapStatus(state)

    const status = state.status
    if (
      status &&
      ![TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(status)
    ) {
      break
    }
  }
}

executeSwapTransaction().catch((e) => {
  console.error(e)
  process.exit(1)
})
