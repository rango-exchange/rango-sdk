import {RangoClient, EvmTransaction, Amount} from "rango-sdk-basic";
import {TransactionRequest} from "@ethersproject/abstract-provider/src.ts/index";
import BigNumber from "bignumber.js";


export function prepareEvmTransaction(evmTransaction: EvmTransaction, isApprove: boolean): TransactionRequest {
  const manipulatedTx = {
    ...evmTransaction,
    gasPrice: !!evmTransaction.gasPrice && !evmTransaction.gasPrice.startsWith('0x') ?
      '0x' + parseInt(evmTransaction.gasPrice).toString(16) : null,
  }

  let tx = {}
  if (!!manipulatedTx.from)
    tx = { ...tx, from: manipulatedTx.from }
  if (isApprove) {
    if (!!manipulatedTx.approveTo)
      tx = {...tx, to: manipulatedTx.approveTo}
    if (!!manipulatedTx.approveData) {
      tx = {...tx, data: manipulatedTx.approveData}
    }
  } else {
    if (!!manipulatedTx.txTo)
      tx = { ...tx, to: manipulatedTx.txTo }
    if (!!manipulatedTx.txData)
      tx = { ...tx, data: manipulatedTx.txData }
    if (!!manipulatedTx.value)
      tx = { ...tx, value: manipulatedTx.value }
    if (!!manipulatedTx.gasLimit)
      tx = { ...tx, gasLimit: manipulatedTx.gasLimit }
    if (!!manipulatedTx.gasPrice)
      tx = { ...tx, gasPrice: manipulatedTx.gasPrice }
  }

  return tx
}

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export async function checkApprovalSync(requestId: string, txId: string, rangoClient: RangoClient) {
  while (true) {
    const approvalResponse = await rangoClient.isApproved(requestId, txId)
    if (approvalResponse.isApproved) {
      return true
    }
    await sleep(3000)
  }
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()

