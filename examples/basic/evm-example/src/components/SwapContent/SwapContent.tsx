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
  EvmTransaction,
} from 'rango-sdk-basic'
import {
  TronTransaction,
  CosmosTransaction,
  Transfer,
  SolanaTransaction,
} from 'rango-types'
import { ethers } from 'ethers'
import { checkApprovalSync, getSampleDefaultTokens, sleep } from '../../utils'
import BigNumber from 'bignumber.js'
import { Button, VerticalSwapIcon } from '@rango-dev/ui'
import { TokenInfo } from '../../components/TokenInfo'
import { SwapDetails } from '../../components/SwapDetails'
import { useWallets } from '@rango-dev/wallets-react'
import { WalletTypes } from '@rango-dev/wallets-shared'
import { useRangoClient } from '../../hooks/useRangoClient'
import { useMessagingProtocols } from '../../hooks/useMessagingProtocols'
import { useMeta } from '../../hooks/useMeta'
import {
  getCosmosAddressByChain,
  getCosmosBalances,
  getEVMAddress,
  getEvmBalances,
  getSolanaAddress,
  getSolanaBalances,
  getTransferAddressByChain,
  getTransferBalances,
  getTronAddress,
  getTronBalances,
  getWalletByChainType,
} from '../../helpers/walletsHelper'

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
  const [tronBalances, setTronBalances] = useState<WalletDetail[]>([])
  const [transferBalances, setTransferBalances] = useState<WalletDetail[]>([])

  const { sdk, enableCentralizedSwappers } = useRangoClient()
  const { meta, metaLoading } = useMeta()
  const { selectedProtocols } = useMessagingProtocols()
  const { state, getSigners, connect, providers, disconnect } = useWallets()

  const metamaskWalletState = state(WalletTypes.META_MASK)
  const keplrWalletState = state(WalletTypes.KEPLR)
  const phantomWalletState = state(WalletTypes.PHANTOM)
  const tronLinkWalletState = state(WalletTypes.TRON_LINK)
  const xdefiWalletState = state(WalletTypes.XDEFI)

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
    if (metamaskWalletState.connected && metamaskWalletState.accounts && meta) {
      getEvmBalances(meta, sdk, metamaskWalletState).then((evmBalances) =>
        setEvmBalances(evmBalances)
      )
    }
  }, [metamaskWalletState.connected, metamaskWalletState.accounts])

  useEffect(() => {
    if (phantomWalletState.connected && phantomWalletState.accounts && meta) {
      getSolanaBalances(meta, sdk, phantomWalletState).then((solanaBalances) =>
        setSolanaBalances(solanaBalances)
      )
    }
  }, [phantomWalletState.connected, phantomWalletState.accounts])

  useEffect(() => {
    if (keplrWalletState.connected && keplrWalletState.accounts && meta) {
      getCosmosBalances(meta, sdk, keplrWalletState).then((cosmosBalances) =>
        setCosmosBalances(cosmosBalances)
      )
    }
  }, [keplrWalletState.connected, keplrWalletState.accounts])

  useEffect(() => {
    if (tronLinkWalletState.connected && tronLinkWalletState.accounts && meta) {
      getTronBalances(meta, sdk, tronLinkWalletState).then((tronBalances) =>
        setTronBalances(tronBalances)
      )
    }
  }, [tronLinkWalletState.connected, tronLinkWalletState.accounts])

  useEffect(() => {
    if (xdefiWalletState.connected && xdefiWalletState.accounts && meta) {
      getTransferBalances(meta, sdk, xdefiWalletState).then(
        (transferBalances) => setTransferBalances(transferBalances)
      )
    }
  }, [xdefiWalletState.connected, xdefiWalletState.accounts])

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

  const getAddressByChain = (chain: BlockchainMeta | null) => {
    if (!chain) return null

    console.log(chain)

    if (chain.type === TransactionType.EVM) {
      return getEVMAddress(metamaskWalletState)
    } else if (chain.type === TransactionType.SOLANA) {
      return getSolanaAddress(phantomWalletState)
    } else if (chain.type === TransactionType.COSMOS) {
      return getCosmosAddressByChain(chain.name, keplrWalletState)
    } else if (chain.type === TransactionType.TRANSFER) {
      return getTransferAddressByChain(chain.name, xdefiWalletState)
    } else if (chain.type === TransactionType.TRON) {
      return getTronAddress(tronLinkWalletState)
    }
  }

  const tryConnectWallet = async (
    walletType: WalletTypes,
    walletName: string
  ) => {
    try {
      await connect(walletType)
    } catch (error) {
      console.log(error)
      return `Error connecting to ${walletName}. Please check ${walletName} and try again.`
    }
  }

  const checkConnectedWalletError = async () => {
    if (
      (fromChain?.type === TransactionType.EVM ||
        toChain?.type === TransactionType.EVM) &&
      !metamaskWalletState.connected
    ) {
      return tryConnectWallet(WalletTypes.META_MASK, 'Metamask')
    }

    if (
      (fromChain?.type === TransactionType.COSMOS ||
        toChain?.type === TransactionType.COSMOS) &&
      !keplrWalletState.connected
    ) {
      return tryConnectWallet(WalletTypes.KEPLR, 'Keplr')
    }

    if (
      (fromChain?.type === TransactionType.SOLANA ||
        toChain?.type === TransactionType.SOLANA) &&
      !phantomWalletState.connected
    ) {
      return tryConnectWallet(WalletTypes.PHANTOM, 'Phantom')
    }

    if (
      (fromChain?.type === TransactionType.TRANSFER ||
        toChain?.type === TransactionType.TRANSFER) &&
      !xdefiWalletState.connected
    ) {
      return tryConnectWallet(WalletTypes.XDEFI, 'Xdefi')
    }

    if (
      (fromChain?.type === TransactionType.TRON ||
        toChain?.type === TransactionType.TRON) &&
      !tronLinkWalletState.connected
    ) {
      return tryConnectWallet(WalletTypes.TRON_LINK, 'TronLink')
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
        await disconnect(WalletTypes.META_MASK)
        await connect(WalletTypes.META_MASK, fromChain.name)
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
    if (enableCentralizedSwappers) {
      request.enableCentralizedSwappers = true
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
        await executeRoute(from, to, fromAddress, toAddress, amount)
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

      if (enableCentralizedSwappers) {
        swapRequest.enableCentralizedSwappers = true
      }

      if (testMessagePassing && fromChain.type === TransactionType.EVM) {
        const sampleImMessage = ethers.utils.defaultAbiCoder.encode(
          ['(address,address)'],
          [
            [
              fromToken.address || '0x0000000000000000000000000000000000000000',
              toAddress,
            ],
          ]
        )

        swapRequest = {
          ...swapRequest,
          messagingProtocols: selectedProtocols,
          sourceContract: '???', // TODO
          destinationContract: '???', // TODO
          imMessage: sampleImMessage,
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
                to: !!tx.approveTo ? tx.approveTo : tx.txTo,
                data: !!tx.approveData ? tx.approveData : tx.txData,
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
          }
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
      } else {
        const tx = swap.tx as
          | CosmosTransaction
          | Transfer
          | TronTransaction
          | SolanaTransaction
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
        balances={[
          ...evmBalances,
          ...solanaBalances,
          ...cosmosBalances,
          ...tronBalances,
          ...transferBalances,
        ]}
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
        balances={[
          ...evmBalances,
          ...solanaBalances,
          ...cosmosBalances,
          ...tronBalances,
          ...transferBalances,
        ]}
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
