// run `node --import=tsx index.ts` in the terminal

import { CreateTransactionRequest, MultiRouteRequest, RangoClient, TransactionStatus, TransactionType } from "rango-sdk";
import { findToken } from '../shared/utils/meta.js'
import { logMeta, logSelectedTokens, logWallet, logTransactionHash, logApprovalResponse, logRoutes, logStepStatus, logConfirmedRoute, logRouteStep } from "../shared/utils/logger.js";
import { TransactionRequest, ethers } from "ethers";
import { setTimeout } from 'timers/promises'
import { getRpcUrlForBlockchain } from "./rpc.js";

// setup wallet
const privateKey = 'YOUR_PRIVATE_KEY';
const wallet = new ethers.Wallet(privateKey);
const waleltAddress = wallet.address
logWallet(waleltAddress)

// initiate sdk using your api key
const API_KEY = "c6381a79-2817-4602-83bf-6a641a409e32"
const rango = new RangoClient(API_KEY)

// get blockchains and tokens meta data
const meta = await rango.getAllMetadata()
logMeta(meta)

// some example tokens for test purpose
const sourceBlockchain = "BSC"
const sourceTokenAddress = "0x55d398326f99059ff775485246999027b3197955"
const targetBlockchain = "AVAX_CCHAIN"
const targetTokenAddress = null
const amount = "0.001"

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
  transactionTypes: [TransactionType.EVM]
}
const routingResponse = await rango.getAllRoutes(routingRequest)

logRoutes(routingResponse)

if (routingResponse.results.length === 0) {
  throw new Error(`No routes found! ${routingResponse.error}`)
}

// confirm one of the routes
const selectedRoute = routingResponse.results[0]


const selectedWallets = selectedRoute.swaps
  .flatMap(swap => [swap.from.blockchain, swap.to.blockchain])
  .filter((blockchain, index, self) => self.indexOf(blockchain) === index)
  .map(blockchain => ({ [blockchain]: waleltAddress }))
  .reduce((acc, obj) => {
    return { ...acc, ...obj };
  }, {});

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

  // set rpc provider for this step
  const rpcProvider = new ethers.JsonRpcProvider(getRpcUrlForBlockchain(meta, swap.from.blockchain));
  const walletWithProvider = wallet.connect(rpcProvider);

  const request: CreateTransactionRequest = {
    requestId: confirmedRoute.requestId,
    step: step,
    userSettings: {
      slippage: '1.0',
      infiniteApprove: false
    },
    validations: {
      approve: true,
      balance: false,
      fee: false,
    }
  }
  let createTransactionResponse = await rango.createTransaction(request)
  let tx = createTransactionResponse.transaction
  if (!tx) {
    throw new Error(`Error creating the transaction ${createTransactionResponse.error}`)
  }

  if (tx.type === TransactionType.EVM) {
    if (tx.isApprovalTx) {
      // sign the approve transaction
      const approveTransaction: TransactionRequest = {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: tx.value,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        gasPrice: tx.gasPrice,
        gasLimit: tx.gasLimit,
      }
      const { hash } = await walletWithProvider.sendTransaction(approveTransaction);
      logTransactionHash(hash, true)

      // wait for approval
      while (true) {
        await setTimeout(5_000)
        const { isApproved, currentApprovedAmount, requiredApprovedAmount, txStatus } = await rango.checkApproval(confirmedRoute.requestId, hash)
        logApprovalResponse(isApproved)
        if (isApproved)
          break
        else if (txStatus === TransactionStatus.FAILED)
          throw new Error('Approve transaction failed in blockchain')
        else if (txStatus === TransactionStatus.SUCCESS)
          throw new Error(`Insufficient approve, current amount: ${currentApprovedAmount}, required amount: ${requiredApprovedAmount}`)
      }

      // create the main transaction if previous one was approval transaction
      createTransactionResponse = await rango.createTransaction(request)
      tx = createTransactionResponse.transaction
      if (!tx || tx.type !== TransactionType.EVM) {
        throw new Error(`Error creating the transaction ${createTransactionResponse.error}`)
      }
    }

    // sign the main transaction
    const mainTransaction: TransactionRequest = {
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      gasPrice: tx.gasPrice,
      gasLimit: tx.gasLimit,
    }
    const { hash } = await walletWithProvider.sendTransaction(mainTransaction);
    logTransactionHash(hash, false)

    // track swap status
    while (true) {
      await setTimeout(10_000)
      const state = await rango.checkStatus({
        requestId: confirmedRoute.requestId,
        step,
        txId: hash
      })
      logStepStatus(state)

      const status = state.status
      if (status === TransactionStatus.SUCCESS) {
        // we could proceed with the next step of the route
        step += 1;
        break
      } else if (status === TransactionStatus.FAILED) {
        throw new Error(`Swap failed on step ${step}`)
      }
    }
  }
}
