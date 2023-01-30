import { Signer } from 'ethers'
import { RangoClient } from './client'
import { EvmTransaction } from '../types/api/txs'
import {
  StatusResponse,
  SwapResponse,
  TransactionStatus,
  TransactionType,
} from '../types/api/transactions'
import { sleep } from '../utils/promise'

export function prepareEvmTransaction(
  evmTx: EvmTransaction,
  isApprove: boolean
) {
  const gasPrice =
    !!evmTx.gasPrice && !evmTx.gasPrice.startsWith('0x')
      ? '0x' + parseInt(evmTx.gasPrice).toString(16)
      : null
  const manipulatedTx = {
    ...evmTx,
    gasPrice,
  }
  let tx = {}
  if (!!manipulatedTx.from) tx = { ...tx, from: manipulatedTx.from }
  if (isApprove) {
    if (!!manipulatedTx.approveTo) tx = { ...tx, to: manipulatedTx.approveTo }
    if (!!manipulatedTx.approveData)
      tx = { ...tx, data: manipulatedTx.approveData }
  } else {
    if (!!manipulatedTx.txTo) tx = { ...tx, to: manipulatedTx.txTo }
    if (!!manipulatedTx.txData) tx = { ...tx, data: manipulatedTx.txData }
    if (!!manipulatedTx.value) tx = { ...tx, value: manipulatedTx.value }
    if (!!manipulatedTx.gasLimit)
      tx = { ...tx, gasLimit: manipulatedTx.gasLimit }
    if (!!manipulatedTx.gasPrice)
      tx = { ...tx, gasPrice: manipulatedTx.gasPrice }
  }
  return tx
}

async function checkApprovalSync(
  requestId: string,
  txId: string,
  rangoClient: RangoClient
) {
  while (true) {
    try {
      const approvalResponse = await rangoClient.isApproved(requestId, txId)
      if (approvalResponse.isApproved) return true
    } catch (err) {
      console.log('ignorinig error', { err })
    }
    await sleep(3_000)
  }
}

export const checkTransactionStatusSync = async (
  requestId: string,
  txId: string,
  rangoClient: RangoClient
) => {
  let txStatus: StatusResponse | undefined
  while (true) {
    try {
      txStatus = await rangoClient.status({
        requestId,
        txId,
      })
    } catch (err) {
      console.log('ignorinig error', { err })
    }
    if (!!txStatus) {
      if (
        !!txStatus.status &&
        [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(
          txStatus.status
        )
      ) {
        return txStatus
      }
    }
    await sleep(3_000)
  }
}

export const executeEvmRoute = async (
  client: RangoClient,
  signer: Signer,
  route: SwapResponse
): Promise<StatusResponse> => {
  const { tx, requestId, error, resultType } = route
  if (resultType != 'OK') throw new Error(resultType)
  if (!!error || !tx)
    throw new Error(error || 'Error creating the transaction.')
  if (tx?.type !== TransactionType.EVM)
    throw new Error('Non Evm transactions are not supported yet.')
  const evmTransaction = tx as EvmTransaction
  const txChainId = parseInt(evmTransaction.blockChain.chainId || '-1')
  let signerChainId = await signer.getChainId()
  if (signerChainId !== txChainId) {
    throw new Error(
      `Signer chainId ${signerChainId} doesn't match required chainId ${txChainId}.`
    )
  }
  if (!!evmTransaction.approveTo && !!evmTransaction.approveData) {
    const approveTxData = prepareEvmTransaction(evmTransaction, true)
    const approveTx = await signer.sendTransaction(approveTxData)
    approveTx.wait()
    await checkApprovalSync(requestId, approveTx.hash, client)
  }
  signerChainId = await signer.getChainId()
  if (signerChainId !== txChainId) {
    throw new Error(
      `Signer chainId ${signerChainId} doesn't match required chainId ${txChainId}.`
    )
  }
  const mainTxData = prepareEvmTransaction(evmTransaction, false)
  const mainTx = await signer.sendTransaction(mainTxData)
  mainTx.wait()
  const status = await checkTransactionStatusSync(
    requestId,
    mainTx.hash,
    client
  )
  return status
}
