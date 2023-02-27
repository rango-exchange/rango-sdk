import './App.css'
import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import {
  EvmTransaction,
  RangoClient,
  TransactionStatus,
  QuoteResponse,
  StatusResponse,
  Asset,
  SwapResponse,
  BlockchainMeta,
  Token,
  MetaResponse,
  WalletDetail,
  TransactionType,
  RoutingResultType,
  QuoteRequest,
  SwapRequest,
} from 'rango-sdk-basic'
import {
  checkApprovalSync,
  getSampleDefaultTokens,
  prepareEvmTransaction,
  sleep,
} from './utils'
import BigNumber from 'bignumber.js'
import {
  Button,
  VerticalSwapIcon,
  Modal,
  Typography,
  Spacer,
  styled,
  Switch,
  globalCss,
} from '@rango-dev/ui'
import { TokenInfo } from './components/TokenInfo'
import { LiquiditySources } from './components/LiquiditySources'
import { SwapDetails } from './components/SwapDetails'

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
const provider = new ethers.providers.Web3Provider(window.ethereum)

export const App = () => {
  const RANGO_API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32' // put your RANGO-API-KEY here
  const sdk = useMemo(() => new RangoClient(RANGO_API_KEY), [])

  const [fromChain, setFromChain] = useState<BlockchainMeta | null>(null)
  const [fromToken, setFromToken] = useState<Token | null>(null)
  const [toChain, setToChain] = useState<BlockchainMeta | null>(null)
  const [toToken, setToToken] = useState<Token | null>(null)
  const [tokensMeta, setTokenMeta] = useState<MetaResponse | null>()
  const [inputAmount, setInputAmount] = useState<string>('100')
  const [quote, setQuote] = useState<QuoteResponse | null>()
  const [txStatus, setTxStatus] = useState<StatusResponse | null>(null)
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true)
  const [loadingSwap, setLoadingSwap] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [open, setOpen] = useState<boolean>(false)
  const [protocols, setProtocols] = useState<string[]>([])
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([])
  const [loadingProtocols, setLoadingProtocols] = useState<boolean>(true)
  const [disabledLiquiditySources, setDisabledLiquiditySources] = useState<
    string[]
  >([])
  globalStyles()
  const [balances, setBlances] = useState<WalletDetail[]>([])
  const [testMessagePassing, setTestMessagePassing] = useState<boolean>(false)
  const [address, setAddress] = useState<string>('')

  useEffect(() => {
    sdk.meta().then((meta) => {
      setTokenMeta(meta)
      setLoadingMeta(false)
      const { fromChain, fromToken, toChain, toToken } =
        getSampleDefaultTokens(meta)

      setFromChain(fromChain || null)
      setToChain(toChain || null)
      setFromToken(fromToken || null)
      setToToken(toToken || null)
    })
    sdk.messagingProtocols().then(({ protocols }) => {
      const protocolsList = protocols.map((p) => p.id)
      setProtocols(protocolsList)
      setLoadingProtocols(false)
    })
  }, [sdk])

  const getBalances = async () => {
    try {
      const address = await getUserAddress()
      setAddress(address)
      const promises =
        tokensMeta?.blockchains
          .filter((chain) => chain.type === TransactionType.EVM)
          .map((chain) => sdk.balance({ address, blockchain: chain.name })) ||
        []
      const allBalances = (await Promise.allSettled(promises)).flatMap((p) =>
        p.status === 'fulfilled' ? p.value.wallets : []
      )
      setBlances(allBalances)
    } catch (err) {
      setError(
        'Error connecting to MetMask. Please check Metamask and try again.'
      )
      return
    }
  }

  useEffect(() => {
    if (tokensMeta?.blockchains.length) {
      getBalances()
    }
  }, [tokensMeta])

  const getUserAddress = async () => {
    await provider.send('eth_requestAccounts', [])
    return await provider.getSigner().getAddress()
  }

  const swap = async () => {
    setError('')
    setQuote(null)
    let userAddress = address
    if (!userAddress) {
      try {
        userAddress = await getUserAddress()
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

    const sampleImMessage = ethers.utils.defaultAbiCoder.encode(
      ['(address,address)'],
      [[fromToken.address, userAddress]]
    )

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
    const amount: string = new BigNumber(inputAmount)
      .shiftedBy(fromToken?.decimals as number)
      .toString()

    let request: QuoteRequest = {
      amount,
      from,
      to,
      // swapperGroups: disabledLiquiditySources, // TODO
      // swappersGroupsExclude: true, // TODO
    }
    if (testMessagePassing) {
      request = {
        ...request,
        messagingProtocols: selectedProtocols,
        sourceContract: '???', // TODO
        destinationContract: '???', // TODO
      }
    }

    try {
      const quote = await sdk.quote(request)
      setQuote(quote)
      console.log({ quoteResponse: quote })

      if (
        !quote ||
        !quote?.route ||
        quote.resultType !== RoutingResultType.OK
      ) {
        setError(
          `Invalid quote response: ${quote.resultType}, please try again.`
        )
        setLoadingSwap(false)
      } else {
        await executeRoute(from, to, userAddress, amount, sampleImMessage)
      }
    } catch (error) {
      setError(`Error requesting quote: ${error}`)
      setLoadingSwap(false)
    }
  }

  const executeRoute = async (
    from: Asset,
    to: Asset,
    fromAddress: string,
    inputAmount: string,
    imMessage?: string
  ) => {
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    const signer = provider.getSigner()
    if (!fromToken || !toToken) return

    let swap: SwapResponse | null = null
    try {
      let swapRequest: SwapRequest = {
        from,
        to,
        amount: inputAmount,
        fromAddress: fromAddress,
        toAddress: fromAddress,
        disableEstimate: false,
        referrerAddress: null,
        referrerFee: null,
        slippage: '1.0',
        // swapperGroups: disabledLiquiditySources, // TODO
        // swappersGroupsExclude: true, // TODO
      }
      if (testMessagePassing) {
        swapRequest = {
          ...swapRequest,
          messagingProtocols: selectedProtocols,
          sourceContract: '???', // TODO
          destinationContract: '???', // TODO
          imMessage,
        }
      }

      swap = await sdk.swap(swapRequest)
      console.log({ swapResponse: swap })

      if (!!swap.error || swap.resultType !== RoutingResultType.OK) {
        setError(
          `Error swapping, routing result: ${swap.resultType}, error: ${swap.error}`
        )
        setLoadingSwap(false)
        return
      }

      const evmTransaction = swap.tx as EvmTransaction

      // if approve data is not null, it means approve needed, otherwise it's already approved.
      if (!!evmTransaction.approveData) {
        // try to approve
        const finalTx = prepareEvmTransaction(evmTransaction, true)
        console.log('approve tx', { finalTx })
        const txHash = (await signer.sendTransaction(finalTx)).hash
        await checkApprovalSync(swap.requestId, txHash, sdk)
        console.log('transaction approved successfully')
      }
      const finalTx = prepareEvmTransaction(evmTransaction, false)
      const txHash = (await signer.sendTransaction(finalTx)).hash
      const txStatus = await checkTransactionStatusSync(
        swap.requestId,
        txHash,
        sdk
      )
      console.log('transaction finished', { txStatus })
      console.log('bridged data?', txStatus.bridgeData)
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
          requestId: swap.requestId,
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
        .status({
          requestId: requestId,
          txId: txHash,
        })
        .catch((error) => {
          console.log(error)
        })
      if (!!txStatus) {
        setTxStatus(txStatus)
        console.log({ txStatus })
        console.log(
          txStatus.bridgeData?.destTokenPrice,
          txStatus.bridgeData?.srcTokenPrice
        )
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

  const onChangeProtocols = (protocol: string) => {
    const selects = [...selectedProtocols]
    const i = selects.findIndex((p) => p === protocol)
    if (i === -1) {
      selects.push(protocol)
      setSelectedProtocols(selects)
    } else {
      selects.splice(i, 1)
      setSelectedProtocols(selects)
    }
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
        <div className="row">
          <LiquiditySources
            loading={loadingMeta}
            setDisabledLiquiditySources={setDisabledLiquiditySources}
            toggleLiquiditySource={toggleLiquiditySources}
            swappers={tokensMeta?.swappers || []}
            disabledLiquiditySources={disabledLiquiditySources}
          />
          <Spacer />
          <Button
            size="small"
            onClick={() => setOpen(true)}
            variant="outlined"
            type="primary"
            loading={loadingProtocols}
          >
            Messaging Protocols
          </Button>
        </div>
        <Spacer size={16} direction="vertical" />
        <div className="row">
          <Button
            variant="outlined"
            size="small"
            type="primary"
            suffix={
              <Switch
                checked={testMessagePassing}
                // onChange={() => setTestMessagePassing((prev) => !prev)}
              />
            }
            onClick={() => setTestMessagePassing((prev) => !prev)}
          >
            Test Message Passing
          </Button>
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
          amount={new BigNumber(quote?.route?.outputAmount || '')
            .shiftedBy(-(toToken?.decimals || 0))
            .toString()}
        />
        <div className="swap-details-container">
          <SwapDetails
            quote={quote || null}
            toToken={toToken}
            txStatus={txStatus}
          />
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

      <Modal
        open={open}
        onClose={() => setOpen((prev) => !prev)}
        content={
          <div>
            {protocols.map((protocol, index) => (
              <>
                <Button
                  variant="outlined"
                  size="large"
                  suffix={
                    <Switch
                      checked={selectedProtocols.includes(protocol)}
                      onChange={() => onChangeProtocols(protocol)}
                    />
                  }
                  align="start"
                  key={index}
                >
                  <Typography variant="body2">{protocol}</Typography>
                </Button>
                <Spacer size={16} direction="vertical" />
              </>
            ))}
          </div>
        }
        title={'Messaging Protocols'}
        containerStyle={{ width: '560px', height: 'auto' }}
      />
    </div>
  )
}

export default App
