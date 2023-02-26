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
} from 'rango-sdk-basic'
import { checkApprovalSync, prepareEvmTransaction, sleep } from './utils'
import BigNumber from 'bignumber.js'
import {
  Button,
  VerticalSwapIcon,
  Modal,
  Typography,
  Spacer,
  styled,
  Switch,
} from '@rangodev/ui'
import { TokenInfo } from './components/TokenInfo'
import { LiquiditySources } from './components/LiquiditySources'

declare let window: any

const SwitchButtonContainer = styled('div', {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
  top: '11px',
})
export const App = () => {
  const RANGO_API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32' // put your RANGO-API-KEY here

  const rangoClient = useMemo(() => new RangoClient(RANGO_API_KEY), [])
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
  useEffect(() => {
    setLoadingMeta(true)
    // Meta provides all blockchains, tokens and swappers information supported by Rango
    rangoClient.meta().then((meta) => {
      setTokenMeta(meta)
      setLoadingMeta(false)
    })
    rangoClient.messagingProtocols().then((res) => {
      const protocols = res.protocols.map((p) => p.id)
      setProtocols(protocols)
      setLoadingProtocols(false)
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
  // const sourceChainId = 56
  // const sourceToken = tokensMeta?.tokens.find(t => t.blockchain === "BSC" && t.address === null)
  // const destinationToken = tokensMeta?.tokens.find(t => t.blockchain === "FANTOM" && t.address === null)

  // aggregator sample 3: POLYGON.USDC to BSC.USDC
  // const sourceChainId = 137
  // const sourceToken = tokensMeta?.tokens.find(t => t.blockchain === "POLYGON" && t.address === '0x2791bca1f2de4661ed88a30c99a7a9449aa84174')
  // const destinationToken = tokensMeta?.tokens.find(t => t.blockchain === "BSC" && t.address === '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d')

  // aggregator sample 4: BSC.BNB to FTM.FTM

  const getUserWallet = async () => {
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    await provider.send('eth_requestAccounts', [])
    return await provider.getSigner().getAddress()
  }

  const swap = async () => {
    setError('')
    setQuote(null)
    let userAddress = ''
    try {
      userAddress = await getUserWallet()
      console.log({ userAddress })
    } catch (err) {
      setError(
        'Error connecting to MetMask. Please check Metamask and try again.'
      )
      return
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
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${Number(fromChain.chainId).toString(16)}` }],
        })
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
      blockchain: toToken?.blockchain as string,
      symbol: toToken?.symbol as string,
      address: toToken?.address as string,
    }
    const amount: string = new BigNumber(inputAmount)
      .shiftedBy(fromToken?.decimals as number)
      .toString()
    const quoteResponse = await rangoClient.quote({
      amount,
      from,
      to,
      swappers: disabledLiquiditySources,
      messagingProtocols: selectedProtocols,
      // sourceContract: "0x123...",
      // destinationContract: "0x123...",
      // imMessage: "0x"
    })
    setQuote(quoteResponse)
    console.log({ quoteResponse })

    if (
      !quoteResponse ||
      !quoteResponse?.route ||
      quoteResponse.resultType !== 'OK'
    ) {
      setError(
        `Invalid quote response: ${quoteResponse.resultType}, please try again.`
      )
      setLoadingSwap(false)
      return
    } else {
      await executeRoute(from, to, userAddress, amount)
    }
  }

  const executeRoute = async (
    from: Asset,
    to: Asset,
    fromAddress: string,
    inputAmount: string
  ) => {
    const provider = await new ethers.providers.Web3Provider(
      window.ethereum as any
    )
    const signer = provider.getSigner()
    if (!fromToken || !toToken) return

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
        slippage: '1.0',
        swappers: disabledLiquiditySources,
        messagingProtocols: selectedProtocols,
        // sourceContract: "0x123...",
        // destinationContract: "0x123...",
        // imMessage: "0x"
      })
      console.log({ swapResponse })

      if (
        !!swapResponse.error ||
        swapResponse.resultType === 'NO_ROUTE' ||
        swapResponse.resultType === 'INPUT_LIMIT_ISSUE'
      ) {
        setError(
          `Error swapping, error message: ${swapResponse.error}, result type: ${swapResponse.resultType}`
        )
        setLoadingSwap(false)
        return
      }

      const evmTransaction = swapResponse.tx as EvmTransaction
      console.log({ evmTransaction })

      // if approve data is not null, it means approve needed, otherwise it's already approved.
      if (!!evmTransaction.approveData) {
        // try to approve
        const finalTx = prepareEvmTransaction(evmTransaction, true)
        console.log('approve tx', { finalTx })
        const txHash = (await signer.sendTransaction(finalTx)).hash
        await checkApprovalSync(swapResponse.requestId, txHash, rangoClient)
        console.log('transaction approved successfully')
      }
      const finalTx = prepareEvmTransaction(evmTransaction, false)
      const txHash = (await signer.sendTransaction(finalTx)).hash
      const txStatus = await checkTransactionStatusSync(
        swapResponse.requestId,
        txHash,
        rangoClient
      )
      console.log('transaction finished', { txStatus })
      console.log('bridged data?', txStatus.bridgeData)
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
        .catch((error: any) => {
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

  const onchangeProtocols = (protocol: string) => {
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
  const toggleLiquiditySource = (name: string) => {
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
            toggleLiquiditySource={toggleLiquiditySource}
            swappers={tokensMeta?.swappers || []}
            disabledLiquiditySources={disabledLiquiditySources}
          />
          <Spacer />
          <Button
            onClick={() => setOpen(true)}
            variant="outlined"
            type="primary"
            loading={loadingProtocols}
          >
            Select Message Sender
          </Button>
        </div>

        <TokenInfo
          type="From"
          chain={fromChain}
          setToken={setFromToken}
          setChain={setFromChain}
          token={fromToken}
          loading={loadingMeta}
          setInputAmount={setInputAmount}
          amount={inputAmount}
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
          token={toToken}
          setToken={setToToken}
          setChain={setToChain}
          type="To"
          blockchains={tokensMeta?.blockchains || []}
          tokens={tokensMeta?.tokens || []}
          loading={loadingMeta}
          amount={new BigNumber(quote?.route?.outputAmount || '0')
            .shiftedBy(-(toToken?.decimals || 0))
            .toString()}
        />
        <div className="swap-details-container">
          <div className="swap-details">
            {quote && (
              <div className="green-text">
                {quote.route?.swapper && (
                  <img
                    src={quote.route?.swapper?.logo}
                    alt="swapper logo"
                    width={50}
                  />
                )}{' '}
                <br />
                {quote.route?.swapper?.title}
              </div>
            )}
            <br />
            {quote && (
              <div>
                <table className="border-collapse border">
                  <tbody>
                    {quote && (
                      <React.Fragment>
                        <tr>
                          <td>expected output</td>
                          <td>
                            {new BigNumber(quote?.route?.outputAmount || '0')
                              .shiftedBy(-(toToken?.decimals || 0))
                              .toString()}{' '}
                            {toToken?.symbol}
                          </td>
                        </tr>
                        <tr>
                          <td>time estimate</td>
                          <td>{quote.route?.estimatedTimeInSeconds}s</td>
                        </tr>
                      </React.Fragment>
                    )}
                    {txStatus && (
                      <React.Fragment>
                        <tr>
                          <td>status</td>
                          <td>
                            {txStatus.status || TransactionStatus.RUNNING}
                          </td>
                        </tr>
                        <tr>
                          <td>output</td>
                          <td>
                            {new BigNumber(txStatus.output?.amount || '0')
                              .shiftedBy(-(toToken?.decimals || 0))
                              .toString() || '?'}{' '}
                            {txStatus.output?.receivedToken?.symbol || ''}{' '}
                            {txStatus.output?.type || ''}
                          </td>
                        </tr>
                        <tr>
                          <td>error?</td>
                          <td>{txStatus.error || '-'}</td>
                        </tr>
                        {txStatus.explorerUrl?.map((item, id) => (
                          <tr key={id}>
                            <td>explorer url [{id}]</td>
                            <td>
                              <a href={item.url}>
                                {item.description || 'Tx Hash'}
                              </a>
                            </td>
                          </tr>
                        ))}
                        {!!txStatus.bridgeData && (
                          <React.Fragment>
                            <tr>
                              <td>srcChainId</td>
                              <td>{txStatus.bridgeData.srcChainId}</td>
                            </tr>
                            <tr>
                              <td>destChainId</td>
                              <td>{txStatus.bridgeData.destChainId}</td>
                            </tr>
                            <tr>
                              <td>srcToken</td>
                              <td>{txStatus.bridgeData.srcToken}</td>
                            </tr>
                            <tr>
                              <td>destToken</td>
                              <td>{txStatus.bridgeData.destToken}</td>
                            </tr>
                            <tr>
                              <td>srcTokenAmt</td>
                              <td>{txStatus.bridgeData.srcTokenAmt}</td>
                            </tr>
                            <tr>
                              <td>destTokenAmt</td>
                              <td>{txStatus.bridgeData.destTokenAmt}</td>
                            </tr>
                            <tr>
                              <td>srcTxHash</td>
                              <td>{txStatus.bridgeData.srcTxHash}</td>
                            </tr>
                            <tr>
                              <td>destTxHash</td>
                              <td>{txStatus.bridgeData.destTxHash}</td>
                            </tr>
                          </React.Fragment>
                        )}
                      </React.Fragment>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {!!error && <div className="error-message">{error}</div>}
          </div>
          <br />
          <Button
            onClick={swap}
            loading={loadingSwap}
            type="primary"
            disabled={loadingMeta || loadingSwap}
          >
            swap
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
                      onChange={() => onchangeProtocols(protocol)}
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
        title={'Select Messaging Protocols'}
        containerStyle={{ width: '560px', height: 'auto' }}
      />
    </div>
  )
}

export default App
