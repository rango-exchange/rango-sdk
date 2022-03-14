import {Amount, CosmosTransaction} from "rango-sdk"
import BigNumber from "bignumber.js"
import {
  Coin,
  CreateTxOptions,
  Msg as TerraMsg,
} from "@terra-money/terra.js"
import {JSONSerializable} from "@terra-money/terra.js/dist/util/json"
import {Fee} from "@terra-money/terra.js/dist/core"


class TerraMessageGeneralJsonSerializable extends JSONSerializable<any, any, any> {
  constructor(public raw: any) {
    super()
  }

  public static fromData(data: any): TerraMessageGeneralJsonSerializable {
    return new TerraMessageGeneralJsonSerializable(data)
  }

  toData(): any {
    const {__type, value, ...rest} = this.raw
    return JSON.parse(JSON.stringify({...rest, ...value}))
  }

  toAmino(): any {
    return this.toData()
  }

  toProto(): any {
    return this.toData()
  }
}

export function cosmosTxToTerraTx(tx: CosmosTransaction): CreateTxOptions {
  let tmpStdFee: Fee | undefined = undefined
  if (tx.data.fee) {
    let tmpCoinsFee = tx.data.fee.amount.map(item => new Coin(item.denom, item.amount))
    tmpStdFee = new Fee(parseInt(tx.data.fee.gas), tmpCoinsFee)
  }

  const msgs = tx.data.msgs.map((m: any) => (new TerraMessageGeneralJsonSerializable(m)) as unknown as TerraMsg)

  return {
    msgs,
    fee: tmpStdFee,
    memo: tx.data.memo || "",
    gas: tx.data.fee?.gas,
  }
}

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()
