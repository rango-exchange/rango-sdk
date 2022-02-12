import {Amount, CosmosTransaction} from "rango-sdk"
import {BroadcastMode, makeSignDoc, makeStdTx} from "@cosmjs/launchpad";
import {SigningStargateClient} from "@cosmjs/stargate";
import {cosmos} from "@keplr-wallet/cosmos";
import {Keplr} from "@keplr-wallet/types";
import BigNumber from "bignumber.js";
import Long from "long";

// eslint-disable-next-line
const SignMode = cosmos.tx.signing.v1beta1.SignMode;
declare let window: any


const STARGATE_CLIENT_OPTIONS = {
  gasLimits: {
    send: 80000,
    ibcTransfer: 500000,
    transfer: 250000,
    delegate: 250000,
    undelegate: 250000,
    redelegate: 250000,
    // The gas multiplication per rewards.
    withdrawRewards: 140000,
    govVote: 250000,
  },
}

const uint8ArrayToHex = (buffer: Uint8Array): string => {
  // @ts-ignore
  return [...buffer]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('')
}

export const getKeplr = async (): Promise<Keplr | undefined> => {
  if (window.keplr) {
    return window.keplr
  }
  if (document.readyState === "complete") {
    return window.keplr
  }
  return new Promise((resolve) => {
    const documentStateChange = (event: Event) => {
      if (
        event.target &&
        (event.target as Document).readyState === "complete"
      ) {
        resolve(window.keplr)
        document.removeEventListener("readystatechange", documentStateChange);
      }
    }
    document.addEventListener("readystatechange", documentStateChange);
  })
}


export async function executeCosmosTransaction(cosmosTx: CosmosTransaction): Promise<string> {
  const keplr = await getKeplr()
  if (!keplr) throw new Error("keplr wallet is undefined!")

  const {memo, sequence, account_number, chainId, msgs, fee, signType, rpcUrl} = cosmosTx.data

  if (!chainId) throw Error("ChainId is undefined from server")
  if (!account_number) throw Error("account_number is undefined from server")
  if (!sequence) throw Error("Sequence is undefined from server")

  function manipulateMsg(m: any): any {
    if (!m.__type) return m
    if (m.__type === 'DirectCosmosIBCTransferMessage') {
      const result = {...m} as any
      if (result.value.timeoutTimestamp)
        result.value.timeoutTimestamp = Long.fromString(result.value.timeoutTimestamp) as any
      if (!!result.value.timeoutHeight?.revisionHeight)
        result.value.timeoutHeight.revisionHeight = Long.fromString(result.value.timeoutHeight.revisionHeight) as any
      if (!!result.value.timeoutHeight?.revisionNumber)
        result.value.timeoutHeight.revisionNumber = Long.fromString(result.value.timeoutHeight.revisionNumber) as any
      return result
    }
    return {...m}
  }

  const msgsWithoutType = msgs.map((m) => ({
    ...manipulateMsg(m),
    __type: undefined,
  }))

  if (signType === 'AMINO') {
    const signDoc = makeSignDoc(msgsWithoutType as any, fee as any, chainId, memo || undefined, account_number, sequence)
    const signResponse = await keplr.signAmino(chainId, cosmosTx.fromWalletAddress, signDoc)

    let signedTx;
    if (cosmosTx.data.protoMsgs.length > 0) {
      signedTx = cosmos.tx.v1beta1.TxRaw.encode({
        bodyBytes: cosmos.tx.v1beta1.TxBody.encode({
          messages: cosmosTx.data.protoMsgs.map(m => ({type_url: m.type_url, value: new Uint8Array(m.value)})),
          memo: signResponse.signed.memo,
        }).finish(),
        authInfoBytes: cosmos.tx.v1beta1.AuthInfo.encode({
          signerInfos: [
            {
              publicKey: {
                type_url: "/cosmos.crypto.secp256k1.PubKey",
                value: cosmos.crypto.secp256k1.PubKey.encode({
                  key: Buffer.from(
                    signResponse.signature.pub_key.value,
                    "base64"
                  ),
                }).finish(),
              },
              modeInfo: {
                single: {
                  mode: SignMode.SIGN_MODE_LEGACY_AMINO_JSON,
                },
              },
              sequence: Long.fromString(signResponse.signed.sequence),
            },
          ],
          fee: {
            amount: signResponse.signed.fee.amount as any[],
            gasLimit: Long.fromString(signResponse.signed.fee.gas),
          },
        }).finish(),
        signatures: [Buffer.from(signResponse.signature.signature, "base64")],
      }).finish()
    } else {
      signedTx = makeStdTx(signResponse.signed, signResponse.signature);
    }
    const result = await keplr.sendTx(chainId, signedTx, BroadcastMode.Async)
    return uint8ArrayToHex(result)
  } else if (signType === 'DIRECT') {
    if (!rpcUrl) throw Error("rpc url is undefined from server")

    const sendingSigner = keplr?.getOfflineSigner(chainId)
    const sendingStargateClient = await SigningStargateClient?.connectWithSigner(
      rpcUrl,
      sendingSigner,
      STARGATE_CLIENT_OPTIONS,
    )
    const feeArray = !!(fee?.amount[0]) ? [{denom: fee.amount[0].denom, amount: fee?.amount[0].amount}] : []

    let isIbcTx = cosmosTx.data.msgs.filter(k => k.__type === "DirectCosmosIBCTransferMessage").length > 0
    let tmpGas = isIbcTx ? STARGATE_CLIENT_OPTIONS.gasLimits.ibcTransfer : STARGATE_CLIENT_OPTIONS.gasLimits.transfer

    const broadcastTxRes = await sendingStargateClient.signAndBroadcast(
      cosmosTx.fromWalletAddress,
      msgs as any,
      { gas: tmpGas.toString(), amount: feeArray },
    )
    return broadcastTxRes.transactionHash
  } else {
    throw Error(`Sign type for cosmos not supported, type: ${signType}`)
  }

}

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()

