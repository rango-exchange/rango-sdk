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
import { DefaultStarknetSigner } from '@rango-dev/signer-starknet'
import { Account, RpcProvider } from 'starknet';


// setup wallet 
const privateKey = 'YOUR_PRIVATE_KEY' // Replace with your private key
const walletAddress = 'YOUR_WALLET_ADDRESS' // Replace with your wallet address

// in web based apps, you could use injected provider instead
// e.g. use window.starknet_braavos or window.starknet_argentX intead
// https://starknetjs.com/docs/guides/connect_network
const provider = new RpcProvider({ nodeUrl: "https://starknet-mainnet.public.blastapi.io/rpc/v0_7" });
const account = new Account(provider, walletAddress, privateKey);

logWallet(account.address)

// initiate sdk using your api key
const API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
const rango = new RangoClient(API_KEY)

// get blockchains and tokens meta data
const meta = await rango.getAllMetadata()
logMeta(meta)

// some example tokens for test purpose
const sourceBlockchain = 'STARKNET'
const sourceTokenAddress = '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
const targetBlockchain = 'STARKNET'
const targetTokenAddress = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
const amount = '0.001'

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
  transactionTypes: [TransactionType.STARKNET],
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

  if (tx.type === TransactionType.STARKNET) {
    const defaultSigner = new DefaultStarknetSigner({ account, enable: () => { } })

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
