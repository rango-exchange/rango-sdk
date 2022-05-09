import './App.css';
import {useEffect, useMemo, useState} from "react"
import {ethers} from 'ethers'
import {
  EvmTransaction,
  MetaResponse,
  RangoClient,
  TransactionStatus,
  QuoteResponse,
  StatusResponse,
  Asset,
  SwapResponse
} from "rango-sdk-basic"
import {checkApprovalSync, prepareEvmTransaction, sleep} from "./utils";
import BigNumber from "bignumber.js";
import React from 'react';

declare let window: any


export const App = () => {
  const RANGO_API_KEY = '' // put your RANGO-API-KEY here

  const rangoClient = useMemo(() => new RangoClient(RANGO_API_KEY), [])

  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [inputAmount, setInputAmount] = useState<string>("0.01")
  const [quote, setQuote] = useState<QuoteResponse | null>()
  const [txStatus, setTxStatus] = useState<StatusResponse | null>(null)
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true)
  const [loadingSwap, setLoadingSwap] = useState<boolean>(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    setLoadingMeta(true)
    // Meta provides all blockchains, tokens and swappers information supported by Rango
    rangoClient.meta().then((meta) => {
      setTokenMeta(meta)
      setLoadingMeta(false)
    })
  }, [rangoClient])

  // 1inch sample: POLYGON.USDT -> POLYGON.MATIC
  // const sourceChainId = 137
  // const sourceToken = tokensMeta?.tokens.find(t => t.blockchain === "POLYGON" && t.address === '0xc2132d05d31c914a87c6611c10748aeb04b58e8f')
  // const destinationToken = tokensMeta?.tokens.find(t => t.blockchain === "POLYGON" && t.address === null)

  // 1inch sample: BSC.BAKE -> BSC.BNB
  // const sourceChainId = 56
  // const sourceToken = tokensMeta?.tokens.find(t => t.blockchain === "BSC" && t.address === "0xe02df9e3e622debdd69fb838bb799e3f168902c5")
  // const destinationToken = tokensMeta?.tokens.find(t => t.blockchain === "BSC" && t.address === '0x55d398326f99059ff775485246999027b3197955')

  // anyswap sample: POLYGON.USDT to BSC.USDT
  // const sourceChainId = 137
  // const sourceToken = tokensMeta?.tokens.find(t => t.blockchain === "POLYGON" && t.address === '0xc2132d05d31c914a87c6611c10748aeb04b58e8f')
  // const destinationToken = tokensMeta?.tokens.find(t => t.blockchain === "BSC" && t.address === '0x55d398326f99059ff775485246999027b3197955')

  // aggregator sample 1: BSC.BNB to FTM.USDT
  // const sourceChainId = 56
  // const sourceToken = tokensMeta?.tokens.find(t => t.blockchain === "BSC" && t.address === null)
  // const destinationToken = tokensMeta?.tokens.find(t => t.blockchain === "FANTOM" && t.address === '0x049d68029688eabf473097a2fc38ef61633a3c7a')

  // aggregator sample 2: BSC.BNB to FTM.FTM
  const sourceChainId = 56
  const sourceToken = tokensMeta?.tokens.find(t => t.blockchain === "BSC" && t.address === null)
  const destinationToken = tokensMeta?.tokens.find(t => t.blockchain === "FANTOM" && t.address === null)

  const getUserWallet = async () => {
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    await provider.send('eth_requestAccounts', [])
    return await provider.getSigner().getAddress()
  }

  const swap = async () => {
    setError("")
    setQuote(null)
    setTxStatus(null)
    let userAddress = ''
    try {
      userAddress = await getUserWallet()
      console.log({userAddress})
    } catch (err) {
      setError('Error connecting to MetMask. Please check Metamask and try again.')
      return
    }

    if (!(window.ethereum).isConnected()) {
      setError('Error connecting to MetMask. Please check Metamask and try again.')
      return
    }

    if (window.ethereum.chainId && parseInt(window.ethereum.chainId) !== sourceChainId) {
      setError(`Change meta mask network to '${sourceToken?.blockchain}'.`)
      return
    }

    if (!userAddress) {
      setError(`Could not get wallet address.`)
      return
    }
    if (!inputAmount) {
      setError(`Set input amount`)
      return
    }
    if (!sourceToken || !destinationToken)
      return

    setLoadingSwap(true)
    const from: Asset = {blockchain: sourceToken?.blockchain, symbol: sourceToken?.symbol, address: sourceToken.address}
    const to: Asset = {blockchain: destinationToken?.blockchain, symbol: destinationToken?.symbol, address: destinationToken.address}
    const amount: string = (new BigNumber(inputAmount)).shiftedBy(sourceToken.decimals).toString()

    const quoteResponse = await rangoClient.quote({
      amount,
      from,
      to,
    })
    setQuote(quoteResponse)
    console.log({quoteResponse})

    if (!quoteResponse || !quoteResponse?.route || quoteResponse.resultType !== "OK") {
      setError(`Invalid quote response: ${quoteResponse.resultType}, please try again.`)
      setLoadingSwap(false)
      return
    }
    else {
      await executeRoute(from, to, userAddress, amount)
    }
  }

  const executeRoute = async (from: Asset, to: Asset, fromAddress: string, inputAmount: string) => {
    const provider = await new ethers.providers.Web3Provider(window.ethereum as any)
    const signer = provider.getSigner()
    if (!sourceToken || !destinationToken)
      return

    let swapResponse: SwapResponse | null = null
    try {
      swapResponse = await rangoClient.swap({
        from,
        to,
        amount: inputAmount,
        fromAddress: fromAddress,
        toAddress: fromAddress,
        disableEstimate: false,
        referrerAddress: null,
        referrerFee: null,
        slippage: '1.0'
      })
      console.log({swapResponse})

      if (!!swapResponse.error || swapResponse.resultType === "NO_ROUTE" || swapResponse.resultType === "INPUT_LIMIT_ISSUE") {
        setError(`Error swapping, error message: ${swapResponse.error}, result type: ${swapResponse.resultType}`)
        setLoadingSwap(false)
        return
      }

      const evmTransaction = swapResponse.tx as EvmTransaction
      console.log({evmTransaction})

      // if approve data is not null, it means approve needed, otherwise it's already approved.
      if (!!evmTransaction.approveData) {
        // try to approve
        const finalTx = prepareEvmTransaction(evmTransaction, true)
        console.log("approve tx", {finalTx})
        const txHash = (await signer.sendTransaction(finalTx)).hash
        await checkApprovalSync(swapResponse.requestId, txHash, rangoClient)
        console.log("transaction approved successfully")
      }
      const finalTx = prepareEvmTransaction(evmTransaction, false)
      const txHash = (await signer.sendTransaction(finalTx)).hash
      const txStatus = await checkTransactionStatusSync(swapResponse.requestId, txHash, rangoClient)
      console.log("transaction finished", {txStatus})
      setLoadingSwap(false)
    } catch (e) {
      const rawMessage = JSON.stringify(e).substring(0, 90) + '...'
      setLoadingSwap(false)
      setError(rawMessage)
      // report transaction failure to server if something went wrong in client for signing and sending the transaction
      if (!!swapResponse) {
        await rangoClient.reportFailure({
          data: { message: rawMessage },
          eventType: 'TX_FAIL',
          requestId: swapResponse.requestId,
        })
      }
    }
  }

  const checkTransactionStatusSync = async (requestId: string, txHash: string, rangoClient: RangoClient) => {
    while (true) {
      const txStatus = await rangoClient.status({
        requestId: requestId,
        txId: txHash,
      })
      setTxStatus(txStatus)
      console.log({txStatus})
      if (!!txStatus.status && [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(txStatus.status)) {
        return txStatus
      }
      await sleep(3000)
    }
  }
  return (
    <div className="container">
      {!RANGO_API_KEY && (
        <div className='red-text'><b>Set RANGO_API_KEY inside App.tsx to make it work!</b></div>
      )}
      <div className="tokens-container">
        <div className="from">
          {loadingMeta && (<div className="loading"/>)}
          {!loadingMeta && (<img src={sourceToken?.image} alt="USDT" height="50px"/>)}
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
          <div className="symbol">from</div>
          <div className="blockchain">{sourceToken?.blockchain}.{sourceToken?.symbol}</div>
        </div>
        <div className="swap-details-container">
          <div className="swap-details">
            <img src="./img/arrow.png" className="arrow" alt="to"/>
            {quote && <div className='green-text'>
              {quote.route?.swapper && (<img src={quote.route?.swapper?.logo} alt="swapper logo" width={50}/>)} <br/>
              {quote.route?.swapper?.title}
            </div>}
            {quote && (
              <div>
                <br/>
                {quote && (
                  <React.Fragment>
                    <div>expected output:
                      {new BigNumber(quote?.route?.outputAmount || "0").shiftedBy(-(destinationToken?.decimals || 0)).toString()} {destinationToken?.symbol}
                    </div>
                    <div>time estimate:
                      {quote.route?.estimatedTimeInSeconds}s
                    </div>
                  </React.Fragment>
                )}
                {txStatus && (
                  <React.Fragment>
                    <div>status: {txStatus.status || TransactionStatus.RUNNING}</div>
                    <div>real output: {txStatus.output?.amount || '?'} {txStatus.output?.receivedToken?.symbol || ""}  {txStatus.output?.type || ""}</div>
                    <div>details: {txStatus.error || '-'}</div>
                    {txStatus.explorerUrl?.map((item, id) => (
                        <div key={id}><a href={item.url}>{item.description || "Tx Hash"}</a></div>
                      )
                    )}
                  </React.Fragment>
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
          {!loadingMeta && (<img src={destinationToken?.image} alt="Matic" height="50px"/>)}
          <div className="symbol">to</div>
          <div className="blockchain">{destinationToken?.blockchain}.{destinationToken?.symbol}</div>
        </div>
      </div>
    </div>
  )
}

export default App
