import type { SdkActions, SignedEntryResult, TaskResult } from './types.js'
import type { BlockReason, SignResult } from '../mod.js'
import type { BlockchainMeta } from 'rango-sdk'
import type { TransactionPrerequisite } from 'rango-types'

import { TransactionType } from 'rango-types'

import {
  buildEvmChainDescription,
  loadBlockchainMetaOf,
} from './blockchain-meta.js'
import {
  PREREQUISITE_READ_FAILURE_MESSAGE_BY_TYPE,
  TRUSTLINE_LIMIT_BY_BLOCKCHAIN,
} from './constants.js'
import { ErrorToReport, isCanceled } from './execution-failure.js'
import {
  signPostAndLookUpHyperliquidHash,
  waitForHyperliquidHashAndStoreIt,
} from './hyperliquid.js'
import {
  buildEvmApproveTx,
  buildXrplTrustSetTx,
  getRequiredGrantAmount,
  isGrantedAmountEnough,
  proveEvmApproveOnChain,
  proveTronApproveOnChain,
  proveXrplTrustlineOnChain,
  runPrerequisiteReadOrBuildOrThrowReported,
  storeEntryCompletedAndEmitApprovalSucceeded,
} from './prerequisite.js'
import { getRequiredWallet } from './required-wallet.js'
import {
  awaitSignResultAndBuildExplorerLink,
  buildMainTransactionSigner,
  signEntryAndStoreSignedHash,
} from './sign.js'
import { waitForHashThenPollStepStatus } from './transaction-status-polling.js'
import {
  getAccountBlockReason,
  switchToRequiredChainOrGetBlockReason,
} from './wallet-readiness.js'

// The signed hash, or `null` when the Prerequisite was already met or once the Execution is canceled.
async function signPrerequisiteUnlessAlreadyGranted<PrerequisiteTx>(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: TransactionPrerequisite,
  blockchainMeta: BlockchainMeta,
  readGrantedAmount: () => Promise<string | null>,
  buildPrerequisiteTx: () => Promise<PrerequisiteTx>,
  signPrerequisiteTx: (prerequisiteTx: PrerequisiteTx) => Promise<SignResult>,
): Promise<string | null> {
  let grantedAmount: string | null
  try {
    grantedAmount = await runPrerequisiteReadOrBuildOrThrowReported(
      readGrantedAmount,
      PREREQUISITE_READ_FAILURE_MESSAGE_BY_TYPE[prerequisite.type],
    )
  } catch (error) {
    if (isCanceled(actions)) {
      return null
    }
    throw error
  }
  if (isCanceled(actions)) {
    return null
  }
  const isAlreadyGranted = isGrantedAmountEnough(
    grantedAmount,
    getRequiredGrantAmount(prerequisite),
  )
  if (isAlreadyGranted) {
    const storageWithEntryCompleted = actions.getStorage()
    storageWithEntryCompleted.transactions[transactionId].execution.status =
      'completed'
    actions.setStorage(storageWithEntryCompleted)
    return null
  }

  const prerequisiteTx = await buildPrerequisiteTx()
  if (isCanceled(actions)) {
    return null
  }

  const signedPrerequisite = await signEntryAndStoreSignedHash(
    actions,
    transactionId,
    async () =>
      awaitSignResultAndBuildExplorerLink(
        signPrerequisiteTx(prerequisiteTx),
        blockchainMeta,
        'Approve',
      ),
  )
  return signedPrerequisite === null
    ? null
    : signedPrerequisite.walletResult.hash
}

/*
 * A signed one resumes its on-chain proof with no gate. Only an EVM approve's requests carry `blockchain`, and no
 * `sign` a chain ID: its chain was checked first. It is never handed to `wait`.
 */
async function gateSignAndProvePrerequisite(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: TransactionPrerequisite,
): Promise<TaskResult> {
  const { wallet } = actions.context
  const storage = actions.getStorage()
  const entry = storage.transactions[transactionId]
  const requiredWallet = {
    blockchain: prerequisite.blockChain,
    address: storage.data.selectedWallets[prerequisite.blockChain].address,
  }
  const notConnectedBlock: { block: BlockReason } = {
    block: {
      reason: 'NOT_CONNECTED',
      metadata: {
        blockchain: requiredWallet.blockchain,
        address: requiredWallet.address,
      },
    },
  }

  // The stored hash to resume with, else the gate's meta lookup, before the namespace is looked at.
  const { walletResult: storedWalletResult } = entry.execution.result
  const isSignedWithHash =
    entry.execution.status === 'signed' && storedWalletResult !== null
  const resumedHashOrBlockchainMeta:
    | { hashToResumeProving: string }
    | { blockchainMeta: BlockchainMeta } = isSignedWithHash
    ? { hashToResumeProving: storedWalletResult.hash }
    : {
        blockchainMeta: await loadBlockchainMetaOf(
          actions,
          requiredWallet.blockchain,
        ),
      }
  if (isCanceled(actions)) {
    return []
  }
  const isResumingSignedPrerequisite =
    'hashToResumeProving' in resumedHashOrBlockchainMeta

  switch (prerequisite.type) {
    case 'EVM_APPROVE': {
      const evm = wallet?.evm
      if (evm === undefined) {
        return notConnectedBlock
      }
      if (isResumingSignedPrerequisite) {
        return proveEvmApproveOnChain(
          actions,
          evm,
          transactionId,
          prerequisite,
          resumedHashOrBlockchainMeta.hashToResumeProving,
        )
      }
      const connectedAccounts = await evm
        .getAccounts({ blockchain: requiredWallet.blockchain })
        .catch(() => null)
      if (isCanceled(actions)) {
        return []
      }
      // The chain ID is looked up only once the accounts pass.
      const blockReason =
        getAccountBlockReason(requiredWallet, connectedAccounts) ??
        (await switchToRequiredChainOrGetBlockReason(
          actions,
          transactionId,
          requiredWallet,
          resumedHashOrBlockchainMeta.blockchainMeta.chainId,
          async () => evm.getChainId({ blockchain: requiredWallet.blockchain }),
          async (chainId) =>
            evm.switchChain({
              blockchain: requiredWallet.blockchain,
              chainId,
              chain: buildEvmChainDescription(
                resumedHashOrBlockchainMeta.blockchainMeta,
              ),
            }),
        ))
      if (isCanceled(actions)) {
        return []
      }
      if (blockReason !== null) {
        return { block: blockReason }
      }
      const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
        actions,
        transactionId,
        prerequisite,
        resumedHashOrBlockchainMeta.blockchainMeta,
        async () =>
          evm.getAllowance({
            blockchain: requiredWallet.blockchain,
            prerequisite,
          }),
        async () => buildEvmApproveTx(prerequisite),
        async (prerequisiteTx) =>
          evm.sign({
            blockchain: requiredWallet.blockchain,
            tx: prerequisiteTx,
          }),
      )
      return signedPrerequisiteHash === null
        ? []
        : proveEvmApproveOnChain(
            actions,
            evm,
            transactionId,
            prerequisite,
            signedPrerequisiteHash,
          )
    }
    case 'TRON_APPROVE': {
      const tron = wallet?.tron
      if (tron === undefined) {
        return notConnectedBlock
      }
      if (isResumingSignedPrerequisite) {
        return proveTronApproveOnChain(
          actions,
          tron,
          transactionId,
          prerequisite,
          resumedHashOrBlockchainMeta.hashToResumeProving,
        )
      }
      const blockReason = getAccountBlockReason(
        requiredWallet,
        await tron.getAccounts().catch(() => null),
      )
      if (isCanceled(actions)) {
        return []
      }
      if (blockReason !== null) {
        return { block: blockReason }
      }
      const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
        actions,
        transactionId,
        prerequisite,
        resumedHashOrBlockchainMeta.blockchainMeta,
        async () => tron.getAllowance({ prerequisite }),
        async () =>
          runPrerequisiteReadOrBuildOrThrowReported(
            async () => tron.buildTransaction({ prerequisite }),
            'Could not build the Tron approve transaction.',
          ),
        async (prerequisiteTx) => tron.sign({ tx: prerequisiteTx }),
      )
      return signedPrerequisiteHash === null
        ? []
        : proveTronApproveOnChain(
            actions,
            tron,
            transactionId,
            prerequisite,
            signedPrerequisiteHash,
          )
    }
    case 'XRPL_CHANGE_TRUSTLINE': {
      const xrpl = wallet?.xrpl
      if (xrpl === undefined) {
        return notConnectedBlock
      }
      if (isResumingSignedPrerequisite) {
        return proveXrplTrustlineOnChain(
          actions,
          xrpl,
          transactionId,
          resumedHashOrBlockchainMeta.hashToResumeProving,
        )
      }
      const blockReason = getAccountBlockReason(
        requiredWallet,
        await xrpl.getAccounts().catch(() => null),
      )
      if (isCanceled(actions)) {
        return []
      }
      if (blockReason !== null) {
        return { block: blockReason }
      }
      const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
        actions,
        transactionId,
        prerequisite,
        resumedHashOrBlockchainMeta.blockchainMeta,
        async () => xrpl.getTrustline({ prerequisite }),
        async () => buildXrplTrustSetTx(prerequisite),
        async (prerequisiteTx) => xrpl.sign({ tx: prerequisiteTx }),
      )
      return signedPrerequisiteHash === null
        ? []
        : proveXrplTrustlineOnChain(
            actions,
            xrpl,
            transactionId,
            signedPrerequisiteHash,
          )
    }
    case 'STELLAR_CHANGE_TRUSTLINE': {
      const stellar = wallet?.stellar
      if (stellar === undefined) {
        return notConnectedBlock
      }
      // Its resolved `sign` proved it, so it is completed with no port call.
      if (isResumingSignedPrerequisite) {
        return storeEntryCompletedAndEmitApprovalSucceeded(
          actions,
          transactionId,
          false,
        )
      }
      const blockReason = getAccountBlockReason(
        requiredWallet,
        await stellar.getAccounts().catch(() => null),
      )
      if (isCanceled(actions)) {
        return []
      }
      if (blockReason !== null) {
        return { block: blockReason }
      }
      const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
        actions,
        transactionId,
        prerequisite,
        resumedHashOrBlockchainMeta.blockchainMeta,
        async () => stellar.getTrustline({ prerequisite }),
        async () =>
          runPrerequisiteReadOrBuildOrThrowReported(
            async () =>
              stellar.buildTransaction({
                prerequisite,
                limit: TRUSTLINE_LIMIT_BY_BLOCKCHAIN.STELLAR,
              }),
            'Could not build the Stellar trustline transaction.',
          ),
        async (prerequisiteTx) => stellar.sign({ tx: prerequisiteTx }),
      )
      return signedPrerequisiteHash === null
        ? []
        : storeEntryCompletedAndEmitApprovalSucceeded(
            actions,
            transactionId,
            false,
          )
    }
  }
}

export async function executeTransaction(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
): Promise<TaskResult> {
  const { context } = actions
  const { transactionId } = actions.payload
  const storage = actions.getStorage()
  const { requestId } = storage.data

  const entry = storage.transactions[transactionId]

  if (entry.execution.status === 'completed') {
    return []
  }
  if (entry.data.type === 'prerequisite') {
    return gateSignAndProvePrerequisite(
      actions,
      transactionId,
      entry.data.value,
    )
  }
  const mainTx = entry.data.value
  // No gate on a resume.
  const { walletResult: storedWalletResult } = entry.execution.result
  const isPostedHyperliquidWithoutHash =
    entry.execution.status === 'signed' &&
    mainTx.type === TransactionType.HYPERLIQUID &&
    storedWalletResult === null
  if (isPostedHyperliquidWithoutHash) {
    const hyperliquidHash = await waitForHyperliquidHashAndStoreIt(
      actions,
      transactionId,
      getRequiredWallet(storage, mainTx),
      mainTx.nonce,
    )
    return hyperliquidHash === null
      ? []
      : waitForHashThenPollStepStatus(actions, hyperliquidHash)
  }
  const isSignedWithHash =
    entry.execution.status === 'signed' && storedWalletResult !== null
  if (isSignedWithHash) {
    return waitForHashThenPollStepStatus(actions, storedWalletResult.hash)
  }
  // Only Hyperliquid is stored `signed` without a hash, so any other is as unknown as a `sign_requested` one.
  if (entry.execution.status !== 'not_started') {
    throw new ErrorToReport(
      'TX_EXPIRED',
      'Transaction is expired. Please try again.',
    )
  }

  const requiredWallet = getRequiredWallet(storage, mainTx)
  const notConnectedBlock: { block: BlockReason } = {
    block: {
      reason: 'NOT_CONNECTED',
      metadata: {
        blockchain: requiredWallet.blockchain,
        address: requiredWallet.address,
      },
    },
  }

  /*
   * `buildMainTransactionSigner` reads the meta after the gate, a Cache read for an EVM entry; Hyperliquid reads it
   * only once its hash is found. Only an `evm` and a `bip122` request carries `blockchain`, and no `sign` a chain ID:
   * the chain was checked first.
   */
  let signMainTransaction: () => Promise<SignedEntryResult | null>
  let blockReason: BlockReason | null
  switch (mainTx.type) {
    case TransactionType.HYPERLIQUID: {
      const hyperliquid = context.wallet?.hyperliquid
      if (hyperliquid === undefined) {
        return notConnectedBlock
      }
      const connectedAccounts = await hyperliquid
        .getAccounts()
        .catch(() => null)
      if (isCanceled(actions)) {
        return []
      }
      blockReason =
        getAccountBlockReason(requiredWallet, connectedAccounts) ??
        (await switchToRequiredChainOrGetBlockReason(
          actions,
          transactionId,
          requiredWallet,
          mainTx.action.signatureChainId,
          async () => hyperliquid.getChainId(),
          async (chainId) => hyperliquid.switchChain({ chainId }),
        ))
      signMainTransaction = async () =>
        signPostAndLookUpHyperliquidHash(actions, hyperliquid, mainTx)
      break
    }
    case TransactionType.EVM: {
      const evm = context.wallet?.evm
      if (evm === undefined) {
        return notConnectedBlock
      }
      // Only an EVM entry needs its meta at the gate, for the chain ID it must be on.
      const blockchainMeta = await loadBlockchainMetaOf(
        actions,
        requiredWallet.blockchain,
      )
      if (isCanceled(actions)) {
        return []
      }
      const connectedAccounts = await evm
        .getAccounts({ blockchain: requiredWallet.blockchain })
        .catch(() => null)
      if (isCanceled(actions)) {
        return []
      }
      // The chain ID is looked up only once the accounts pass.
      blockReason =
        getAccountBlockReason(requiredWallet, connectedAccounts) ??
        (await switchToRequiredChainOrGetBlockReason(
          actions,
          transactionId,
          requiredWallet,
          blockchainMeta.chainId,
          async () => evm.getChainId({ blockchain: requiredWallet.blockchain }),
          async (chainId) =>
            evm.switchChain({
              blockchain: requiredWallet.blockchain,
              chainId,
              chain: buildEvmChainDescription(blockchainMeta),
            }),
        ))
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        evm.sign({ blockchain: requiredWallet.blockchain, tx: mainTx }),
      )
      break
    }
    case TransactionType.TRANSFER: {
      const bip122 = context.wallet?.bip122
      if (bip122 === undefined) {
        return notConnectedBlock
      }
      const connectedAccounts = await bip122
        .getAccounts({ blockchain: requiredWallet.blockchain })
        .catch(() => null)
      blockReason = getAccountBlockReason(requiredWallet, connectedAccounts)
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        bip122.sign({ blockchain: requiredWallet.blockchain, tx: mainTx }),
      )
      break
    }
    case TransactionType.TRON: {
      const tron = context.wallet?.tron
      if (tron === undefined) {
        return notConnectedBlock
      }
      blockReason = getAccountBlockReason(
        requiredWallet,
        await tron.getAccounts().catch(() => null),
      )
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        tron.sign({ tx: mainTx }),
      )
      break
    }
    case TransactionType.XRPL: {
      const xrpl = context.wallet?.xrpl
      if (xrpl === undefined) {
        return notConnectedBlock
      }
      blockReason = getAccountBlockReason(
        requiredWallet,
        await xrpl.getAccounts().catch(() => null),
      )
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        xrpl.sign({ tx: mainTx }),
      )
      break
    }
    case TransactionType.STELLAR: {
      const stellar = context.wallet?.stellar
      if (stellar === undefined) {
        return notConnectedBlock
      }
      blockReason = getAccountBlockReason(
        requiredWallet,
        await stellar.getAccounts().catch(() => null),
      )
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        stellar.sign({ tx: mainTx }),
      )
      break
    }
    case TransactionType.SOLANA: {
      const solana = context.wallet?.solana
      if (solana === undefined) {
        return notConnectedBlock
      }
      blockReason = getAccountBlockReason(
        requiredWallet,
        await solana.getAccounts().catch(() => null),
      )
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        solana.sign({ tx: mainTx }),
      )
      break
    }
    case TransactionType.STARKNET: {
      const starknet = context.wallet?.starknet
      if (starknet === undefined) {
        return notConnectedBlock
      }
      blockReason = getAccountBlockReason(
        requiredWallet,
        await starknet.getAccounts().catch(() => null),
      )
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        starknet.sign({ tx: mainTx }),
      )
      break
    }
    case TransactionType.TON: {
      const ton = context.wallet?.ton
      if (ton === undefined) {
        return notConnectedBlock
      }
      blockReason = getAccountBlockReason(
        requiredWallet,
        await ton.getAccounts().catch(() => null),
      )
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        ton.sign({ tx: mainTx }),
      )
      break
    }
    case TransactionType.SUI: {
      const sui = context.wallet?.sui
      if (sui === undefined) {
        return notConnectedBlock
      }
      blockReason = getAccountBlockReason(
        requiredWallet,
        await sui.getAccounts().catch(() => null),
      )
      signMainTransaction = buildMainTransactionSigner(actions, async () =>
        sui.sign({ tx: mainTx }),
      )
      break
    }
    case TransactionType.COSMOS:
      throw new Error(
        'Unexpected Error: Cosmos transactions are no longer supported.',
      )
  }
  if (isCanceled(actions)) {
    return []
  }
  if (blockReason !== null) {
    return { block: blockReason }
  }

  const signedMainTx = await signMainTransaction()
  if (signedMainTx === null) {
    return []
  }
  if (
    mainTx.type === TransactionType.EVM &&
    context.wallet?.evm?.wait !== undefined
  ) {
    context.signResponsesAwaitingWait.set(
      `${requestId}/${transactionId}`,
      signedMainTx.response,
    )
  }

  return waitForHashThenPollStepStatus(actions, signedMainTx.walletResult.hash)
}
