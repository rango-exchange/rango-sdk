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

//hdwallet sdk
import * as core from "@shapeshiftoss/hdwallet-core";
import * as keepkey from "@shapeshiftoss/hdwallet-keepkey";
import * as keepkeyWebUSB from "@shapeshiftoss/hdwallet-keepkey-webusb";
const keyring = new core.Keyring();
const keepkeyAdapter = keepkeyWebUSB.WebUSBKeepKeyAdapter.useKeyring(keyring);
//end hdwallet sdk

//globals
dotenv.config()
declare let window: any

//mock info TODO moveme



export const App = () => {
  const RANGO_API_KEY = process.env['RANGO_API_KEY'] || '' // put your RANGO-API-KEY here

  const rangoClient = new RangoClient(RANGO_API_KEY)
  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [inputAmount, setInputAmount] = useState<string>("0.1")
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
  const btc = tokensMeta?.tokens.find(t => t.blockchain === "BTC")
  const eth = tokensMeta?.tokens.find(t => t.blockchain === "ETH")
  console.log("btc: ",btc)
  console.log("eth: ",eth)

  const onConnect = async () => {
    try{
      let wallet = await keepkeyAdapter.pairDevice(undefined, /*tryDebugLink=*/ true);
      console.log("Wallet: ",wallet)
      window["wallet"] = wallet;

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
    //get BTC address
    let btcAddress = await window.wallet.btcGetAddress({
      addressNList: [0x80000000 + 44, 0x80000000 + 0, 0x80000000 + 0, 0, 0],
      coin: "Bitcoin",
      scriptType: core.BTCInputScriptType.SpendAddress,
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

    return {
      "BTC":btcAddress,
      "ETH":ethAddress
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
      setError('Error connecting to KeepKey. Please check Metamask and try again.')
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
      {blockchain: 'BTC', addresses: [userAddresses.BTC]},
      {blockchain: 'ETH', addresses: [userAddresses.ETH]}
    ]
    const selectedWallets:any = [
      {blockchain: 'BTC', accounts: [{address:userAddresses.BTC}]},
      {blockchain: 'ETH', accounts: [{address:userAddresses.ETH}]}
    ]
    // const from = {blockchain: usdtToken?.blockchain, symbol: usdtToken?.symbol, address: usdtToken.address}
    // const to = {blockchain: maticToken?.blockchain, symbol: maticToken?.symbol, address: maticToken.address}
    const from = {blockchain: "BTC", symbol: "BTC", address: userAddresses.BTC}
    const to = {blockchain: "ETH", symbol: "ETH", address: userAddresses.ETH}


    // If you just want to show route to user, set checkPrerequisites: false.
    // Also for multi steps swap, it is faster to get route first with {checkPrerequisites: false} and if users confirms.
    // check his balance with {checkPrerequisites: true} in another get best route request
    let body = {
      amount: inputAmount,
      affiliateRef: null,
      checkPrerequisites: false,
      connectedWallets,
      from,
      selectedWallets,
      to,
    }
    console.log("body: ",body)
    const bestRoute = await rangoClient.getBestRoute(body)
    setBestRoute(bestRoute)

    console.log({bestRoute})
    if (!bestRoute || !bestRoute?.result || !bestRoute?.result?.swaps || bestRoute.result?.swaps?.length === 0) {
      setError(`Invalid route response from server, please try again.`)
      setLoadingSwap(false)
      return
    }
    //
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
    // else if (bestRoute) {
    //   await executeRoute(bestRoute)
    // }
  }

  const executeRoute = async (routeResponse: BestRouteResponse) => {
    // const provider = await new ethers.providers.Web3Provider(window.ethereum as any)
    // const signer = provider.getSigner()
    //
    // // In multi step swaps, you should loop over routeResponse.route array and create transaction per each item
    // let evmTransaction
    // try {
    //   // A transaction might needs multiple approval txs (e.g. in harmony bridge),
    //   // you should create transaction and check approval again and again until `isApprovalTx` field turns to false
    //   while (true) {
    //     const transactionResponse = await rangoClient.createTransaction({
    //       requestId: routeResponse.requestId,
    //       step: 1, // In this example, we assumed that route has only one step
    //       userSettings: { 'slippage': '1' },
    //       validations: { balance: true, fee: true },
    //     })
    //
    //     // in general case, you should check transaction type and call related provider to sign and send tx
    //     evmTransaction = transactionResponse.transaction as EvmTransaction
    //     if (evmTransaction.isApprovalTx) {
    //       const finalTx = prepareEvmTransaction(evmTransaction)
    //       await signer.sendTransaction(finalTx)
    //       await checkApprovalSync(routeResponse, rangoClient)
    //       console.log("transaction approved successfully")
    //     }
    //     else {
    //       break
    //     }
    //   }
    //
    //   const finalTx = prepareEvmTransaction(evmTransaction)
    //   const txHash = (await signer.sendTransaction(finalTx)).hash
    //   const txStatus = await checkTransactionStatusSync(txHash, routeResponse, rangoClient)
    //   console.log("transaction finished", {txStatus})
    //   setLoadingSwap(false)
    // } catch (e) {
    //   const rawMessage = JSON.stringify(e).substring(0, 90) + '...'
    //   setLoadingSwap(false)
    //   setError(rawMessage)
    //   // report transaction failure to server if something went wrong in client for signing and sending the transaction
    //   await rangoClient.reportFailure({
    //     data: { message: rawMessage },
    //     eventType: 'TX_FAIL',
    //     requestId: routeResponse.requestId,
    //   })
    // }
  }

  const checkTransactionStatusSync = async (txHash: string, bestRoute: BestRouteResponse, rangoClient: RangoClient) => {
    // while (true) {
    //   const txStatus = await rangoClient.checkStatus({
    //     requestId: bestRoute.requestId,
    //     step: 1,
    //     txId: txHash,
    //   })
    //   setTxStatus(txStatus)
    //   console.log({txStatus})
    //   if (!!txStatus.status && [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(txStatus.status)) {
    //     // for some swappers (e.g. harmony bridge), it needs more than one transaction to be signed for one single step
    //     // swap. In these cases, you need to check txStatus.newTx and make sure it's null before going to the next step.
    //     // If it's not null, you need to use that to create next transaction of this step.
    //     return txStatus
    //   }
    //   await sleep(3000)
    // }
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
          {!loadingMeta && (<img src={usdtToken?.image} alt="USDT" height="50px"/>)}
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
          <div className="symbol">{usdtToken?.symbol}</div>
          <div className="blockchain">from {usdtToken?.blockchain}</div>
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
          {!loadingMeta && (<img src={maticToken?.image} alt="Matic" height="50px"/>)}
          <div className="amount green-text">{bestRoute?.result?.outputAmount || "?"}</div>
          <div className="symbol">{maticToken?.symbol}</div>
          <div className="blockchain">to {maticToken?.blockchain}</div>
        </div>
      </div>
    </div>
  )
}

export default App
