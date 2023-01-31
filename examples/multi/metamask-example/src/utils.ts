import {
  BestRouteResponse,
  EvmTransaction,
  RangoClient,
  Amount
} from "rango-sdk";
import {TransactionRequest} from "@ethersproject/abstract-provider/src.ts/index";
import BigNumber from "bignumber.js";


export function prepareEvmTransaction(evmTransaction: EvmTransaction): TransactionRequest {
  const manipulatedTx = {
    ...evmTransaction,
    gasPrice: !!evmTransaction.gasPrice ? '0x' + parseInt(evmTransaction.gasPrice).toString(16) : null,
  }

  let tx = {}
  if (!!manipulatedTx.from)
    tx = { ...tx, from: manipulatedTx.from }
  if (!!manipulatedTx.to)
    tx = { ...tx, to: manipulatedTx.to }
  if (!!manipulatedTx.data)
    tx = { ...tx, data: manipulatedTx.data }
  if (!!manipulatedTx.value)
    tx = { ...tx, value: manipulatedTx.value }
  if (!!manipulatedTx.gasLimit)
    tx = { ...tx, gasLimit: manipulatedTx.gasLimit }
  if (!!manipulatedTx.gasPrice)
    tx = { ...tx, gasPrice: manipulatedTx.gasPrice }
  if (!!manipulatedTx.nonce)
    tx = { ...tx, nonce: manipulatedTx.nonce }

  return tx
}

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export async function checkApprovalSync(bestRoute: BestRouteResponse, rangoClient: RangoClient) {
  while (true) {
    const approvalResponse = await rangoClient.checkApproval(bestRoute.requestId)
    if (approvalResponse.isApproved) {
      return true
    }
    await sleep(3000)
  }
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()

