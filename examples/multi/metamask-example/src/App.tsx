import './App.css'
import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import {
  RangoClient,
  BestRouteRequest,
  BestRouteResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  EvmTransaction,
  MetaResponse,
  Token,
  TransactionStatusResponse,
  isEvmBlockchain,
  BlockchainMeta,
  Asset,
  TransactionStatus,
  WalletDetail,
} from 'rango-sdk'
import getSigners, { checkApprovalSync, prepareEvmTransaction, sleep } from './utils'
import BigNumber from 'bignumber.js'
import {
  Button,
  VerticalSwapIcon,
  Spacer,
  styled,
  TextField,
  globalCss,
  BestRoute,
} from '@rango-dev/ui'
import { TokenInfo } from './components/TokenInfo'
import { LiquiditySources } from './components/LiquiditySources'
import { isAddress } from 'ethers/lib/utils'

const RANGO_API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32' // put your RANGO-API-KEY here

declare let window: any
const SwitchButtonContainer = styled('div', {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
  top: '11px',
})

const globalStyles = globalCss({
  '*': {
    fontFamily: 'Roboto',
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
})

export const App = () => {
  const [baseUrl, setBaseUrl] = useState<string>('https://api.rango.exchange/')

  const sdk = useMemo(() => new RangoClient(RANGO_API_KEY, baseUrl), [baseUrl])

  const [fromChain, setFromChain] = useState<BlockchainMeta | null>(null)
  const [fromToken, setFromToken] = useState<Token | null>(null)
  const [toChain, setToChain] = useState<BlockchainMeta | null>(null)
  const [toToken, setToToken] = useState<Token | null>(null)
  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [inputAmount, setInputAmount] = useState<string>('100')
  const [bestRoute, setBestRoute] = useState<BestRouteResponse | null>()
  const [txStatus, setTxStatus] = useState<TransactionStatusResponse | null>(
    null
  )
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true)
  const [loadingSwap, setLoadingSwap] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [accounts, setAccounts] = useState<string[]>([])
  const [disabledLiquiditySources, setDisabledLiquiditySources] = useState<
    string[]
  >([])
  globalStyles()
  const [balances, setBlances] = useState<WalletDetail[]>([])
  const [address, setAddress] = useState<string>('')
  useEffect(() => {
    sdk.getAllMetadata().then((meta) => {
      setTokenMeta(meta)
      setLoadingMeta(false)
    })
  }, [])

  const getBalances = async () => {
    try {
      const { address, accounts } = await getUserAddress()
      setAddress(address)

      const data = accounts.map((account) => {
        const [chain, addr] = account.split(':')
        return {
          address: addr,
          blockchain: chain,
        }
      })

      const { wallets } = await sdk.getWalletsDetails(data)

      setBlances(wallets)
    } catch (err) {
      setError(
        'Error connecting to MetMask. Please check Metamask and try again.'
      )
      return
    }
  }

  useEffect(() => {
    if (tokensMeta?.blockchains?.length) {
      getBalances()
    }
  }, [tokensMeta])

  const getUserAddress = async () => {
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    const accounts: string[] = await provider.send('eth_requestAccounts', [])
    let allAdresses: string[] = []
    if (tokensMeta?.blockchains) {
      accounts?.map((account) => {
        if (!!isAddress(account)) {
          allAdresses = [
            ...allAdresses,
            ...tokensMeta.blockchains
              .filter((blockchain) => isEvmBlockchain(blockchain))
              .map((chain) => `${chain.name}:${account}`),
          ]
        }
      })

      setAccounts(allAdresses)
    }

    return {
      address: await provider.getSigner().getAddress(),
      accounts: allAdresses,
    }
  }

  const swap = async () => {
    setError('')
    setBestRoute(null)
    let userAddress = address
    if (!userAddress) {
      try {
        userAddress = await (await getUserAddress()).address
        setAddress(userAddress)
      } catch (err) {
        setError(
          'Error connecting to MetMask. Please check Metamask and try again.'
        )
        return
      }
    }

    if (!window.ethereum.isConnected()) {
      setError(
        'Error connecting to MetMask. Please check Metamask and try again.'
      )
      return
    }
    if (!fromChain) {
      setError(`Please select source blockchain.`)
      return
    }
    if (!fromToken) {
      setError(`Please select source token.`)
      return
    }
    if (!toChain) {
      setError(`Please select destination blockchain.`)
      return
    }
    if (!toToken) {
      setError(`Please select destination token.`)
      return
    }

    if (
      window.ethereum.chainId &&
      fromChain?.chainId &&
      parseInt(window.ethereum.chainId) !== parseInt(fromChain?.chainId)
    ) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum)
        await provider.send('wallet_switchEthereumChain', [
          { chainId: `0x${Number(fromChain.chainId).toString(16)}` },
        ])
      } catch (e) {
        setError(`Change meta mask network to '${fromChain?.name}'.`)
        return
      }
    }

    if (!userAddress) {
      setError(`Could not get wallet address.`)
      return
    }
    if (!inputAmount) {
      setError(`Set input amount`)
      return
    }

    setLoadingSwap(true)

    const from: Asset = {
      blockchain: fromToken?.blockchain as string,
      symbol: fromToken?.symbol as string,
      address: fromToken?.address as string,
    }
    const to: Asset = {
      blockchain: toToken?.blockchain,
      symbol: toToken?.symbol as string,
      address: toToken?.address as string,
    }
    let selectedWallets = {}
    accounts.map((account) => {
      const [chain, address] = account.split(':')
      selectedWallets = { ...selectedWallets, [chain]: address }
    })
    const amount: string = new BigNumber(inputAmount).toString()

    let request: BestRouteRequest = {
      amount,
      from,
      to,
      checkPrerequisites: true,
      swappersGroupsExclude: true,
      connectedWallets: [],
      selectedWallets,
    }

    try {
      const bestRoute = await sdk.getBestRoute(request)
      setBestRoute(bestRoute)
      if (!bestRoute || !bestRoute?.result?.resultType) {
        setError(
          `Invalid quote response: ${bestRoute?.result?.resultType}, please try again.`
        )
        setLoadingSwap(false)
      } else {
        await executeRoute(bestRoute.requestId, userAddress)
      }
    } catch (error) {
      setError(`Error requesting quote: ${error}`)
      setLoadingSwap(false)
    }
  }

  const executeRoute = async (requestId: string, userAddress: string) => {
    const provider = window.ethereum;
    const signer = getSigners(provider);
    if (!fromToken || !toToken) return

    let swap: CreateTransactionResponse | null = null
    try {
      let swapRequest: CreateTransactionRequest = {
        requestId,
        step: 1,
        userSettings: {
          slippage: '1.0',
          infiniteApprove: false,
        },
        validations: {
          balance: true,
          fee: true,
        },
      }

      swap = await sdk.createTransaction(swapRequest)
      console.log({ swapResponse: swap })

      if (!swap.ok || !swap.transaction) {
        setError(`Error swapping, routing result: error: ${swap.error}`)
        setLoadingSwap(false)
        return
      }

      const evmTransaction = swap.transaction as EvmTransaction

      // if approve data is not null, it means approve needed, otherwise it's already approved.
      if (!!evmTransaction.isApprovalTx) {
        // try to approve
        const txHash = (await signer.signAndSendTx(evmTransaction, userAddress, null)).hash
        await checkApprovalSync(requestId, txHash, sdk)
        console.log('transaction approved successfully')
      }
      const txHash = (await signer.signAndSendTx(evmTransaction, userAddress, null)).hash
      await checkTransactionStatusSync(requestId, txHash, sdk)
      setLoadingSwap(false)
    } catch (e) {
      const rawMessage = JSON.stringify(e).substring(0, 90) + '...'
      setLoadingSwap(false)
      setError(rawMessage)
      // report transaction failure to server if something went wrong in client for signing and sending the transaction
      if (!!swap) {
        await sdk.reportFailure({
          data: { message: rawMessage },
          eventType: 'TX_FAIL',
          requestId,
        })
      }
    }
  }

  const checkTransactionStatusSync = async (
    requestId: string,
    txHash: string,
    rangoClient: RangoClient
  ) => {
    while (true) {
      const txStatus = await rangoClient
        .checkStatus({
          requestId,
          txId: txHash,
          step: 1,
        })
        .catch((error) => {
          console.log(error)
        })
      if (!!txStatus) {
        setTxStatus(txStatus)
        console.log({ txStatus })
        if (
          !!txStatus.status &&
          [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(
            txStatus.status
          )
        ) {
          return txStatus
        }
      }
      await sleep(3000)
    }
  }

  const switchFromAndTo = () => {
    setFromChain(toChain)
    setFromToken(toToken)
    setToChain(fromChain)
    setToToken(fromToken)
  }

  const toggleLiquiditySources = (name: string) => {
    const result = disabledLiquiditySources.includes(name)
      ? disabledLiquiditySources.filter(
          (liquiditySource) => liquiditySource !== name
        )
      : disabledLiquiditySources.concat(name)
    setDisabledLiquiditySources(result)
  }

  return (
    <div className="container">
      {!RANGO_API_KEY && (
        <div className="red-text">
          <b>Set RANGO_API_KEY inside App.tsx to make it work!</b>
        </div>
      )}
      <div className="tokens-container">
        <TextField
          placeholder="Base URL"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          size="medium"
          style={{
            position: 'relative',
            backgroundColor: '$background !important',
          }}
          onResize={undefined}
          onResizeCapture={undefined}
        />
        <Spacer size={16} direction="vertical" />

        <div className="row">
          <LiquiditySources
            loading={loadingMeta}
            setDisabledLiquiditySources={setDisabledLiquiditySources}
            toggleLiquiditySource={toggleLiquiditySources}
            swappers={tokensMeta?.swappers || []}
            disabledLiquiditySources={disabledLiquiditySources}
          />
          <Spacer />
        </div>
        <Spacer size={16} direction="vertical" />
        <TokenInfo
          type="From"
          chain={fromChain}
          setToken={setFromToken}
          setChain={setFromChain}
          token={fromToken}
          loading={loadingMeta}
          setInputAmount={setInputAmount}
          amount={inputAmount}
          balances={balances}
          blockchains={tokensMeta?.blockchains || []}
          tokens={tokensMeta?.tokens || []}
        />
        <SwitchButtonContainer>
          <Button variant="ghost" onClick={switchFromAndTo}>
            <VerticalSwapIcon size={36} />
          </Button>
        </SwitchButtonContainer>
        <TokenInfo
          chain={toChain}
          balances={balances}
          token={toToken}
          setToken={setToToken}
          setChain={setToChain}
          type="To"
          blockchains={tokensMeta?.blockchains || []}
          tokens={tokensMeta?.tokens || []}
          loading={loadingMeta}
          amount={new BigNumber(bestRoute?.result?.outputAmount || '')
            .shiftedBy(-(toToken?.decimals || 0))
            .toString()}
        />
        <div className="swap-details-container">
          {bestRoute && (
            <BestRoute
              data={bestRoute || null}
              totalFee=""
              totalTime=""
              feeWarning={false}
            />
          )}
          {!!error && <div className="error-message">{error}</div>}
          <br />
          <Button
            style={{ width: '92%' }}
            onClick={swap}
            loading={loadingSwap}
            type="primary"
            // disabled={loadingMeta || loadingSwap}
          >
            Swap
          </Button>
        </div>
      </div>
    </div>
  )
}

export default App
