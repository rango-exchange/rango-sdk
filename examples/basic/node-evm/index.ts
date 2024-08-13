// run `node --import=tsx index.ts` in the terminal

import { RangoClient, TransactionStatus, TransactionType } from "rango-sdk-basic";
import { findToken } from '../shared/utils/meta.js'
import { logMeta, logSelectedTokens, logQuote, logWallet, logSwap, logSwapStatus, logTransactionHash, logApprovalResponse } from "../shared/utils/logger.js";
import { TransactionRequest, ethers } from "ethers";
import { setTimeout } from 'timers/promises'

// setup wallet & RPC provider
// please change rpc provider url if you want to test another chain rather than BSC
const privateKey = 'YOUR_PRIVATE_KEY';
const wallet = new ethers.Wallet(privateKey);
const rpcProvider = new ethers.JsonRpcProvider('https://bsc-dataseed1.defibit.io');
const walletWithProvider = wallet.connect(rpcProvider);
logWallet(walletWithProvider.address)

// initiate sdk using your api key
const API_KEY = "c6381a79-2817-4602-83bf-6a641a409e32"
const rango = new RangoClient(API_KEY)

// get blockchains and tokens meta data
const meta = await rango.meta()
logMeta(meta)

// some example tokens for test purpose
const sourceBlockchain = "BSC"
const sourceTokenAddress = "0x55d398326f99059ff775485246999027b3197955"
const targetBlockchain = "BSC"
const targetTokenAddress = null
const amount = "10000000000000"

// find selected tokens in meta.tokens
const sourceToken = findToken(meta.tokens, sourceBlockchain, sourceTokenAddress)
const targetToken = findToken(meta.tokens, targetBlockchain, targetTokenAddress)
logSelectedTokens(sourceToken, targetToken)

// get quote
const quoteRequest = {
  from: sourceToken,
  to: targetToken,
  amount,
  slippage: 1.0,
}
const quote = await rango.quote(quoteRequest)
logQuote(quote)

const swapRequest = {
  ...quoteRequest,
  fromAddress: wallet.address,
  toAddress: wallet.address,
}

// create transaction
const swap = await rango.swap(swapRequest)
logSwap(swap)

const tx = swap.tx

if (!tx) {
  throw new Error(`Error creating the transaction ${swap.error}`)
}

if (tx.type === TransactionType.EVM) {
  if (tx.approveData && tx.approveTo) {
    // sign the approve transaction
    const approveTransaction: TransactionRequest = {
      from: tx.from,
      to: tx.approveTo,
      data: tx.approveData,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      gasPrice: tx.gasPrice,
    }
    const { hash } = await walletWithProvider.sendTransaction(approveTransaction);
    logTransactionHash(hash, true)

    // wait for approval
    while (true) {
      await setTimeout(10_000)
      const { isApproved, currentApprovedAmount, requiredApprovedAmount, txStatus } = await rango.isApproved(swap.requestId, hash)
      logApprovalResponse(isApproved)
      if (isApproved)
        break
      else if (txStatus === TransactionStatus.FAILED)
        throw new Error('Approve transaction failed in blockchain')
      else if (txStatus === TransactionStatus.SUCCESS)
        throw new Error(`Insufficient approve, current amount: ${currentApprovedAmount}, required amount: ${requiredApprovedAmount}`)
    }
  }

  // signing the main transaction
  const transaction: TransactionRequest = {
    from: tx.from,
    to: tx.txTo,
    data: tx.txData,
    value: tx.value,
    gasLimit: tx.gasLimit,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    gasPrice: tx.gasPrice,
  }
  const { hash } = await walletWithProvider.sendTransaction(transaction);
  logTransactionHash(hash, false)

  // track swap status
  while (true) {
    await setTimeout(10_000)
    const state = await rango.status({
      requestId: swap.requestId,
      txId: hash
    })
    logSwapStatus(state)

    const status = state.status
    if (status && [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(status)) {
      break
    }
  }
}