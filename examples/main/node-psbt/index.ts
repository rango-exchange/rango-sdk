// run `node --import=tsx index.ts` in the terminal

import {
  BestRouteRequest,
  CreateTransactionRequest,
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
} from '../shared/utils/logger.js'
import { setTimeout } from 'timers/promises'

import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import * as tinysecp from 'tiny-secp256k1'

// Configuration parameters
const BTC_RPC_URL = 'https://go.getblock.io/f37bad28a991436483c0a3679a3acbee'
const BITCOIN_WIF = 'YOUR_BITCOIN_PRIVATE_KEY'
const EVM_ADDRESS = 'YOUR_EVM_ADDRESS'
const API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
const NETWORK = bitcoin.networks.bitcoin // Use testnet: bitcoin.networks.testnet
const MAX_STEPS = 1 // Limit to one route
const STEP_INDEX = 1 // Execute the first step

// Example request values
const SOURCE_CHAIN = 'BTC'
const SOURCE_TOKEN_ADDR = null
const TARGET_CHAIN = 'ARBITRUM'
const TARGET_TOKEN_ADDR = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'
const AMOUNT = '0.0002'
const SLIPPAGE = '1.0'

async function processSwapRoutes() {
  try {
    // Step 1: Load and validate wallet
    const ECPair = ECPairFactory(tinysecp)
    const keyPair = ECPair.fromWIF(BITCOIN_WIF, NETWORK)
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(keyPair.publicKey),
      network: NETWORK,
    })

    if (!address) throw new Error('Failed to derive wallet address')
    logWallet(address)

    // Step 2: Initialize client and fetch metadata
    const rango = new RangoClient(API_KEY)
    const metadata = await rango.getAllMetadata()
    logMeta(metadata)

    // Step 3: Select tokens for routing
    const sourceToken = findToken(
      metadata.tokens,
      SOURCE_CHAIN,
      SOURCE_TOKEN_ADDR
    )
    const targetToken = findToken(
      metadata.tokens,
      TARGET_CHAIN,
      TARGET_TOKEN_ADDR
    )
    logSelectedTokens(sourceToken, targetToken)

    // Step 4: Request possible routes
    const routeRequest: BestRouteRequest = {
      from: sourceToken,
      to: targetToken,
      amount: AMOUNT,
      slippage: SLIPPAGE,
      maxLength: MAX_STEPS,
      transactionTypes: [TransactionType.TRANSFER],
      selectedWallets: {},
    }
    const routeResponse = await rango.getAllRoutes(routeRequest)
    logRoutes(routeResponse)
    if (!routeResponse.results.length) {
      throw new Error(`No routes available: ${routeResponse.error}`)
    }

    // Step 5: Confirm the chosen route
    const chosen = routeResponse.results[0]
    const walletsMap = chosen.swaps
      .flatMap((s) => [s.from.blockchain, s.to.blockchain])
      .filter((value, index, self) => self.indexOf(value) === index)
      .reduce(
        (acc, chain) => ({
          ...acc,
          [chain]: chain === SOURCE_CHAIN ? address : EVM_ADDRESS,
        }),
        {} as Record<string, string>
      )
    const confirmResponse = await rango.confirmRoute({
      requestId: chosen.requestId,
      selectedWallets: walletsMap,
    })

    const confirmedRoute = confirmResponse.result

    if (!confirmedRoute) {
      throw new Error(`Error in confirming route, ${confirmResponse.error}`)
    }

    logConfirmedRoute(confirmedRoute)

    // Step 6: Validate balances and fees
    for (const val of confirmedRoute?.validationStatus || []) {
      for (const wallet of val.wallets) {
        for (const asset of wallet.requiredAssets) {
          if (!asset.ok) {
            throw new Error(
              `Insufficient ${asset.reason}: need ${asset.requiredAmount.amount}, have ${asset.currentAmount.amount}`
            )
          }
        }
      }
    }

    // Step 7: Create transaction
    const txRequest: CreateTransactionRequest = {
      requestId: confirmedRoute.requestId,
      step: STEP_INDEX,
      userSettings: { slippage: SLIPPAGE, infiniteApprove: false },
      validations: { approve: true, balance: false, fee: false },
    }
    const { transaction } = await rango.createTransaction(txRequest)
    const swapSteps = confirmedRoute?.result?.swaps
    if (
      transaction?.type !== 'TRANSFER' ||
      !transaction.psbt ||
      !swapSteps ||
      swapSteps.length > MAX_STEPS
    ) {
      throw new Error('Transaction creation failed')
    }

    // Step 8: Sign and finalize PSBT
    const psbt = bitcoin.Psbt.fromBase64(transaction.psbt.unsignedPsbtBase64)
    const signer: bitcoin.Signer = {
      publicKey: Buffer.from(keyPair.publicKey),
      sign: (hash: Buffer) => Buffer.from(keyPair.sign(Uint8Array.from(hash))),
    }
    transaction.psbt.inputsToSign.forEach((input) =>
      input.signingIndexes.forEach((i) => psbt.signInput(i, signer))
    )
    psbt.finalizeAllInputs()
    const rawTx = psbt.extractTransaction().toHex()

    // Step 9: Broadcast raw transaction
    const response = await fetch(BTC_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'sendrawtransaction', params: [rawTx] }),
    })
    if (!response.ok) throw new Error(`Network error: ${await response.text()}`)
    const { result: txId } = await response.json()
    logTransactionHash(txId, false)

    // Step 10: Monitor execution status
    while (true) {
      await setTimeout(10_000)
      const statusResponse = await rango.checkStatus({
        requestId: confirmedRoute.requestId,
        txId,
        step: STEP_INDEX,
      })
      logStepStatus(statusResponse)
      if (statusResponse.status === TransactionStatus.SUCCESS) break
      if (statusResponse.status === TransactionStatus.FAILED) {
        throw new Error(`Step ${STEP_INDEX} failed`)
      }
    }
  } catch (err) {
    console.error('Swap process encountered an error:', err)
    process.exit(1)
  }
}

// Start the swap process
processSwapRoutes().catch((err) => {
  console.error(err)
  process.exit(1)
})
