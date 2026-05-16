import { setTimeout } from 'node:timers/promises'
import * as StellarSdk from '@stellar/stellar-sdk'
import { StellarTransaction } from 'rango-types'
import {
  RangoClient,
  SwapRequest,
  TransactionStatus,
  TransactionType,
} from 'rango-sdk-basic'
import {
  logMeta,
  logQuote,
  logSwap,
  logSwapStatus,
} from '../shared/utils/logger.js'

import { StellarChangeTrustLinePrerequisite } from 'rango-types/lib/api/shared/prerequisites/stellar.js'
import BigNumber from 'bignumber.js'

const HORIZON_URL = 'https://horizon.stellar.org'
const NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015'

const SECRET_KEY = 'YOUR_STELLAR_SECRET_KEY'
const API_KEY = 'c6381a79-2817-4602-83bf-6a641a409e32'
const RPC_URL = 'https://mainnet.sorobanrpc.com'

const BASE_FEE = '100'
const TRUST_LINE_TIMEOUT = 30

const SOROBAN_OP_TYPES = [
  'invokeHostFunction',
  'restoreFootprint',
  'extendFootprintTtl',
]

const EVM_ADDRESS = '0x8b5b3F18db50713709da94f88f9f5EEc339D1E4E'

const SOURCE_CHAIN = 'STELLAR'
const SOURCE_TOKEN_ADDR = null
const DESTINATION_CHAIN = 'BSC'
const DESTINATION_TOKEN_ADDR = null
const AMOUNT = '10000000'
const SLIPPAGE = 1.0

const CHECK_STATUS_INTERVAL = 10_000

async function createStellarChangeTrustLineXdrTransaction(
  prerequisite: StellarChangeTrustLinePrerequisite
) {
  const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org')
  const account = await server.loadAccount(prerequisite.wallet)
  const asset = new StellarSdk.Asset(prerequisite.code, prerequisite.issuer)

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: asset,
        limit: prerequisite.value,
      })
    )
    .setTimeout(TRUST_LINE_TIMEOUT)
    .build()

  return transaction.toXDR()
}

async function checkStellarChangeTrustLinePrerequisite(
  prerequisite: StellarChangeTrustLinePrerequisite,
  keyPair: StellarSdk.Keypair
) {
  // 1. Check if the trust line is already opened
  const server = new StellarSdk.Horizon.Server(HORIZON_URL)
  const account = await server.loadAccount(prerequisite.wallet)

  const nonNativeBalances = account.balances.filter(
    (balance) =>
      balance.asset_type !== 'native' &&
      balance.asset_type !== 'liquidity_pool_shares'
  )

  const trustLines = nonNativeBalances.map((balance) => {
    return {
      code: balance.asset_code,
      issuer: balance.asset_issuer,
      limit: balance.limit,
    }
  })

  if (
    trustLines.some(
      (trustLine) =>
        trustLine.code === prerequisite.code &&
        trustLine.issuer === prerequisite.issuer &&
        new BigNumber(trustLine.limit).gt(prerequisite.value)
    )
  ) {
    console.log('Trust line already opened')
    return
  }

  // 2. Create Trust Line Transaction
  const stellarChangeTrustLineXdrTransaction =
    await createStellarChangeTrustLineXdrTransaction(prerequisite)

  const originalTx = new StellarSdk.Transaction(
    stellarChangeTrustLineXdrTransaction,
    NETWORK_PASSPHRASE
  )

  // 3. Sign Transaction
  originalTx.sign(keyPair)

  // 4. Submit Transaction
  const result = await server.submitTransaction(originalTx)

  if (!result.successful) {
    throw new Error('Error submitting trust line transaction')
  }

  console.log(
    `Trust line opened successfully for ${prerequisite.code} ${prerequisite.issuer}. Transaction hash: ${result.hash}`
  )
}

async function buildXdrTransaction(
  tx: StellarTransaction,
  address: string
): Promise<string> {
  const server = new StellarSdk.Horizon.Server(HORIZON_URL)
  const account = await server.loadAccount(address)

  const builder = new StellarSdk.TransactionBuilder(account, {
    networkPassphrase: NETWORK_PASSPHRASE,
    fee: tx.data.baseFee ?? BASE_FEE,
    timebounds: tx.data.preconditions.timeBounds,
    ledgerbounds: tx.data.preconditions.ledgerBounds,
    minAccountSequence: tx.data.preconditions.minSeqNumber ?? undefined,
    minAccountSequenceAge: tx.data.preconditions.minSeqAge ?? undefined,
    minAccountSequenceLedgerGap:
      tx.data.preconditions.minSeqLedgerGap ?? undefined,
    extraSigners: tx.data.preconditions.extraSigners ?? undefined,
  })

  if (tx.data.memoXdrBase64) {
    const memoXDRObject = StellarSdk.xdr.Memo.fromXDR(
      tx.data.memoXdrBase64,
      'base64'
    )

    builder.addMemo(StellarSdk.Memo.fromXDRObject(memoXDRObject))
  }

  for (const operationXdrBase64 of tx.data.operationsXdrBase64) {
    const operationXDRObject = StellarSdk.xdr.Operation.fromXDR(
      operationXdrBase64,
      'base64'
    )
    builder.addOperation(operationXDRObject)
  }

  const transaction = builder.build()

  const isSorobanTransaction = transaction.operations.some((operation) =>
    SOROBAN_OP_TYPES.includes(operation.type)
  )

  if (isSorobanTransaction) {
    const rpcServer = new StellarSdk.rpc.Server(RPC_URL)
    const preparedTransaction = await rpcServer.prepareTransaction(transaction)
    const xdrTransaction = preparedTransaction.toXDR()
    return xdrTransaction
  }

  const xdrTransaction = transaction.toXDR()

  return xdrTransaction
}

async function main() {
  //1. Generate key pair from secret key
  const keyPair = StellarSdk.Keypair.fromSecret(SECRET_KEY)
  const publicKey = keyPair.publicKey()

  // 2. Initialize client and fetch metadata
  const rango = new RangoClient(API_KEY)
  const metadata = await rango.meta()
  logMeta(metadata)

  // 3. Request a quote
  const quoteRequest = {
    from: { blockchain: SOURCE_CHAIN, address: SOURCE_TOKEN_ADDR },
    to: { blockchain: DESTINATION_CHAIN, address: DESTINATION_TOKEN_ADDR },
    amount: AMOUNT,
    slippage: SLIPPAGE,
  }

  const quote = await rango.quote(quoteRequest)
  logQuote(quote)

  // 4. Build and send swap request
  const swapRequest: SwapRequest = {
    ...quoteRequest,
    fromAddress: publicKey,
    toAddress: EVM_ADDRESS,
  }
  const swap = await rango.swap(swapRequest)
  logSwap(swap)
  const { tx } = swap
  if (tx?.type !== TransactionType.STELLAR)
    throw new Error('Invalid transaction structure')

  // Step 5: Check Prerequisites
  const prerequisites = tx.prerequisites

  for (const prerequisite of prerequisites) {
    if (prerequisite.type === 'STELLAR_CHANGE_TRUSTLINE') {
      checkStellarChangeTrustLinePrerequisite(prerequisite, keyPair)
    } else {
      throw new Error(`Unsupported prerequisite type: ${prerequisite.type}`)
    }
  }

  // Step 9: Sign and finalize transaction
  const xdrTransaction = await buildXdrTransaction(tx, publicKey)
  const originalTx = new StellarSdk.Transaction(
    xdrTransaction,
    NETWORK_PASSPHRASE
  )

  originalTx.sign(keyPair)

  const server = new StellarSdk.Horizon.Server(HORIZON_URL)
  const result = await server.submitTransaction(originalTx)

  if (!result.successful) {
    throw new Error('Error submitting transaction')
  }

  const txId = result.hash

  // Step 10: Monitor execution status
  while (true) {
    await setTimeout(CHECK_STATUS_INTERVAL)
    const state = await rango.status({
      requestId: swap.requestId,
      txId,
    })
    logSwapStatus(state)

    const status = state.status
    if (
      status &&
      ![TransactionStatus.FAILED, TransactionStatus.SUCCESS].includes(status)
    ) {
      break
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
