/*
    KeepKey Rango Trade Example:

    KeepKey SDK
    ref: https://github.com/shapeshift/hdwallet

    buy a keepkey today:
      https://keepkey.myshopify.com/discount/9MRH10GH8PW0
          -50pct off first

                                -Highlander
 */
import dotenv from 'dotenv'
import './App.css';
import {useEffect, useState} from "react"
import {
  BestRouteResponse,
  EvmTransaction,
  MetaResponse,
  RangoClient,
  TransactionStatus,
  TransactionStatusResponse,
  WalletRequiredAssets
} from "rango-sdk"
// import {checkApprovalSync, prepareEvmTransaction, prettyAmount, sleep} from "./utils";
import { metaInfoMock, prettyAmount, sleep } from "./utils";
import { numberToHex } from 'web3-utils'

//hdwallet sdk
import * as core from "@shapeshiftoss/hdwallet-core";
import * as keepkey from "@shapeshiftoss/hdwallet-keepkey";
import * as keepkeyWebUSB from "@shapeshiftoss/hdwallet-keepkey-webusb";
const keyring = new core.Keyring();
const keepkeyAdapter = keepkeyWebUSB.WebUSBKeepKeyAdapter.useKeyring(keyring);
//end hdwallet sdk

//requires
const coinSelect = require('coinselect')
let {
  xpubConvert,
  bip32ToAddressNList
} = require('@pioneer-platform/pioneer-coins')
//pioneer SDK (network calls)
let pioneerApi = require("@pioneer-platform/pioneer-client")
const config = {
  queryKey:'sdk:2d0ec79c-6733-4235-9b09-9b87171edc16',
  username:"rango-example-keepkey",
  // spec:"https://pioneers.dev/spec/swagger.json"
  spec:"http://localhost:9001/spec/swagger.json"
}

//globals
dotenv.config()
declare let window: any

//mock info TODO moveme

// let TEST_AMOUNT = "0.003"
let TEST_AMOUNT = ".5"

export const App = () => {
  const RANGO_API_KEY = process.env['RANGO_API_KEY'] || '' // put your RANGO-API-KEY here

  const rangoClient = new RangoClient(RANGO_API_KEY)
  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [inputAmount, setInputAmount] = useState<string>(TEST_AMOUNT)
  const [bestRoute, setBestRoute] = useState<BestRouteResponse | null>()
  const [txStatus, setTxStatus] = useState<TransactionStatusResponse | null>(null)
  const [requiredAssets, setRequiredAssets] = useState<WalletRequiredAssets[]>([])
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true)
  const [loadingSwap, setLoadingSwap] = useState<boolean>(false)
  const [showPin, setShowPin] = useState<boolean>(false)
  const [keepkeyUnlocked, setKeepKeyUnlocked] = useState<boolean>(false)
  const [pin, setPinValue] = useState<string>("")
  const [error, setError] = useState<string>("")

  useEffect(() => {
    //note this hits multiple times
    //will spam rango past rate limits
  }, [])


  const usdtAddressInPolygon = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'
  const usdtToken = tokensMeta?.tokens.find(t => t.blockchain === "POLYGON" && t.address === usdtAddressInPolygon)
  const maticToken = tokensMeta?.tokens.find(t => t.blockchain === "POLYGON" && t.address === null)

  // BTC -> ETH
  // const inputAsset = tokensMeta?.tokens.find(t => t.blockchain === "BTC")
  // const outputAsset = tokensMeta?.tokens.find(t => t.blockchain === "ETH")

  // ETH -> BTC
  // const inputAsset = tokensMeta?.tokens.find(t => t.blockchain === "ETH")
  // const outputAsset = tokensMeta?.tokens.find(t => t.blockchain === "BTC")

  // ATOM -> OSMO
  const inputAsset = tokensMeta?.tokens.find(t => t.blockchain === "COSMOS" && t.symbol === "ATOM")
  const outputAsset = tokensMeta?.tokens.find(t => t.blockchain === "OSMOSIS" && t.symbol === "OSMO")

  //TODO
  // OSMO -> ATOM

  // ETH -> AVAX

  // AVAX -> ETH

  // ETH -> BSC

  // BSC -> ETH

  // AVAX -> BSC

  console.log("inputAsset: ",inputAsset)
  console.log("outputAsset: ",outputAsset)

  const onConnect = async () => {
    try{
      let wallet = await keepkeyAdapter.pairDevice(undefined, /*tryDebugLink=*/ true);
      console.log("Wallet: ",wallet)
      window["wallet"] = wallet;

      //sub to pioneer
      let pioneer = new pioneerApi(config.spec,config)
      window["pioneer"] = await pioneer.init()

      //test pioneer
      let status = await window["pioneer"].instance.Health()
      if(!status.data.online) throw Error("Pioneer Server offline!")
      console.log("pioneer status: ",status.data)


      //listen to events
      keyring.on(["*", "*", core.Events.PIN_REQUEST], () => {
        console.log("openPin!")
        setShowPin(true)
      });

      //get rango data
      setLoadingMeta(true)
      // Meta provides all blockchains, tokens and swappers information supported by Rango

      //get live data
      // let metaInfo = await rangoClient.getAllMetadata()
      //note: this data is static, and endpoint fragile better to mock
      let metaInfo = metaInfoMock

      //metaInfo
      console.log("metaInfo: ",metaInfo)
      // @ts-ignore
      setTokenMeta(metaInfo)
      setLoadingMeta(false)

      return "bla"
    }catch(e){
      console.error("e: ",e)
      alert("Unable to connect! e: "+e)
      console.error(e)
    }
  }

  const getUserWallet = async () => {
    //dev helper
    // window.wallet.removePin()

    //get BTC address

    //get xpub
    const pubkeys = await window.wallet.getPublicKeys([
      {
        addressNList: [0x80000000 + 84, 0x80000000 + 0, 0x80000000 + 0],
        curve: "secp256k1",
        showDisplay: false, // Not supported by TrezorConnect or Ledger, but KeepKey should do it
        coin: "Bitcoin",
      }
    ]);
    console.log("pubkeys: ",pubkeys)
    let btcXpub = pubkeys[0].xpub
    //convert to zpub
    btcXpub = xpubConvert(btcXpub,"zpub")
    console.log("btcXpub: ",btcXpub)

    let btcAddress = await window.wallet.btcGetAddress({
      addressNList: [0x80000000 + 84, 0x80000000 + 0, 0x80000000 + 0, 0, 0],
      coin: "Bitcoin",
      scriptType: core.BTCInputScriptType.SpendWitness,
      showDisplay: false,
    })
    console.log("btcAddress: ",btcAddress)

    //get ETH address
    let { hardenedPath, relPath } = await window.wallet.ethGetAccountPaths({
      coin: "Ethereum",
      accountIdx: 0,
    })[0];
    let ethAddress = await window.wallet.ethGetAddress({
      addressNList: hardenedPath.concat(relPath),
      showDisplay: false,
    });
    console.log("ethAddress: ",ethAddress)

    //get osmo
    // let { addressNList } = window.wallet.osmosisGetAccountPaths({ accountIdx: 0 })[0];
    // let osmoAddress = await window.wallet.osmosisGetAddress({
    //   addressNList,
    //   showDisplay: false,
    // });
    let osmoAddress = "osmo1k0kzs2ygjsext3hx7mf00dfrfh8hl3e85s23kn"

    let { addressNList } = window.wallet.cosmosGetAccountPaths({ accountIdx: 0 })[0];
    let cosmosAddress = await window.wallet.cosmosGetAddress({
      addressNList,
      showDisplay: false,
    });

    return {
      "BTC":btcAddress,
      "BTC-XPUB":btcXpub,
      "ETH":ethAddress,
      "ATOM": cosmosAddress,
      "OSMO": osmoAddress
    }
  }

  const swap = async () => {
    setError("")
    setBestRoute(null)
    setTxStatus(null)
    setRequiredAssets([])
    let userAddresses:any = {}

    try {
      userAddresses = await getUserWallet()
      console.log("userAddresses: ",userAddresses)
    } catch (err) {
      console.error("err: ",err)
      setError('Error connecting to KeepKey.'+err)
      return
    }

    if (!userAddresses.BTC) {
      setError(`Could not get wallet BTC address.`)
      return
    }

    if (!userAddresses.ETH) {
      setError(`Could not get wallet ETH address.`)
      return
    }

    if (!inputAmount) {
      setError(`Set input amount`)
      return
    }

    setLoadingSwap(true)
    const connectedWallets = [
      // {blockchain: 'BTC', addresses: [userAddresses.BTC]},
      // {blockchain: 'ETH', addresses: [userAddresses.ETH]}
      {blockchain: 'COSMOS', addresses: [userAddresses.ATOM]},
      {blockchain: 'OSMOSIS', addresses: [userAddresses.OSMO]}
    ]
    // const selectedWallets:any = [
    //   {blockchain: 'ETH', accounts: [{address:userAddresses.ETH}]},
    //   {blockchain: 'BTC', accounts: [{address:userAddresses.BTC}]}
    // ]

    const selectedWallets = {
      // "BTC":userAddresses.BTC,
      // "ETH":userAddresses.ETH,
      "COSMOS":userAddresses.ATOM,
      "OSMOSIS":userAddresses.OSMO,
    }
    console.log("selectedWallets: ",selectedWallets)

    // const from = {blockchain: usdtToken?.blockchain, symbol: usdtToken?.symbol, address: usdtToken.address}
    // const to = {blockchain: maticToken?.blockchain, symbol: maticToken?.symbol, address: maticToken.address}

    //BTC -> ETH
    // const from = {blockchain: "BTC", symbol: "BTC", address: null}
    // const to = {blockchain: "ETH", symbol: "ETH", address: null}

    //ETH -> BTC
    // const from = {blockchain: "ETH", symbol: "ETH", address: null}
    // const to = {blockchain: "BTC", symbol: "BTC", address: null}

    //ATOM -> OSMO
    const from = {blockchain: "COSMOS", symbol: "ATOM", address: null}
    const to = {blockchain: "OSMOSIS", symbol: "OSMO", address: null}

    // If you just want to show route to user, set checkPrerequisites: false.
    // Also for multi steps swap, it is faster to get route first with {checkPrerequisites: false} and if users confirms.
    // check his balance with {checkPrerequisites: true} in another get best route request
    let body = {
      amount: inputAmount,
      affiliateRef: null,
      checkPrerequisites: true,
      connectedWallets,
      from,
      selectedWallets,
      to,
    }
    console.log("body: ",body)
    const bestRoute = await rangoClient.getBestRoute(body)
    setBestRoute(bestRoute)

    console.log({bestRoute})
    // if (!bestRoute || !bestRoute?.result || !bestRoute?.result?.swaps || bestRoute.result?.swaps?.length === 0) {
    //   setError(`Invalid route response from server, please try again.`)
    //   setLoadingSwap(false)
    //   return
    // }

    //TODO
    // const requiredCoins =
    //   bestRoute.validationStatus?.flatMap(v => v.wallets.flatMap(w => w.requiredAssets)) || []
    // setRequiredAssets(requiredCoins)
    // const hasEnoughBalance = requiredCoins?.map(it => it.ok).reduce((a, b) => a && b)
    //
    // if (!hasEnoughBalance) {
    //   setError(`Not enough balance or fee!`)
    //   setLoadingSwap(false)
    //   return
    // }

    if (bestRoute) {
      await executeRoute(bestRoute,userAddresses)
    }
  }

  /*
      // example ETH -> AVAX



      // example ATOM -> OSMO
      {
        "ok": true,
        "error": null,
        "transaction": {
            "type": "COSMOS",
            "fromWalletAddress": "cosmos1qjwdyn56ecagk8rjf7crrzwcyz6775cj89njn3",
            "blockChain": "COSMOS",
            "data": {
                "chainId": "cosmoshub-4",
                "account_number": 487,
                "sequence": "175",
                "msgs": [
                    {
                        "__type": "CosmosIBCTransferMessage",
                        "type": "cosmos-sdk/MsgTransfer",
                        "value": {
                            "source_port": "transfer",
                            "source_channel": "channel-141",
                            "token": {
                                "denom": "uatom",
                                "amount": "500000"
                            },
                            "sender": "cosmos1qjwdyn56ecagk8rjf7crrzwcyz6775cj89njn3",
                            "receiver": "osmo1k0kzs2ygjsext3hx7mf00dfrfh8hl3e85s23kn",
                            "timeout_height": {},
                            "timeout_timestamp": "1653084192254000000"
                        }
                    }
                ],
                "protoMsgs": [
                    {
                        "type_url": "/ibc.applications.transfer.v1.MsgTransfer",
                        "value": [
                            10, 8, 116, 114, 97, 110, 115, 102, 101, 114, 18, 11, 99, 104, 97, 110, 110, 101, 108, 45, 49, 52, 49, 26, 15, 10, 5, 117, 97, 116, 111, 109, 18, 6, 53, 48, 48, 48, 48, 48, 34, 45, 99, 111, 115, 109, 111, 115, 49, 113, 106, 119, 100, 121, 110, 53, 54, 101, 99, 97, 103, 107, 56, 114, 106, 102, 55, 99, 114, 114, 122, 119, 99, 121, 122, 54, 55, 55, 53, 99, 106, 56, 57, 110, 106, 110, 51, 42, 43, 111, 115, 109, 111, 49, 107, 48, 107, 122, 115, 50, 121, 103, 106, 115, 101, 120, 116, 51, 104, 120, 55, 109, 102, 48, 48, 100, 102, 114, 102, 104, 56, 104, 108, 51, 101, 56, 53, 115, 50, 51, 107, 110, 50, 0, 56, -128, -9, -13, -8, -121, -22, -69, -8, 22
                        ]
                    }
                ],
                "memo": "",
                "source": null,
                "fee": {
                    "gas": "1200000",
                    "amount": [
                        {
                            "denom": "uatom",
                            "amount": "15000"
                        }
                    ]
                },
                "signType": "AMINO",
                "rpcUrl": null
            },
            "rawTransfer": null
        }
    }

      //example BTC -> ETH
      {
          "ok": true,
          "error": null,
          "transaction": {
              "type": "TRANSFER",
              "method": "transfer",
              "fromWalletAddress": "bc1qs7ek0m3ah0xhn9a2txxrgvcw50clnvuhymx87h",
              "recipientAddress": "bc1qsdnrzs8ra763pmq3agy62k2p3wmcfnte902wkw",
              "memo": "=:ETH.ETH:0x33b35c665496bA8E71B22373843376740401F106:431361",
              "amount": "100000",
              "decimals": 8,
              "asset": {
                  "blockchain": "BTC",
                  "symbol": "BTC",
                  "address": null,
                  "ticker": "BTC"
              }
          }
      }

      //Example ETH -> BTC
      {
        "ok": true,
        "error": null,
        "transaction": {
            "type": "EVM",
            "blockChain": "ETH",
            "isApprovalTx": false,
            "from": null,
            "to": "0x3624525075b88B24ecc29CE226b0CEc1fFcB6976",
            "data": "0x1fece7b4000000000000000000000000765cf1c8ea1bb68333340baebca791f27ca36d120000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002386f26fc100000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000003a3d3a4254432e4254433a626331717337656b306d3361683078686e39613274787872677663773530636c6e767568796d783837683a3338353237000000000000",
            "value": "0x2386f26fc10000",
            "gasLimit": null,
            "gasPrice": null,
            "nonce": null
        }
    }
   */

  const executeRoute = async (routeResponse: BestRouteResponse, selectedWallets:any) => {
    try {
      console.log("routeResponse: ",routeResponse)
      const transactionResponse = await rangoClient.createTransaction({
        requestId: routeResponse.requestId,
        step: 1, // In this example, we assumed that route has only one step
        userSettings: { 'slippage': '1' },
        validations: { balance: true, fee: true },
      })
      console.log("transactionResponse: ",transactionResponse)

      //switch by type
      if(!transactionResponse?.transaction?.type) throw Error("Invalid transactionResponse!")
      const expr = transactionResponse.transaction.type;
      switch (expr) {
        case 'EVM':
          console.log('EVM Tx type');
          //get account info
          let from = selectedWallets['ETH']
          let gas_limit = 80000

          //get nonce
          let nonceRemote = await window['pioneer'].instance.GetNonce(from)
          nonceRemote = nonceRemote.data

          //get gas price
          let gas_price = await window['pioneer'].instance.GetGasPrice()
          gas_price = gas_price.data

          let nonce = nonceRemote // || override (for Replace manual Tx)

          // @ts-ignore Generic Transaction type incorrect
          if(!transactionResponse?.transaction?.value) throw Error("Invalid EVM Tx missing value")
          // @ts-ignore
          let value = transactionResponse.transaction.value

          // @ts-ignore Generic Transaction type incorrect
          if(!transactionResponse?.transaction?.to) throw Error("Invalid EVM Tx missing to")
          // @ts-ignore
          let to = transactionResponse.transaction.to

          // @ts-ignore Generic Transaction type incorrect
          if(!transactionResponse?.transaction?.data) throw Error("Invalid EVM Tx missing data")
          // @ts-ignore
          let data = transactionResponse.transaction.data

          //sign
          let ethTx = {
              // addressNList: support.bip32ToAddressNList(masterPathEth),
              "addressNList":[
                  2147483692,
                  2147483708,
                  2147483648,
                  0,
                  0
              ],
              nonce: numberToHex(nonce),
              gasPrice: numberToHex(gas_price),
              gasLimit: numberToHex(gas_limit),
              value,
              to,
              data,
              // chainId: 1,//TODO more networks
          }
          let signedTx = await window['wallet'].ethSignTx(ethTx)
          console.log("signedTx: ",signedTx)

          //broadcast TX
          let broadcastBody = {
            network:"ETH",
            serialized:signedTx.serialized,
            txid:"unknown",
            invocationId:"unknown"
          }
          let resultBroadcast = await window['pioneer'].instance.Broadcast(null,broadcastBody)
          console.log("resultBroadcast: ",resultBroadcast)

          break;
        case 'TRANSFER':
          console.log("selectedWallets",selectedWallets)
          //get btc fee rate
          let feeRateInfo = await window['pioneer'].instance.GetFeeInfo({coin:"BTC"})
          feeRateInfo = feeRateInfo.data
          console.log("feeRateInfo: ",feeRateInfo)

          //get unspent from xpub
          let unspentInputs = await window['pioneer'].instance.ListUnspent({network:"BTC",xpub:selectedWallets["BTC-XPUB"]})
          unspentInputs = unspentInputs.data
          console.log("unspentInputs: ",unspentInputs)

          //prepaire coinselect
          let utxos = []
          for(let i = 0; i < unspentInputs.length; i++){
              let input = unspentInputs[i]
              let utxo = {
                  txId:input.txid,
                  vout:input.vout,
                  value:parseInt(input.value),
                  nonWitnessUtxo: Buffer.from(input.hex, 'hex'),
                  hex: input.hex,
                  tx: input.tx,
                  path:input.path
              }
              utxos.push(utxo)
          }

          //if no utxo's
          if (utxos.length === 0){
              throw Error("101 YOUR BROKE! no UTXO's found! ")
          }

          //validate amount
          // @ts-ignore Generic Transaction type incorrect
          if(!transactionResponse?.transaction?.amount) throw Error("Invalid transfer Tx missing amount")
          // @ts-ignore Generic Type wrong
          let amountSat = parseInt(transactionResponse?.transaction?.amount)
          console.log("amountSat: ",amountSat)

          //coinselect
          // @ts-ignore Generic Transaction type incorrect
          if(!transactionResponse?.transaction?.amount) throw Error("Invalid transfer Tx missing amount")
          // @ts-ignore
          let toAddress = transactionResponse?.transaction?.recipientAddress

          let targets = [
              {
                  address:toAddress,
                  value: amountSat
              }
          ]

          // @ts-ignore Generic Transaction type incorrect
          if(!transactionResponse?.transaction?.memo) throw Error("Invalid transfer Tx missing memo")
          // @ts-ignore
          let memo = transactionResponse?.transaction?.memo

          //coinselect
          console.log("input coinSelect: ",{utxos, targets, feeRateInfo})
          let selectedResults = coinSelect(utxos, targets, feeRateInfo)
          console.log("result coinselect algo: ",selectedResults)

          //if fee > available
          if(!selectedResults.inputs){
              throw Error("Fee exceeded total available inputs!")
          }

          //buildTx
          let inputs = []
          for(let i = 0; i < selectedResults.inputs.length; i++){
              //get input info
              let inputInfo = selectedResults.inputs[i]
              console.log("inputInfo: ",inputInfo)
              let input = {
                  addressNList:bip32ToAddressNList(inputInfo.path),
                  scriptType:core.BTCInputScriptType.SpendWitness,
                  amount:String(inputInfo.value),
                  vout:inputInfo.vout,
                  txid:inputInfo.txId,
                  segwit:false,
                  hex:inputInfo.hex,
                  tx:inputInfo.tx
              }
              inputs.push(input)
          }

          //TODO dont re-use addresses bro
          //get change address
          // let changeAddressIndex = await window['pioneer'].instance.GetChangeAddress(null,{network:"BTC",xpub:selectedWallets["BTC-XPUB"]})
          // changeAddressIndex = changeAddressIndex.data.changeIndex
          // console.log("changeAddressIndex: ",changeAddressIndex)
          //
          // //let changePath
          // let changePath =

          //use master (hack)
          let changeAddress = selectedWallets['BTC']
          console.log("changeAddress: ",changeAddress)

          const outputsFinal:any = []
          console.log("selectedResults.outputs: ",selectedResults.outputs)
          console.log("outputsFinal: ",outputsFinal)
          for(let i = 0; i < selectedResults.outputs.length; i++){
              let outputInfo = selectedResults.outputs[i]
              console.log("outputInfo: ",outputInfo)
              if(outputInfo.address){
                  //not change
                  let output = {
                      address:toAddress,
                      addressType:"spend",
                      scriptType:core.BTCInputScriptType.SpendWitness,
                      amount:String(outputInfo.value),
                      isChange: false,
                  }
                  if(output.address)outputsFinal.push(output)
              } else {
                  //change
                  let output = {
                      address:changeAddress,
                      addressType:"spend",
                      scriptType:core.BTCInputScriptType.SpendWitness,
                      amount:String(outputInfo.value),
                      isChange: true,
                  }
                if(output.address)outputsFinal.push(output)
              }
            console.log(i,"outputsFinal: ",outputsFinal)
          }
          console.log("outputsFinal: ",outputsFinal)
          //why!?!? wtf witchcraft. where third element coming from?
          outputsFinal.pop()
          console.log("outputsFinal: ",outputsFinal)
          //buildTx
          let hdwalletTxDescription = {
              opReturnData:memo,
              coin: 'Bitcoin',
              inputs,
              outputs:outputsFinal,
              version: 1,
              locktime: 0,
          }

          //signTx
          console.log("**** hdwalletTxDescription: ",hdwalletTxDescription)
          let signedTxTransfer = await window['wallet'].btcSignTx(hdwalletTxDescription)
          console.log("signedTxTransfer: ",signedTxTransfer)

          //broadcastTx
          //broadcast TX
          let broadcastBodyTransfer = {
            network:"BTC",
            serialized:signedTxTransfer.serializedTx,
            txid:"unknown",
            invocationId:"unknown"
          }
          let resultBroadcastTransfer = await window['pioneer'].instance.Broadcast(null,broadcastBodyTransfer)
          console.log("resultBroadcast: ",resultBroadcastTransfer)

          break;
        case 'COSMOS':
          //blockchain
          let blockchain = transactionResponse.transaction.type

          //
          if(blockchain === 'COSMOS'){
            let tx = {
              "account_number": "16359",
              "chain_id": "cosmoshub-4",
              "sequence": "39",
              "fee": {
                "amount": [
                  {
                    "amount": "4500",
                    "denom": "uatom"
                  }
                ],
                "gas": "450000"
              },
              "memo": "",
              "msg": [
                {
                  "type": "cosmos-sdk/MsgTransfer",
                  "value": {
                    "receiver": "osmo15cenya0tr7nm3tz2wn3h3zwkht2rxrq7g9ypmq",
                    "sender": "cosmos15cenya0tr7nm3tz2wn3h3zwkht2rxrq7q7h3dj",
                    "source_channel": "channel-141",
                    "source_port": "transfer",
                    "timeout_height": {
                      "revision_height": "4006321",
                      "revision_number": "1"
                    },
                    "token": {
                      "amount": "5500",
                      "denom": "uatom"
                    }
                  }
                }
              ]
            }
            const input: any = {
              tx,
              addressNList: core.bip32ToAddressNList("m/44'/118'/0'/0/0"),
              chain_id: tx.chain_id,
              account_number: tx.account_number,
              sequence: tx.sequence,
            };

            //sign
            console.log("input: ",input)
            const res = await window.wallet.cosmosSignTx(input);
            console.log("res: ",res)

            //broadcast

          }



          break;
        default:
          console.log(`Sorry, we are out of ${expr}.`);
      }
      //monitor till complete


      // const txStatus = await checkTransactionStatusSync(txHash, routeResponse, rangoClient)
      // console.log("transaction finished", {txStatus})
      // setLoadingSwap(false)
    } catch (e) {
      console.error("e: ",e)
      // const rawMessage = JSON.stringify(e).substring(0, 90) + '...'
      // setLoadingSwap(false)
      // setError(rawMessage)
      // // report transaction failure to server if something went wrong in client for signing and sending the transaction
      // await rangoClient.reportFailure({
      //   data: { message: rawMessage },
      //   eventType: 'TX_FAIL',
      //   requestId: routeResponse.requestId,
      // })
    }
  }

  const checkTransactionStatusSync = async (txHash: string, bestRoute: BestRouteResponse, rangoClient: RangoClient) => {
    while (true) {
      const txStatus = await rangoClient.checkStatus({
        requestId: bestRoute.requestId,
        step: 1,
        txId: txHash,
      })
      setTxStatus(txStatus)
      console.log({txStatus})
      if (!!txStatus.status && [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(txStatus.status)) {
        // for some swappers (e.g. harmony bridge), it needs more than one transaction to be signed for one single step
        // swap. In these cases, you need to check txStatus.newTx and make sure it's null before going to the next step.
        // If it's not null, you need to use that to create next transaction of this step.
        return txStatus
      }
      await sleep(3000)
    }
  }

  const swapperLogo = tokensMeta?.swappers.find(sw => sw.id === bestRoute?.result?.swaps[0].swapperId)?.logo

  const handlePinDigit = async (number:any) => {
    console.log("handlePinDigit")
    console.log("number: ",number)
    console.log("pinEntered: ",pin)
    if(pin) {
      setPinValue(pin + number.toString())
    }else if(number){
      setPinValue(number.toString())
    }
  }

  const pinEntered = async () => {
    console.log("pinEntered")
    console.log("pinEntered: ",pin)
    try{
      let result = await window.wallet.sendPin(pin)
      console.log("result: ",result)
    }catch(e){
      console.error("Failed: ",e)
      setPinValue("")
    }
  }

  return (
    <div className="container">
      {!RANGO_API_KEY && (
        <div className='red-text'><b>Set RANGO_API_KEY inside App.tsx to make it work!</b></div>
      )}
      {showPin
      ? <div id="#pinModal" className="modal" aria-hidden="true">
          <div className="modal-header">
            <h3>Enter PIN</h3>
            <p>Use the PIN layout shown on your device to find the location to press on this PIN pad.</p>
          </div>
          <form onSubmit={pinEntered}>
            <label>
                <div className="modal-body">
                  <button onClick={() => handlePinDigit(7)} className="button button-outline">&#x25CF;</button>
                  &nbsp;
                  <button onClick={() => handlePinDigit(8)} className="button button-outline">&#x25CF;</button>
                  &nbsp;
                  <button onClick={() => handlePinDigit(9)} className="button button-outline">&#x25CF;</button>
                  <br />
                  <button onClick={() => handlePinDigit(4)} className="button button-outline">&#x25CF;</button>
                  &nbsp;
                  <button onClick={() => handlePinDigit(5)} className="button button-outline">&#x25CF;</button>
                  &nbsp;
                  <button onClick={() => handlePinDigit(6)} className="button button-outline">&#x25CF;</button>
                  <br />
                  <button onClick={() => handlePinDigit(1)} className="button button-outline">&#x25CF;</button>
                  &nbsp;
                  <button onClick={() => handlePinDigit(4)} className="button button-outline">&#x25CF;</button>
                  &nbsp;
                  <button onClick={() => handlePinDigit(3)} className="button button-outline">&#x25CF;</button>
                  <br />
                </div>
              <input type="text" defaultValue=""/>
            </label>
            <input type="submit" value="Submit" onChange={handlePinDigit}/>
          </form>
        </div>
      : <div>dontShowPin</div>}
      <div className="tokens-container">
        <button id="swap" onClick={onConnect}>connect KeepKey</button>
        <div className="from">
          {loadingMeta && (<div className="loading"/>)}
          {!loadingMeta && (<img src={inputAsset?.image} alt="BTC" height="50px"/>)}
          <div>
            <input
              type="number"
              className="from-amount"
              value={inputAmount}
              onChange={(e) => {
                setInputAmount(e.target.value)
              }}
              min="0.01"
              step="0.01"
            />
          </div>
          <div className="symbol">{inputAsset?.symbol}</div>
          <div className="blockchain">from {inputAsset?.blockchain}</div>
        </div>
        <div className="swap-details-container">
          <div className="swap-details">
            {requiredAssets && (
              <div>
                Required Balance Check:
                {requiredAssets.map((item, index) => (
                  <div key={index}>+ {item.asset.symbol},
                    type: {item.reason},
                    {/*required: {prettyAmount(item.requiredAmount)},*/}
                    {/*current: {prettyAmount(item.currentAmount)},*/}
                    enough: {item.ok ? 'yes' : 'no'}
                  </div>
                ))}
              </div>
            )}
            <img src="./img/arrow.png" className="arrow" alt="to"/>
            {bestRoute && <div className='green-text'>
              {swapperLogo && (<img src={swapperLogo} alt="swapper logo" width={50}/>)} <br/>
              {bestRoute?.result?.swaps[0].swapperId}
            </div>}
            {txStatus && (
              <div>
                <br/>
                <div>status: {txStatus.status || TransactionStatus.RUNNING}</div>
                <div>details: {txStatus.extraMessage || '-'}</div>
                {txStatus.explorerUrl?.map((item) => (
                    <div><a href={item.url}>{item.description || "Tx Hash"}</a></div>
                  )
                )}
                <br/>
              </div>
            )}
            {!!error && (<div className="error-message">{error}</div>)}
          </div>
          <button id="swap" onClick={swap} disabled={loadingMeta || loadingSwap}>swap</button>
        </div>
        <div className="to">
          {loadingMeta && (<div className="loading"/>)}
          {!loadingMeta && (<img src={outputAsset?.image} alt="Matic" height="50px"/>)}
          <div className="amount green-text">{bestRoute?.result?.outputAmount || "?"}</div>
          <div className="symbol">{outputAsset?.symbol}</div>
          <div className="blockchain">to {outputAsset?.blockchain}</div>
        </div>
      </div>
    </div>
  )
}

export default App
