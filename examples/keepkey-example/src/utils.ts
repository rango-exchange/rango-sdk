import {
  BestRouteResponse,
  EvmTransaction,
  RangoClient,
  Amount
} from "rango-sdk";
import BigNumber from "bignumber.js";

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()

// @ts-ignore