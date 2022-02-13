import {Amount, CosmosTransaction} from "rango-sdk"
import BigNumber from "bignumber.js";
import { JSONSerializable } from '@terra-money/terra.js/dist/util/json'
import {
  Coin,
  CreateTxOptions,
  Fee,
  Msg as TerraMsg,
} from '@terra-money/terra.js'
import {StdFee} from "@terra-money/terra.js/dist/core/StdFee";


// @ts-ignore
class TerraMessageGeneralJsonSerializable extends JSONSerializable<any> {
  constructor(public raw: any) {
    super()
  }

  public static fromData(data: any): TerraMessageGeneralJsonSerializable {
    return new TerraMessageGeneralJsonSerializable(data)
  }

  toData(): any {
    const { __type, ...rest } = this.raw
    return JSON.parse(JSON.stringify(rest))
  }
}

export function cosmosTxToTerraTx(tx: CosmosTransaction): CreateTxOptions {
  let tmpStdFee: StdFee | undefined = undefined
  if (tx.data.fee) {
    let tmpCoinsFee = tx.data.fee.amount.map((item) => new Coin(item.denom, item.amount))
    tmpStdFee = new StdFee(parseInt(tx.data.fee.gas), tmpCoinsFee)
  }
  return {
    msgs: tx.data.msgs.map((m) => new TerraMessageGeneralJsonSerializable(m) as unknown as TerraMsg),
    fee: tmpStdFee as unknown as Fee,
    memo: tx.data.memo || '',
    gas: tx.data.fee?.gas,
  }
}

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()
