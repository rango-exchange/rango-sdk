import React, { useEffect, useMemo, useState } from 'react'
import {
  BestRouteResponse,
  MetaResponse,
  RangoClient,
  Token,
  TransactionType,
} from 'rango-sdk'
import TxTypeSelect from './components/ExampleSelect'
import { ExampleTxType } from './types'
import { chooseSampleToken } from './helpers'
import './App.css'
import SwapBox from './components/SwapBox'
import RoutePreview from './components/RoutePreview'

function App() {
  const [txType, setTxType] = useState<ExampleTxType>(TransactionType.EVM)
  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true)
  const [fromToken, setFromToken] = useState<Token | undefined>()
  const [toToken, setToToken] = useState<Token | undefined>()
  const [fromInputAmount, setFromInputAmount] = useState<string>('1.0')
  const [route, setRoute] = useState<BestRouteResponse | null>(null)
  const [loadingRoute, setLoadingRoute] = useState<boolean>(true)

  useEffect(() => {
    if (!tokensMeta) return
    const fromToken = chooseSampleToken(tokensMeta.tokens, txType, 'from')
    const toToken = chooseSampleToken(tokensMeta.tokens, txType, 'to')
    setFromToken(fromToken)
    setToToken(toToken)
  }, [txType, tokensMeta])

  // put your RANGO-API-KEY here
  const RANGO_API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
  const sdk = useMemo(() => new RangoClient(RANGO_API_KEY), [])

  useEffect(() => {
    setLoadingMeta(true)
    sdk
      .getAllMetadata()
      .then((meta) => setTokenMeta(meta))
      .finally(() => setLoadingMeta(false))
  }, [sdk])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fromToken || !toToken || !fromInputAmount) return
    setLoadingRoute(true)
    setRoute(null)
    // If you just want to show route to user, set checkPrerequisites: false.
    // Also for multi steps swap, it is faster to get route first with {checkPrerequisites: false} and if users confirms.
    // check his balance with {checkPrerequisites: true} in another get best route request
    sdk
      .getBestRoute({
        amount: fromInputAmount,
        affiliateRef: null,
        checkPrerequisites: true,
        connectedWallets: [],
        selectedWallets: {},
        from: fromToken,
        to: toToken,
      })
      .then((route) => {
        setRoute(route)
        setLoadingRoute(false)
      })
  }, [fromToken, toToken, fromInputAmount, sdk])

  return (
    <div className="App">
      <div className="container">
        <TxTypeSelect onChange={setTxType} />
        <RoutePreview />
        <SwapBox
          outputLoading={loadingRoute}
          loadingMeta={loadingMeta}
          fromToken={fromToken}
          toToken={toToken}
          fromInputAmount={fromInputAmount}
          setFromInputAmount={setFromInputAmount}
          outputAmount={route?.result?.outputAmount}
        />
      </div>
    </div>
  )
}

export default App
