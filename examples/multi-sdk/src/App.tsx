import React, { useEffect, useMemo, useState } from 'react'
import {
  BestRouteResponse,
  MetaResponse,
  RangoClient,
  Token,
  TransactionType,
} from 'rango-sdk'
import ExampleSelect from './components/ExampleSelect'
import { ExampleTxType } from './types'
import { chooseSampleToken } from './data/routes'
import SwapBox from './components/SwapBox'
import RoutePreview from './components/RoutePreview'
import './App.css'
import ConnectWallet from './components/ConnectWallet'
import { sampleWallets } from './data/wallets'

function App() {
  const [txType, setTxType] = useState<ExampleTxType>(TransactionType.EVM)
  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true)
  const [fromToken, setFromToken] = useState<Token | undefined>()
  const [toToken, setToToken] = useState<Token | undefined>()
  const [fromInputAmount, setFromInputAmount] = useState<string>('1.0')
  const [route, setRoute] = useState<BestRouteResponse | null>(null)
  const [loadingRoute, setLoadingRoute] = useState<boolean>(true)
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [executionState, setExecutionState] = useState<
    'start' | 'connected' | 'confirm-route'
  >('start')

  useEffect(() => {
    if (!tokensMeta) return
    const fromToken = chooseSampleToken(tokensMeta.tokens, txType, 'from')
    const toToken = chooseSampleToken(tokensMeta.tokens, txType, 'to')
    setFromToken(fromToken)
    setToToken(toToken)
    setExecutionState('start')
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

  useEffect(() => {
    if (!fromToken || !toToken || !fromInputAmount) return
    setLoadingRoute(true)
    setRoute(null)
    sdk
      .getBestRoute({
        amount: fromInputAmount,
        checkPrerequisites: false,
        connectedWallets: [],
        selectedWallets: {},
        from: fromToken,
        to: toToken,
      })
      .then((route) => {
        setRoute(route)
        setLoadingRoute(false)
      })
      .catch(() => setLoadingRoute(false))
  }, [fromToken, toToken, fromInputAmount, sdk])

  return (
    <div className="text-center text-white">
      <div className="container min-w-fit max-w-2xl flex m-auto mt-12">
        <div className="flex flex-row w-full">
          <ExampleSelect onChange={setTxType} />
        </div>
        <RoutePreview route={route} loading={loadingRoute} />
        {executionState === 'start' && (
          <ConnectWallet
            wallet={sampleWallets[txType]}
            onConnect={(address: string) => {
              setWalletAddress(address)
              setExecutionState('connected')
            }}
          />
        )}
        {executionState === 'connected' && (
          <button
            onClick={async () => {}}
            className="bg-button text-white w-full text-sm border-white border-2 border-t-0 rounded-b-xl px-2 py-1"
          >
            Execute Route
          </button>
        )}
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
