import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BestRouteRequest,
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
  const [loadingRoute, setLoadingRoute] = useState<boolean>(false)
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
    setRoute(null)
    setLoadingRoute(false)
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
    if (loadingRoute) return
    if (
      executionState === 'start' &&
      !!route &&
      route.requestAmount === fromInputAmount
    )
      return
    if (executionState === 'confirm-route') return
    const swaps = route?.result?.swaps
    setLoadingRoute(true)
    setRoute(null)
    let data: BestRouteRequest = {
      amount: fromInputAmount,
      checkPrerequisites: false,
      connectedWallets: [],
      selectedWallets: {},
      from: fromToken,
      to: toToken,
    }
    if (executionState === 'connected') {
      const selectedWallets =
        swaps
          ?.map((swap) => ({
            [swap.from.blockchain]: walletAddress,
            [swap.to.blockchain]: walletAddress,
          }))
          ?.reduce((prev, curr) => ({ ...prev, ...curr }), {}) || {}
      const connectedWallets = Object.entries(selectedWallets).map(
        ([blockchain, address]) => ({ blockchain, addresses: [address] })
      )
      data = {
        ...data,
        connectedWallets,
        selectedWallets,
        checkPrerequisites: true,
      }
    }
    sdk
      .getBestRoute(data)
      .then((route) => {
        setRoute(route)
        setLoadingRoute(false)
      })
      .catch(() => {
        setRoute(null)
        setExecutionState('start')
      })
      .finally(() => {
        setLoadingRoute(false)
        if (executionState === 'connected') setExecutionState('confirm-route')
      })
  }, [
    fromToken,
    toToken,
    fromInputAmount,
    sdk,
    route?.result?.swaps,
    executionState,
    walletAddress,
    loadingRoute,
    route,
  ])

  const onWalletConnect = useCallback((address?: string, error?: string) => {
    if (error || !address) {
      alert(error)
      return
    }
    setWalletAddress(address)
    setExecutionState('connected')
  }, [])

  return (
    <div className="text-center text-white">
      <div className="container min-w-fit max-w-2xl flex m-auto mt-12">
        <ExampleSelect onChange={setTxType} />
        <RoutePreview route={route} loading={loadingRoute} />
        {executionState === 'start' && (
          <ConnectWallet
            wallet={sampleWallets[txType]}
            onConnect={onWalletConnect}
          />
        )}
        {(executionState === 'connected' ||
          executionState === 'confirm-route') && (
          <button
            onClick={async () => {}}
            className="bg-button text-white w-full text-sm border-white border-2 border-t-0 rounded-b-xl px-2 py-1"
          >
            Confirm Route
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
