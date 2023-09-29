import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BestRouteRequest,
  BestRouteResponse,
  MetaResponse,
  RangoClient,
  Token,
  TransactionType,
} from 'rango-sdk'
import { ExampleTxType } from './types'
import { chooseSampleToken } from './data/routes'
import './App.css'
import { sampleWallets } from './data/wallets'
import {
  ExampleSelect,
  RoutePreview,
  ConnectWallet,
  SwapBox,
} from './components'
import { DefaultEvmSigner } from '@rango-dev/signer-evm'
import { DefaultCosmosSigner } from '@rango-dev/signer-cosmos'

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
  const [executionLogs, setExecutionLogs] = useState<string[]>([])
  const [executionState, setExecutionState] = useState<
    'start' | 'wallet-connected' | 'confirm-route'
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
      .catch(() => {})
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
    if (executionState === 'wallet-connected') {
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
        if (executionState === 'wallet-connected')
          setExecutionState('confirm-route')
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
    setExecutionState('wallet-connected')
  }, [])

  const addLog = useCallback((message: string) => {
    setExecutionLogs((prevMessages) => [...prevMessages, message])
  }, [])

  const onExecuteRoute = useCallback(async () => {
    if (!route) return

    for (const swap of route?.result?.swaps || []) {
      addLog(
        'Executing swap from ' + swap.from.symbol + ' to ' + swap.to.symbol
      )
      const txRes = await sdk.createTransaction({
        requestId: route?.requestId,
        step: 1,
        userSettings: { slippage: '3' },
        validations: { balance: false, fee: false },
      })
      if (!txRes.transaction) {
        addLog('Error creating transaction')
        return
      }
      const tx = txRes.transaction
      if (tx.type === TransactionType.EVM) {
        const signer = new DefaultEvmSigner(window.ethereum)
        const txHash = await signer.signAndSendTx(tx, walletAddress, null)
      }
      addLog('Transaction created. Waiting for confirmation...')
    }
  }, [route, addLog, sdk, walletAddress])

  return (
    <div className="text-center text-white">
      <div className="container min-w-fit max-w-2xl flex m-auto mt-12">
        <ExampleSelect onChange={setTxType} />
        <RoutePreview
          route={route}
          loading={loadingRoute}
          executionLogs={executionLogs}
        />
        {executionState === 'start' && (
          <ConnectWallet
            wallet={sampleWallets[txType]}
            onConnect={onWalletConnect}
          />
        )}
        {(executionState === 'wallet-connected' ||
          executionState === 'confirm-route') && (
          <button
            onClick={onExecuteRoute}
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
