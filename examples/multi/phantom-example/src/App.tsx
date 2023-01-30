import './App.css'
import { useEffect, useMemo, useState } from 'react'
import {
  BestRouteResponse,
  SolanaTransaction,
  MetaResponse,
  TransactionStatus,
  TransactionStatusResponse,
  WalletRequiredAssets,
  RangoClient,
} from 'rango-sdk'
import { executeSolanaTransaction, prettyAmount, sleep } from './utils'

declare global {
  interface Window {
    solana: any
  }
}

export const App = () => {
  const RANGO_API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32' // put your RANGO-API-KEY here

  const rangoClient = useMemo(() => new RangoClient(RANGO_API_KEY), [])

  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [inputAmount, setInputAmount] = useState<string>('0.1')
  const [bestRoute, setBestRoute] = useState<BestRouteResponse | null>()
  const [txStatus, setTxStatus] = useState<TransactionStatusResponse | null>(
    null
  )
  const [requiredAssets, setRequiredAssets] = useState<WalletRequiredAssets[]>(
    []
  )
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true)
  const [loadingSwap, setLoadingSwap] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    setLoadingMeta(true)
    // Meta provides all blockchains, tokens and swappers information supported by Rango
    rangoClient.getAllMetadata().then((meta) => {
      setTokenMeta(meta)
      setLoadingMeta(false)
    })
  }, [rangoClient])

  const wsolToken = tokensMeta?.tokens.find(
    (t) =>
      t.blockchain === 'SOLANA' &&
      t.address === 'So11111111111111111111111111111111111111112' &&
      t.symbol === 'WSOL'
  )
  const usdtTokenInSolana = tokensMeta?.tokens.find(
    (t) =>
      t.blockchain === 'SOLANA' &&
      t.address === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' &&
      t.symbol === 'USDT'
  )

  const getUserWallet = async () => {
    const solana: any =
      window.hasOwnProperty('solana') && !!window.solana ? window.solana : null
    const resp = await solana.connect()
    const solAddress = resp.publicKey.toString()
    let connectedWallets: { blockchain: string; addresses: string[] }[] = []
    connectedWallets.push({ blockchain: 'SOLANA', addresses: [solAddress] })
    return connectedWallets
  }

  const swap = async () => {
    setError('')
    setBestRoute(null)
    setTxStatus(null)
    setRequiredAssets([])
    let connectedWallets = []
    try {
      connectedWallets = await getUserWallet()
    } catch (err) {
      setError(
        'Error connecting to Phantom. Please check Phantom and try again.'
      )
      return
    }

    if (!connectedWallets || connectedWallets.length === 0) {
      setError(`Could not get wallet address.`)
      return
    }
    if (!inputAmount) {
      setError(`Set input amount`)
      return
    }
    if (!usdtTokenInSolana || !wsolToken) return

    setLoadingSwap(true)

    const from = {
      blockchain: wsolToken?.blockchain,
      symbol: wsolToken?.symbol,
      address: wsolToken.address,
    }
    const to = {
      blockchain: usdtTokenInSolana?.blockchain,
      symbol: usdtTokenInSolana?.symbol,
      address: usdtTokenInSolana.address,
    }
    const selectedWallets = {
      SOLANA:
        connectedWallets.find((wallet) => wallet.blockchain === 'SOLANA')
          ?.addresses[0] || '',
    }

    // If you just want to show route to user, set checkPrerequisites: false.
    // Also for multi steps swap, it is faster to get route first with {checkPrerequisites: false} and if users confirms.
    // check his balance with {checkPrerequisites: true} in another get best route request
    const bestRoute = await rangoClient.getBestRoute({
      amount: inputAmount,
      affiliateRef: null,
      checkPrerequisites: true,
      connectedWallets,
      from,
      selectedWallets,
      to,
    })
    setBestRoute(bestRoute)

    console.log({ bestRoute })
    if (
      !bestRoute ||
      !bestRoute?.result ||
      !bestRoute?.result?.swaps ||
      bestRoute.result?.swaps?.length === 0
    ) {
      setError(`Invalid route response from server, please try again.`)
      setLoadingSwap(false)
      return
    }

    const requiredCoins =
      bestRoute.validationStatus?.flatMap((v) =>
        v.wallets.flatMap((w) => w.requiredAssets)
      ) || []
    setRequiredAssets(requiredCoins)
    const hasEnoughBalance = requiredCoins
      ?.map((it) => it.ok)
      .reduce((a, b) => a && b)

    if (!hasEnoughBalance) {
      setError(`Not enough balance or fee!`)
      setLoadingSwap(false)
      return
    } else if (bestRoute) {
      await executeRoute(bestRoute)
    }
  }

  const executeRoute = async (routeResponse: BestRouteResponse) => {
    // In multi step swaps, you should loop over routeResponse.route array and create transaction per each item
    let solanaTransaction: SolanaTransaction | undefined
    try {
      const transactionResponse = await rangoClient.createTransaction({
        requestId: routeResponse.requestId,
        step: 1, // In this example, we assumed that route has only one step
        userSettings: { slippage: '1' },
        validations: { balance: true, fee: true },
      })

      if (transactionResponse?.error)
        throw new Error(
          transactionResponse?.error || 'Error creating transaction'
        )

      // in general case, you should check transaction type and call related provider to sign and send tx
      solanaTransaction = transactionResponse.transaction as SolanaTransaction
      let txStatus: TransactionStatusResponse | undefined

      while (solanaTransaction !== undefined) {
        const txHash: string = await executeSolanaTransaction(solanaTransaction)
        solanaTransaction = undefined
        while (true) {
          txStatus = await rangoClient.checkStatus({
            requestId: routeResponse.requestId,
            step: 1,
            txId: txHash,
          })
          setTxStatus(txStatus)
          if (!!txStatus.newTx) {
            // retry for failed transactions
            solanaTransaction = txStatus.newTx as SolanaTransaction
            break
          }
          if (
            !!txStatus.status &&
            [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(
              txStatus.status
            )
          ) {
            // for some swappers, it needs more than one transaction to be signed for one single step
            // swap. In these cases, you need to check txStatus.newTx and make sure it's null before going to the next step.
            // If it's not null, you need to use that to create next transaction of this step.
            break
          }
          await sleep(3000)
        }
      }
      console.log('transaction finished', { txStatus })
      setLoadingSwap(false)
    } catch (e) {
      let rawMessage = JSON.stringify(e).substring(0, 90) + '...'
      if (e instanceof Error) rawMessage = e.message
      setLoadingSwap(false)
      setError(rawMessage)
      // report transaction failure to server if something went wrong
      // in client in signing and sending the transaction
      await rangoClient.reportFailure({
        data: { message: rawMessage },
        eventType: 'TX_FAIL',
        requestId: routeResponse.requestId,
      })
    }
  }

  const swapperLogo = tokensMeta?.swappers.find(
    (sw) => sw.id === bestRoute?.result?.swaps[0].swapperId
  )?.logo

  return (
    <div className="container">
      {!RANGO_API_KEY && (
        <div className="red-text">
          <b>Set RANGO_API_KEY inside App.tsx to make it work!</b>
        </div>
      )}
      <div className="tokens-container">
        <div className="from">
          {loadingMeta && <div className="loading" />}
          {!loadingMeta && (
            <img src={wsolToken?.image} alt="WSOL" height="50px" />
          )}
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
          <div className="symbol">{wsolToken?.symbol}</div>
          <div className="blockchain">from {wsolToken?.blockchain}</div>
        </div>
        <div className="swap-details-container">
          <div className="swap-details">
            {!!requiredAssets && requiredAssets.length > 0 && (
              <div>
                Required Balance Check:
                {requiredAssets.map((item, index) => (
                  <div key={index}>
                    + {item.asset.symbol}, type: {item.reason}, required:{' '}
                    {prettyAmount(item.requiredAmount)}, current:{' '}
                    {prettyAmount(item.currentAmount)}, enough:{' '}
                    {item.ok ? 'yes' : 'no'}
                  </div>
                ))}
              </div>
            )}
            <img src="./img/arrow.png" className="arrow" alt="to" />
            {bestRoute && (
              <div className="green-text">
                {swapperLogo && (
                  <img src={swapperLogo} alt="swapper logo" width={50} />
                )}{' '}
                <br />
                {bestRoute?.result?.swaps[0].swapperId}
              </div>
            )}
            {txStatus && (
              <div>
                <br />
                <div>
                  status: {txStatus.status || TransactionStatus.RUNNING}
                </div>
                <div>details: {txStatus.extraMessage || '-'}</div>
                {txStatus.explorerUrl?.map((item) => (
                  <div>
                    <a href={item.url}>{item.description || 'Tx Hash'}</a>
                  </div>
                ))}
                <br />
              </div>
            )}
            {!!error && <div className="error-message">{error}</div>}
          </div>
          <button
            id="swap"
            onClick={swap}
            disabled={loadingMeta || loadingSwap}
          >
            swap
          </button>
        </div>
        <div className="to">
          {loadingMeta && <div className="loading" />}
          {!loadingMeta && (
            <img src={usdtTokenInSolana?.image} alt="USDT" height="50px" />
          )}
          <div className="amount green-text">
            {bestRoute?.result?.outputAmount || '?'}
          </div>
          <div className="symbol">{usdtTokenInSolana?.symbol}</div>
          <div className="blockchain">to {usdtTokenInSolana?.blockchain}</div>
        </div>
      </div>
    </div>
  )
}

export default App
