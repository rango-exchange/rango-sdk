import { setTimeout } from 'node:timers/promises'
import * as StellarSdk from '@stellar/stellar-sdk'
import {
  StellarTransaction,
  StellarChangeTrustLinePrerequisite,
} from 'rango-types'
import {
  BestRouteRequest,
  CreateTransactionRequest,
  RangoClient,
  TransactionStatus,
  TransactionType,
} from 'rango-sdk'
import { findToken } from '../shared/utils/meta.js'
import {
  logMeta,
  logSelectedTokens,
  logRoutes,
  logStepStatus,
  logConfirmedRoute,
} from '../shared/utils/logger.js'

import BigNumber from 'bignumber.js'

const HORIZON_URL = 'https://horizon.stellar.org'
const NETWORK_PASSPHRASE = 'NETWORK_PASSPHRASE' // eg. 'Public Global Stellar Network ; September 2015'

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

const SOURCE_CHAIN = 'STELLAR'
const SOURCE_TOKEN_ADDR = 'SOURCE_TOKEN_ADDR' // eg. 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const DESTINATION_CHAIN = 'DESTINATION_CHAIN' // eg. BSC
const DESTINATION_TOKEN_ADDR = 'DESTINATION_TOKEN_ADDR' // eg. 0x55d398326f99059ff775485246999027b3197955
const DESTINATION_ADDRESS = 'DESTINATION_ADDRESS' // eg. 0x8b5b3F18db50713709da94f88f9f5EEc339D1E4E
const AMOUNT = '1'
const SLIPPAGE = '1.0'
const MAX_STEPS = 1 // Limit to one route
const STEP_INDEX = 1 // Execute the first step

const TRUST_LINE_INFINITE_VALUE = '922337203685.4775807' // https://stellar-sdk.readthedocs.io/en/stable/_modules/stellar_sdk/operation/change_trust.html

const CHECK_STATUS_INTERVAL = 10_000

async function createStellarChangeTrustLineXdrTransaction(
  prerequisite: StellarChangeTrustLinePrerequisite,
) {
  const server = new StellarSdk.Horizon.Server(HORIZON_URL)
  const account = await server.loadAccount(prerequisite.wallet)
  const asset = new StellarSdk.Asset(prerequisite.code, prerequisite.issuer)

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: asset,
        limit: TRUST_LINE_INFINITE_VALUE,
      }),
    )
    .setTimeout(TRUST_LINE_TIMEOUT)
    .build()

  return transaction.toXDR()
}

async function checkStellarChangeTrustLinePrerequisite(
  prerequisite: StellarChangeTrustLinePrerequisite,
  keyPair: StellarSdk.Keypair,
) {
  // 1. Check if the trust line is already opened
  const server = new StellarSdk.Horizon.Server(HORIZON_URL)
  const account = await server.loadAccount(prerequisite.wallet)

  const accountLines = account.balances.filter(
    (balance) =>
      balance.asset_type !== 'native' &&
      balance.asset_type !== 'liquidity_pool_shares',
  )

  const targetAccountLine = accountLines.find(
    (accountLine) =>
      accountLine.asset_code === prerequisite.code &&
      accountLine.asset_issuer === prerequisite.issuer,
  )

  if (targetAccountLine) {
    const lineLimit = new BigNumber(targetAccountLine.limit)
    const targetLimit = new BigNumber(TRUST_LINE_INFINITE_VALUE)

    if (lineLimit.gte(targetLimit)) {
      console.log('Trust line already opened')
      return
    }
  }

  // 2. Create Trust Line Transaction
  const stellarChangeTrustLineXdrTransaction =
    await createStellarChangeTrustLineXdrTransaction(prerequisite)

  const originalTx = new StellarSdk.Transaction(
    stellarChangeTrustLineXdrTransaction,
    NETWORK_PASSPHRASE,
  )

  // 3. Sign Transaction
  originalTx.sign(keyPair)

  // 4. Submit Transaction
  const result = await server.submitTransaction(originalTx)

  if (!result.successful) {
    throw new Error('Error submitting trust line transaction')
  }

  console.log(
    `Trust line opened successfully for ${prerequisite.code} ${prerequisite.issuer}. Transaction hash: ${result.hash}`,
  )
}

async function buildXdrTransaction(
  tx: StellarTransaction,
  address: string,
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
      'base64',
    )

    builder.addMemo(StellarSdk.Memo.fromXDRObject(memoXDRObject))
  }

  for (const operationXdrBase64 of tx.data.operationsXdrBase64) {
    const operationXDRObject = StellarSdk.xdr.Operation.fromXDR(
      operationXdrBase64,
      'base64',
    )
    builder.addOperation(operationXDRObject)
  }

  const transaction = builder.build()

  const isSorobanTransaction = transaction.operations.some((operation) =>
    SOROBAN_OP_TYPES.includes(operation.type),
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
  const metadata = await rango.getAllMetadata()
  logMeta(metadata)

  // 3. Select tokens for routing
  const sourceToken = findToken(
    metadata.tokens,
    SOURCE_CHAIN,
    SOURCE_TOKEN_ADDR,
  )
  const targetToken = findToken(
    metadata.tokens,
    DESTINATION_CHAIN,
    DESTINATION_TOKEN_ADDR,
  )
  logSelectedTokens(sourceToken, targetToken)

  // 4. Request possible routes
  const routeRequest: BestRouteRequest = {
    from: sourceToken,
    to: targetToken,
    amount: AMOUNT,
    slippage: SLIPPAGE,
    maxLength: MAX_STEPS,
    transactionTypes: [TransactionType.STELLAR],
    selectedWallets: {},
  }

  const routeResponse = await rango.getAllRoutes(routeRequest)
  logRoutes(routeResponse)
  if (!routeResponse.results.length) {
    throw new Error(`No routes available: ${routeResponse.error}`)
  }

  // Step 5: Confirm the chosen route
  const chosen = routeResponse.results[0]
  const walletsMap = chosen.swaps
    .flatMap((s) => [s.from.blockchain, s.to.blockchain])
    .filter((value, index, self) => self.indexOf(value) === index)
    .reduce(
      (acc, chain) => ({
        ...acc,
        [chain]: chain === SOURCE_CHAIN ? publicKey : DESTINATION_ADDRESS,
      }),
      {} as Record<string, string>,
    )
  const confirmResponse = await rango.confirmRoute({
    requestId: chosen.requestId,
    selectedWallets: walletsMap,
  })

  const confirmedRoute = confirmResponse.result

  if (!confirmedRoute) {
    throw new Error(`Error in confirming route, ${confirmResponse.error}`)
  }

  logConfirmedRoute(confirmedRoute)

  // Step 6: Validate balances and fees
  for (const val of confirmedRoute?.validationStatus || []) {
    for (const wallet of val.wallets) {
      for (const asset of wallet.requiredAssets) {
        if (!asset.ok) {
          throw new Error(
            `Insufficient ${asset.reason}: need ${asset.requiredAmount.amount}, have ${asset.currentAmount.amount}`,
          )
        }
      }
    }
  }

  // Step 7: Create transaction
  const txRequest: CreateTransactionRequest = {
    requestId: confirmedRoute.requestId,
    step: STEP_INDEX,
    userSettings: { slippage: SLIPPAGE, infiniteApprove: false },
    validations: { approve: true, balance: false, fee: false },
  }
  const { transaction } = await rango.createTransaction(txRequest)
  const swapSteps = confirmedRoute?.result?.swaps
  if (
    transaction?.type !== TransactionType.STELLAR ||
    !swapSteps ||
    swapSteps.length > MAX_STEPS
  ) {
    throw new Error('Transaction creation failed')
  }

  // Step 8: Check Prerequisites
  const prerequisites = transaction.prerequisites

  for (const prerequisite of prerequisites) {
    if (prerequisite.type === 'STELLAR_CHANGE_TRUSTLINE') {
      await checkStellarChangeTrustLinePrerequisite(prerequisite, keyPair)
    } else {
      throw new Error(`Unsupported prerequisite type: ${prerequisite.type}`)
    }
  }

  // Step 9: Sign and finalize transaction
  const xdrTransaction = await buildXdrTransaction(transaction, publicKey)
  const originalTx = new StellarSdk.Transaction(
    xdrTransaction,
    NETWORK_PASSPHRASE,
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
    const statusResponse = await rango.checkStatus({
      requestId: confirmedRoute.requestId,
      txId,
      step: STEP_INDEX,
    })
    logStepStatus(statusResponse)
    if (statusResponse.status === TransactionStatus.SUCCESS) break
    if (statusResponse.status === TransactionStatus.FAILED) {
      throw new Error(`Step ${STEP_INDEX} failed`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
