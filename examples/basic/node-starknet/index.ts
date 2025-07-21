// run `node --import=tsx index.ts` in the terminal

import {
  RangoClient,
  TransactionStatus,
  TransactionType,
} from 'rango-sdk-basic'
import {
  logQuote,
  logWallet,
  logSwap,
  logSwapStatus,
  logTransactionHash,
} from '../shared/utils/logger.js'
import { setTimeout } from 'timers/promises'
import { DefaultStarknetSigner } from '@rango-dev/signer-starknet'
import { Account, RpcProvider } from 'starknet'

// setup wallet
const privateKey = 'YOUR_PRIVATE_KEY' // Replace with your private key
const walletAddress = 'YOUR_WALLET_ADDRESS' // Replace with your wallet address

// in web based apps, you could use injected provider instead
// e.g. use window.starknet_braavos or window.starknet_argentX instead
// https://starknetjs.com/docs/guides/connect_network
const provider = new RpcProvider({
  nodeUrl: 'https://starknet-mainnet.public.blastapi.io/rpc/v0_7',
})
const account = new Account(provider, walletAddress, privateKey)

logWallet(walletAddress)

// initiate sdk using your api key
const API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
const rango = new RangoClient(API_KEY)

// some example tokens for test purpose
const sourceBlockchain = 'STARKNET'
const sourceTokenAddress =
  '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
const targetBlockchain = 'STARKNET'
const targetTokenAddress =
  '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
const amount = '1000000000'

// get quote
const quoteRequest = {
  from: { blockchain: sourceBlockchain, address: sourceTokenAddress },
  to: { blockchain: targetBlockchain, address: targetTokenAddress },
  amount,
  slippage: 1.0,
}
const quote = await rango.quote(quoteRequest)
logQuote(quote)

const swapRequest = {
  ...quoteRequest,
  fromAddress: walletAddress,
  toAddress: walletAddress,
}

// create transaction
const swap = await rango.swap(swapRequest)
logSwap(swap)

const tx = swap.tx

if (!tx) {
  throw new Error(`Error creating the transaction ${swap.error}`)
}

if (tx.type === TransactionType.STARKNET) {
  const defaultSigner = new DefaultStarknetSigner({
    account,
    enable: () => {
      //do nothing
    },
  })

  const { hash } = await defaultSigner.signAndSendTx(tx)
  logTransactionHash(hash, false)

  // track swap status
  while (true) {
    await setTimeout(10_000)
    const state = await rango.status({
      requestId: swap.requestId,
      txId: hash,
    })
    logSwapStatus(state)

    const status = state.status
    if (
      status &&
      [TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(status)
    ) {
      break
    }
  }
}
