// run `node --import=tsx index.ts` in the terminal

import {
  CreateTransactionRequest,
  MultiRouteRequest,
  RangoClient,
  TransactionStatus,
  TransactionType,
} from 'rango-sdk'
import { findToken } from '../shared/utils/meta.js'
import {
  logMeta,
  logSelectedTokens,
  logWallet,
  logTransactionHash,
  logRoutes,
  logStepStatus,
  logConfirmedRoute,
  logRouteStep,
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
const meta = await rango.getAllMetadata()
logMeta(meta)

// some example tokens for test purpose
const sourceBlockchain = 'SOLANA'
const sourceTokenAddress = null
const targetBlockchain = 'SOLANA'
const targetTokenAddress = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const amount = '10000'

// find selected tokens in meta.tokens
const sourceToken = findToken(meta.tokens, sourceBlockchain, sourceTokenAddress)
const targetToken = findToken(meta.tokens, targetBlockchain, targetTokenAddress)
logSelectedTokens(sourceToken, targetToken)

// get route
const routingRequest: MultiRouteRequest = {
  from: sourceToken,
  to: targetToken,
  amount,
  slippage: '1.0',
  transactionTypes: [TransactionType.SOLANA],
}
const routingResponse = await rango.getAllRoutes(routingRequest)

logRoutes(routingResponse)

if (routingResponse.results.length === 0) {
  throw new Error(`No routes found! ${routingResponse.error}`)
}

// confirm one of the routes
const selectedRoute = routingResponse.results[0]

const selectedWallets = selectedRoute.swaps
  .flatMap((swap) => [swap.from.blockchain, swap.to.blockchain])
  .filter((blockchain, index, self) => self.indexOf(blockchain) === index)
  .map((blockchain) => ({ [blockchain]: walletAddress }))
  .reduce((acc, obj) => {
    return { ...acc, ...obj }
  }, {})

const confirmResponse = await rango.confirmRoute({
  requestId: selectedRoute.requestId,
  selectedWallets,
})

const confirmedRoute = confirmResponse.result

if (!confirmedRoute) {
  throw new Error(`Error in confirming route, ${confirmResponse.error}`)
}

logConfirmedRoute(confirmedRoute)

// check wallet to have enough balance or fee using confirm response
for (const validation of confirmedRoute?.validationStatus || []) {
  for (const wallet of validation.wallets) {
    for (const asset of wallet.requiredAssets) {
      if (!asset.ok) {
        const message = `Insufficient ${asset.reason}: asset: ${asset.asset.blockchain}.${asset.asset.symbol}, 
        required balance: ${asset.requiredAmount.amount}, current balance: ${asset.currentAmount.amount}`
        throw new Error(message)
      }
    }
  }
}

let step = 1
const swapSteps = confirmedRoute.result?.swaps || []
for (const swap of swapSteps) {
  logRouteStep(swap, step)

  const request: CreateTransactionRequest = {
    requestId: confirmedRoute.requestId,
    step: step,
    userSettings: {
      slippage: '1.0',
      infiniteApprove: false,
    },
    validations: {
      approve: true,
      balance: false,
      fee: false,
    },
  }
  let createTransactionResponse = await rango.createTransaction(request)
  let tx = createTransactionResponse.transaction
  if (!tx) {
    throw new Error(
      `Error creating the transaction ${createTransactionResponse.error}`
    )
  }

  if (tx.type === TransactionType.SOLANA) {
    const defaultSigner = new DefaultSolanaSigner(solana as any)
    setSolanaSignerConfig('customRPC', 'https://api.mainnet-beta.solana.com/')

    const { hash } = await defaultSigner.signAndSendTx(tx)
    logTransactionHash(hash, false)

    // track swap status
    while (true) {
      await setTimeout(10_000)
      const state = await rango.checkStatus({
        requestId: confirmedRoute.requestId,
        step,
        txId: hash,
      })
      logStepStatus(state)

      const status = state.status
      if (status === TransactionStatus.SUCCESS) {
        // we could proceed with the next step of the route
        step += 1
        break
      } else if (status === TransactionStatus.FAILED) {
        throw new Error(`Swap failed on step ${step}`)
      }
    }
  }
}
