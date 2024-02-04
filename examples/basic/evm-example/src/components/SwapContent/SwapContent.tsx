import '../../App.css'
import React, { useEffect, useState } from 'react'
import {
  RangoClient,
  TransactionStatus,
  QuoteResponse,
  StatusResponse,
  Asset,
  SwapResponse,
  BlockchainMeta,
  Token,
  WalletDetail,
  RoutingResultType,
  QuoteRequest,
  SwapRequest,
  TransactionType,
  WalletDetailsResponse,
  EvmTransaction,
  CosmosTransaction,
  Transfer,
} from 'rango-sdk-basic'
import {
  checkApprovalSync,
  getSampleDefaultTokens,
  prepareEvmTransaction,
  sleep,
} from '../../utils'
import BigNumber from 'bignumber.js'
import { Button, VerticalSwapIcon } from '@rango-dev/ui'
import { TokenInfo } from '../../components/TokenInfo'
import { SwapDetails } from '../../components/SwapDetails'
import { useWallets } from '@rango-dev/wallets-react'
import { WalletTypes } from '@rango-dev/wallets-shared'
import { useRangoClient } from '../../hooks/useRangoClient'
import { useMessagingProtocols } from '../../hooks/useMessagingProtocols'
import { useMeta } from '../../hooks/useMeta'

const SwapContent = ({
  disabledLiquiditySources,
  testMessagePassing,
  error,
  setError,
}: {
  disabledLiquiditySources: string[]
  testMessagePassing: boolean
  error: string
  setError: (error: string) => void
}) => {
  const [fromChain, setFromChain] = useState<BlockchainMeta | null>(null)
  const [fromToken, setFromToken] = useState<Token | null>(null)
  const [toChain, setToChain] = useState<BlockchainMeta | null>(null)
  const [toToken, setToToken] = useState<Token | null>(null)

  const [inputAmount, setInputAmount] = useState<string>('100')
  const [quote, setQuote] = useState<QuoteResponse | null>()
  const [txStatus, setTxStatus] = useState<StatusResponse | null>(null)
  const [loadingSwap, setLoadingSwap] = useState<boolean>(false)

  const [evmBalances, setEvmBalances] = useState<WalletDetail[]>([])
  const [cosmosBalances, setCosmosBalances] = useState<WalletDetail[]>([])
  const [solanaBalances, setSolanaBalances] = useState<WalletDetail[]>([])

  const { sdk } = useRangoClient()
  const { meta, metaLoading } = useMeta()
  const { selectedProtocols } = useMessagingProtocols()
  const { state, getSigners, connect, providers } = useWallets()

  const metamaskWalletState = state(WalletTypes.META_MASK)
  const keplrWalletState = state(WalletTypes.KEPLR)
  const phantomWalletState = state(WalletTypes.PHANTOM)

  useEffect(() => {
    if (meta) {
      const { fromChain, fromToken, toChain, toToken } =
        getSampleDefaultTokens(meta)
      setFromChain(fromChain || null)
      setToChain(toChain || null)
      setFromToken(fromToken || null)
      setToToken(toToken || null)
    }
  }, [meta])

  useEffect(() => {
    const getBalances = async (promises: Promise<WalletDetailsResponse>[]) => {
      const allBalances = (await Promise.allSettled(promises)).flatMap((p) =>
        p.status === 'fulfilled' ? p.value.wallets : []
      )
      setEvmBalances(allBalances)
    }

    if (metamaskWalletState.connected && metamaskWalletState.accounts) {
      const promises =
        meta?.blockchains
          .filter((chain) => chain.type === TransactionType.EVM)
          .map((chain) =>
            sdk.balance({
              address: metamaskWalletState.accounts?.[0]?.split(':')?.[1] || '',
              blockchain: chain.name,
            })
          ) || []

      getBalances(promises)
    }
  }, [metamaskWalletState.connected, metamaskWalletState.accounts])

  useEffect(() => {
    const getBalances = async (promises: Promise<WalletDetailsResponse>[]) => {
      const allBalances = (await Promise.allSettled(promises)).flatMap((p) =>
        p.status === 'fulfilled' ? p.value.wallets : []
      )
      setSolanaBalances(allBalances)
    }

    if (phantomWalletState.connected && phantomWalletState.accounts) {
      const promises =
        meta?.blockchains
          .filter((chain) => chain.type === TransactionType.SOLANA)
          .map((chain) =>
            sdk.balance({
              address: phantomWalletState.accounts?.[0]?.split(':')?.[1] || '',
              blockchain: chain.name,
            })
          ) || []

      getBalances(promises)
    }
  }, [phantomWalletState.connected, phantomWalletState.accounts])

  useEffect(() => {
    const getBalances = async (promises: Promise<WalletDetailsResponse>[]) => {
      const allBalances = (await Promise.allSettled(promises)).flatMap((p) =>
        p.status === 'fulfilled' ? p.value.wallets : []
      )
      setCosmosBalances(allBalances)
    }

    if (keplrWalletState.connected && keplrWalletState.accounts) {
      const promises =
        keplrWalletState.accounts.map((account) =>
          sdk.balance({
            address: account?.split(':')?.[1] || '',
            blockchain: account?.split(':')?.[0] || '',
          })
        ) || []

      getBalances(promises)
    }
  }, [keplrWalletState.connected, keplrWalletState.accounts])

  useEffect(() => {
    setFromToken(null)
  }, [fromChain])

  useEffect(() => {
    setToToken(null)
  }, [toChain])

  const handleSwitchFromAndTo = () => {
    setFromChain(toChain)
    setFromToken(toToken)
    setToChain(fromChain)
    setToToken(fromToken)
  }

  const getWalletByChainType: (chainType: string) => WalletTypes = (
    chainType
  ) => {
    if (chainType === TransactionType.EVM) {
      return WalletTypes.META_MASK
    } else if (chainType === TransactionType.SOLANA) {
      return WalletTypes.PHANTOM
    } else {
      return WalletTypes.KEPLR
    }
  }

  const getAddressByChain = (chain: BlockchainMeta | null) => {
    if (!chain) return null

    console.log(chain)

    if (chain.type === TransactionType.EVM) {
      return metamaskWalletState.accounts?.[0]?.split(':')?.[1]
    } else if (chain.type === TransactionType.SOLANA) {
      return phantomWalletState.accounts?.[0]?.split(':')?.[1]
    } else if (chain.type === TransactionType.COSMOS) {
      return keplrWalletState.accounts
        ?.find((account) => account.split(':')?.[0] === chain.name)
        ?.split(':')?.[1]
    }
  }

  const checkConnectedWalletError = async () => {
    if (
      (fromChain?.type === TransactionType.EVM ||
        toChain?.type === TransactionType.EVM) &&
      !metamaskWalletState.connected
    ) {
      try {
        await connect(WalletTypes.META_MASK)
      } catch (error) {
        console.log(error)

        return 'Error connecting to Metamask. Please check Metamask and try again.'
      }
    }

    if (
      (fromChain?.type === TransactionType.COSMOS ||
        toChain?.type === TransactionType.COSMOS) &&
      !keplrWalletState.connected
    ) {
      try {
        await connect(WalletTypes.KEPLR)
      } catch (error) {
        console.log(error)

        return 'Error connecting to Keplr. Please check Keplr and try again.'
      }
    }

    if (
      (fromChain?.type === TransactionType.SOLANA ||
        toChain?.type === TransactionType.SOLANA) &&
      !phantomWalletState.connected
    ) {
      try {
        await connect(WalletTypes.PHANTOM)
      } catch (error) {
        console.log(error)

        return 'Error connecting to Phantom. Please check Phantom and try again.'
      }
    }

    return false
  }

  const handleSwap = async () => {
    setError('')
    setQuote(null)

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
    if (!inputAmount) {
      setError('Set input amount')
      return
    }

    const connectedWalletError = await checkConnectedWalletError()

    if (connectedWalletError) {
      setError(connectedWalletError)
      return
    }

    if (
      fromChain?.type === TransactionType.EVM &&
      fromChain?.chainId &&
      parseInt(fromChain.chainId) !==
        parseInt(providers()[WalletTypes.META_MASK]?.chainId)
    ) {
      try {
        const provider = providers()[WalletTypes.META_MASK]
        await provider.send('wallet_switchEthereumChain', [
          { chainId: `0x${Number(fromChain.chainId).toString(16)}` },
        ])
      } catch (e) {
        setError(`Change meta mask network to '${fromChain?.name}'.`)
        return
      }
    }

    const fromAddress = getAddressByChain(fromChain)
    const toAddress = getAddressByChain(toChain)

    if (!fromAddress) {
      setError(`Could not get from wallet address.`)
      return
    }

    if (!toAddress) {
      setError(`Could not get to wallet address.`)
      return
    }

    const from: Asset = {
      blockchain: fromToken.blockchain as string,
      symbol: fromToken.symbol as string,
      address: fromToken.address as string,
    }
    const to: Asset = {
      blockchain: toToken.blockchain,
      symbol: toToken.symbol as string,
      address: toToken.address as string,
    }
    const amount: string = new BigNumber(inputAmount)
      .shiftedBy(fromToken?.decimals as number)
      .toString()

    // const sampleImMessage = ethers.utils.defaultAbiCoder.encode(
    //   ['(address,address)'],
    //   [
    //     [
    //       fromToken.address || '0x0000000000000000000000000000000000000000',
    //       userAddress,
    //     ],
    //   ]
    // )

    let request: QuoteRequest = {
      amount,
      from,
      to,
      swapperGroups: disabledLiquiditySources,
      swappersGroupsExclude: true,
    }
    if (testMessagePassing) {
      request = {
        ...request,
        messagingProtocols: selectedProtocols,
        sourceContract: '???', // TODO
        destinationContract: '???', // TODO
      }
    }

    setLoadingSwap(true)

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
        await executeRoute(
          from,
          to,
          fromAddress,
          toAddress,
          amount
          // sampleImMessage
        )
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
    toAddress: string,
    inputAmount: string
    // imMessage?: string
  ) => {
    if (!fromToken || !toToken || !fromChain || !toChain) return

    const signer = getSigners(
      getWalletByChainType(fromChain?.type as TransactionType)
    ).getSigner(fromChain?.type as TransactionType)

    let swap: SwapResponse | null = null

    try {
      let swapRequest: SwapRequest = {
        from,
        to,
        amount: inputAmount,
        fromAddress: fromAddress,
        toAddress: toAddress,
        disableEstimate: false,
        referrerAddress: null,
        referrerFee: null,
        slippage: '1.0',
        swapperGroups: disabledLiquiditySources,
        swappersGroupsExclude: true,
      }
      if (testMessagePassing) {
        swapRequest = {
          ...swapRequest,
          messagingProtocols: selectedProtocols,
          sourceContract: '???', // TODO
          destinationContract: '???', // TODO
          // imMessage,
        }
      }
      console.log({ swapRequest })
      swap = await sdk.swap(swapRequest)
      console.log({ swapResponse: swap })

      if (!!swap.error || swap.resultType !== RoutingResultType.OK) {
        setError(
          `Error swapping, routing result: ${swap.resultType}, error: ${swap.error}`
        )
        setLoadingSwap(false)
        return
      }

      if (fromChain.type === TransactionType.EVM) {
        const tx = swap.tx as EvmTransaction

        if (tx) {
          // if approve data is not null, it means approve needed, otherwise it's already approved.
          if (!!tx?.approveData) {
            // try to approve

            const result = await signer.signAndSendTx(
              {
                type: TransactionType.EVM,
                blockChain: tx.blockChain?.name,
                isApprovalTx: !!tx.approveData,
                from: tx.from,
                to: tx.txTo,
                data: tx.txData,
                value: tx.value,
                nonce: null,
                gasLimit: tx.gasLimit,
                gasPrice: tx.gasPrice,
                maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
                maxFeePerGas: tx.maxFeePerGas,
              },
              fromAddress,
              fromChain.chainId
            )
            await checkApprovalSync(swap.requestId, result.hash, sdk)
            console.log('transaction approved successfully')
          } else {
            const result = await signer.signAndSendTx(
              {
                type: TransactionType.EVM,
                blockChain: tx.blockChain?.name,
                isApprovalTx: !!tx.approveData,
                from: tx.from,
                to: tx.txTo,
                data: tx.txData,
                value: tx.value,
                nonce: null,
                gasLimit: tx.gasLimit,
                gasPrice: tx.gasPrice,
                maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
                maxFeePerGas: tx.maxFeePerGas,
              },
              fromAddress,
              fromChain.chainId
            )
            const txStatus = await checkTransactionStatusSync(
              swap.requestId,
              result.hash,
              sdk
            )
            console.log('transaction finished', { txStatus })
            console.log('bridged data?', txStatus.bridgeData)
          }
        }
      } else {
        const tx = swap.tx as CosmosTransaction | Transfer
        const result = await signer.signAndSendTx(
          tx,
          fromAddress,
          fromChain.chainId
        )

        const txStatus = await checkTransactionStatusSync(
          swap.requestId,
          result.hash,
          sdk
        )

        console.log('transaction finished', { txStatus })
        console.log('bridged data?', txStatus.bridgeData)
      }

      setLoadingSwap(false)
    } catch (e) {
      const rawMessage = JSON.stringify(e).substring(0, 90) + '...'
      setLoadingSwap(false)
      setError(rawMessage)
      // report transaction failure to server if something went wrong in client for signing and sending the transaction
      if (!!swap) {
        await sdk.reportFailure({
          data: { message: rawMessage },
          eventType: 'SEND_TX_FAILED',
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

  return (
    <>
      <TokenInfo
        type="From"
        chain={fromChain}
        setToken={setFromToken}
        setChain={setFromChain}
        token={fromToken}
        loading={metaLoading}
        setInputAmount={setInputAmount}
        amount={inputAmount}
        balances={[...evmBalances, ...solanaBalances, ...cosmosBalances]}
        blockchains={meta?.blockchains || []}
        tokens={meta?.tokens || []}
      />
      <div className="switch-button-container">
        <Button variant="ghost" onClick={handleSwitchFromAndTo}>
          <VerticalSwapIcon size={36} />
        </Button>
      </div>
      <TokenInfo
        chain={toChain}
        balances={[...evmBalances, ...solanaBalances, ...cosmosBalances]}
        token={toToken}
        setToken={setToToken}
        setChain={setToChain}
        type="To"
        blockchains={meta?.blockchains || []}
        tokens={meta?.tokens || []}
        loading={metaLoading}
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
          onClick={handleSwap}
          loading={loadingSwap}
          type="primary"
        >
          Swap
        </Button>
      </div>
    </>
  )
}

export default SwapContent
