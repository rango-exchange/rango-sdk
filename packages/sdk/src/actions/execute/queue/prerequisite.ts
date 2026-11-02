import type { SdkActions, TaskResult } from './types.js'
import type { EvmWallet, SignResult, TronWallet, XrplWallet } from '../mod.js'
import type { BlockchainMeta } from 'rango-sdk'
import type {
  EvmApprovePrerequisite,
  StellarChangeTrustLinePrerequisite,
  TransactionPrerequisite,
  TronApprovePrerequisite,
  XrplChangeTrustLinePrerequisite,
} from 'rango-types'

import BigNumber from 'bignumber.js'

import {
  buildEvmChainDescription,
  loadBlockchainMetaOf,
} from './blockchainMeta.js'
import {
  ALLOWANCE_CONSECUTIVE_SUFFICIENT_READS,
  ALLOWANCE_READ_INTERVAL_MS,
  ALLOWANCE_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  PREREQUISITE_READ_FAILURE_MESSAGE_BY_TYPE,
  TRUSTLINE_LIMIT_BY_BLOCKCHAIN,
} from './constants.js'
import { ErrorToReport } from './executionFailure.js'
import { getRequiredWallet, getWalletOnBlockchain } from './requiredWallet.js'
import {
  awaitSignResultAndBuildExplorerLink,
  signEntryAndStoreSignedHash,
} from './sign.js'
import { sleep } from './utils.js'
import {
  getAccountBlockReason,
  switchToRequiredChainOrGetBlockReason,
} from './walletReadiness.js'

type OnChainTxStatus = 'pending' | 'success' | 'failed'

/*
 * A signed one resumes its on-chain proof with no account or chain gate. No `sign` gets a chain ID, as its chain was
 * checked first. It is never handed to `wait`.
 */
export async function gateSignAndProvePrerequisite(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: TransactionPrerequisite,
): Promise<TaskResult> {
  switch (prerequisite.type) {
    case 'EVM_APPROVE':
      return gateSignAndProveEvmApprove(actions, transactionId, prerequisite)
    case 'TRON_APPROVE':
      return gateSignAndProveTronApprove(actions, transactionId, prerequisite)
    case 'XRPL_CHANGE_TRUSTLINE':
      return gateSignAndProveXrplTrustline(actions, transactionId, prerequisite)
    case 'STELLAR_CHANGE_TRUSTLINE':
      return gateAndSignStellarTrustline(actions, transactionId, prerequisite)
  }
}

async function gateSignAndProveEvmApprove(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: EvmApprovePrerequisite,
): Promise<TaskResult> {
  const storage = actions.getStorage()
  const requiredWallet = getRequiredWallet(storage, prerequisite)
  const evm = getWalletOnBlockchain(
    actions.context.wallet?.evm,
    requiredWallet.blockchain,
  )
  if (evm === undefined) {
    return { block: { reason: 'NOT_CONNECTED', metadata: requiredWallet } }
  }
  const entry = storage.transactions[transactionId]
  const { walletResult: storedWalletResult } = entry.execution.result
  const isSignedWithHash =
    entry.execution.status === 'signed' && storedWalletResult !== null
  if (isSignedWithHash) {
    return proveEvmApproveOnChain(
      actions,
      evm,
      transactionId,
      prerequisite,
      storedWalletResult.hash,
    )
  }
  // An EVM approve needs its meta at the gate, for the chain ID it must be on.
  const blockchainMeta = await loadBlockchainMetaOf(
    actions,
    requiredWallet.blockchain,
  )
  const accountBlockReason = getAccountBlockReason(
    requiredWallet,
    await evm.getAccount().catch(() => null),
  )
  // The chain ID is looked up only once the account passes.
  const blockReason =
    accountBlockReason ??
    (await switchToRequiredChainOrGetBlockReason(
      actions,
      transactionId,
      requiredWallet,
      blockchainMeta.chainId,
      async () => evm.getChainId(),
      async (chainId) =>
        evm.switchChain({
          chainId,
          chain: buildEvmChainDescription(blockchainMeta),
        }),
    ))
  if (blockReason !== null) {
    return { block: blockReason }
  }
  const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
    actions,
    transactionId,
    prerequisite,
    blockchainMeta,
    async () => evm.getAllowance({ prerequisite }),
    async () =>
      tryRunPrerequisiteReadOrBuild(
        async () => evm.buildTransaction({ prerequisite }),
        'Could not build the EVM approve transaction.',
      ),
    async (prerequisiteTx) => evm.sign({ tx: prerequisiteTx }),
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

async function gateSignAndProveTronApprove(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: TronApprovePrerequisite,
): Promise<TaskResult> {
  const storage = actions.getStorage()
  const requiredWallet = getRequiredWallet(storage, prerequisite)
  const tron = actions.context.wallet?.tron
  if (tron === undefined) {
    return { block: { reason: 'NOT_CONNECTED', metadata: requiredWallet } }
  }
  const entry = storage.transactions[transactionId]
  const { walletResult: storedWalletResult } = entry.execution.result
  const isSignedWithHash =
    entry.execution.status === 'signed' && storedWalletResult !== null
  if (isSignedWithHash) {
    return proveTronApproveOnChain(
      actions,
      tron,
      transactionId,
      prerequisite,
      storedWalletResult.hash,
    )
  }
  const blockReason = getAccountBlockReason(
    requiredWallet,
    await tron.getAccount().catch(() => null),
  )
  if (blockReason !== null) {
    return { block: blockReason }
  }
  // Read only once the gate passes, so a gate Block wins over a list outage.
  const blockchainMeta = await loadBlockchainMetaOf(
    actions,
    requiredWallet.blockchain,
  )
  const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
    actions,
    transactionId,
    prerequisite,
    blockchainMeta,
    async () => tron.getAllowance({ prerequisite }),
    async () =>
      tryRunPrerequisiteReadOrBuild(
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

async function gateSignAndProveXrplTrustline(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: XrplChangeTrustLinePrerequisite,
): Promise<TaskResult> {
  const storage = actions.getStorage()
  const requiredWallet = getRequiredWallet(storage, prerequisite)
  const xrpl = actions.context.wallet?.xrpl
  if (xrpl === undefined) {
    return { block: { reason: 'NOT_CONNECTED', metadata: requiredWallet } }
  }
  const entry = storage.transactions[transactionId]
  const { walletResult: storedWalletResult } = entry.execution.result
  const isSignedWithHash =
    entry.execution.status === 'signed' && storedWalletResult !== null
  if (isSignedWithHash) {
    return proveXrplTrustlineOnChain(
      actions,
      xrpl,
      transactionId,
      storedWalletResult.hash,
    )
  }
  const blockReason = getAccountBlockReason(
    requiredWallet,
    await xrpl.getAccount().catch(() => null),
  )
  if (blockReason !== null) {
    return { block: blockReason }
  }
  // Read only once the gate passes, so a gate Block wins over a list outage.
  const blockchainMeta = await loadBlockchainMetaOf(
    actions,
    requiredWallet.blockchain,
  )
  const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
    actions,
    transactionId,
    prerequisite,
    blockchainMeta,
    async () => xrpl.getTrustline({ prerequisite }),
    async () =>
      tryRunPrerequisiteReadOrBuild(
        async () =>
          xrpl.buildTransaction({
            prerequisite,
            limit: TRUSTLINE_LIMIT_BY_BLOCKCHAIN.XRPL,
          }),
        'Could not build the XRPL trustline transaction.',
      ),
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

// Its resolved `sign` proved it, so a signed one is completed with no port call.
async function gateAndSignStellarTrustline(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: StellarChangeTrustLinePrerequisite,
): Promise<TaskResult> {
  const storage = actions.getStorage()
  const requiredWallet = getRequiredWallet(storage, prerequisite)
  const stellar = actions.context.wallet?.stellar
  if (stellar === undefined) {
    return { block: { reason: 'NOT_CONNECTED', metadata: requiredWallet } }
  }
  const entry = storage.transactions[transactionId]
  const { walletResult: storedWalletResult } = entry.execution.result
  const isSignedWithHash =
    entry.execution.status === 'signed' && storedWalletResult !== null
  if (isSignedWithHash) {
    return storeEntryCompletedAndEmitApprovalSucceeded(
      actions,
      transactionId,
      false,
    )
  }
  const blockReason = getAccountBlockReason(
    requiredWallet,
    await stellar.getAccount().catch(() => null),
  )
  if (blockReason !== null) {
    return { block: blockReason }
  }
  // Read only once the gate passes, so a gate Block wins over a list outage.
  const blockchainMeta = await loadBlockchainMetaOf(
    actions,
    requiredWallet.blockchain,
  )
  const signedPrerequisiteHash = await signPrerequisiteUnlessAlreadyGranted(
    actions,
    transactionId,
    prerequisite,
    blockchainMeta,
    async () => stellar.getTrustline({ prerequisite }),
    async () =>
      tryRunPrerequisiteReadOrBuild(
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
    : storeEntryCompletedAndEmitApprovalSucceeded(actions, transactionId, false)
}

// The signed hash, or `null` when the Prerequisite was already met.
async function signPrerequisiteUnlessAlreadyGranted<PrerequisiteTx>(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  prerequisite: TransactionPrerequisite,
  blockchainMeta: BlockchainMeta,
  readGrantedAmount: () => Promise<string | null>,
  buildPrerequisiteTx: () => Promise<PrerequisiteTx>,
  signPrerequisiteTx: (prerequisiteTx: PrerequisiteTx) => Promise<SignResult>,
): Promise<string | null> {
  const grantedAmount = await tryRunPrerequisiteReadOrBuild(
    readGrantedAmount,
    PREREQUISITE_READ_FAILURE_MESSAGE_BY_TYPE[prerequisite.type],
  )
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

function getRequiredGrantAmount(prerequisite: TransactionPrerequisite): string {
  switch (prerequisite.type) {
    case 'XRPL_CHANGE_TRUSTLINE':
      return TRUSTLINE_LIMIT_BY_BLOCKCHAIN.XRPL
    case 'STELLAR_CHANGE_TRUSTLINE':
      return TRUSTLINE_LIMIT_BY_BLOCKCHAIN.STELLAR
    case 'EVM_APPROVE':
    case 'TRON_APPROVE':
      return prerequisite.amount
  }
}

function isGrantedAmountEnough(
  granted: string | null,
  required: string,
): boolean {
  return granted !== null && new BigNumber(granted).gte(required)
}

function getTronTxStatus(info: {
  blockNumber?: number
  receipt?: { result?: string }
}): OnChainTxStatus {
  if (info.blockNumber === undefined) {
    return 'pending'
  }
  const result = info.receipt?.result
  return result === undefined || result === 'SUCCESS' ? 'success' : 'failed'
}

function getXrplTxStatus(info: {
  validated: boolean
  meta?: { TransactionResult: string }
}): OnChainTxStatus {
  if (!info.validated) {
    return 'pending'
  }
  return info.meta?.TransactionResult === 'tesSUCCESS' ? 'success' : 'failed'
}

// A failed read or build is reported.
async function tryRunPrerequisiteReadOrBuild<T>(
  readOrBuild: () => Promise<T>,
  failureMessage: string,
): Promise<T> {
  try {
    return await readOrBuild()
  } catch {
    throw new ErrorToReport('CLIENT_UNEXPECTED_BEHAVIOUR', failureMessage, null)
  }
}

// The timeout is wall-clock time from the first read, the time the reads take included.
async function tryWaitUntilAllowanceConfirmed(
  readGrantedAllowance: () => Promise<string | null>,
  requiredAmount: string,
): Promise<boolean> {
  const allowanceDeadlineMs = Date.now() + ALLOWANCE_TIMEOUT_MS
  let consecutiveSufficientReads = 0
  while (true) {
    let grantedAmount: string | null
    try {
      grantedAmount = await readGrantedAllowance()
    } catch {
      grantedAmount = null
    }
    consecutiveSufficientReads = isGrantedAmountEnough(
      grantedAmount,
      requiredAmount,
    )
      ? consecutiveSufficientReads + 1
      : 0
    if (consecutiveSufficientReads >= ALLOWANCE_CONSECUTIVE_SUFFICIENT_READS) {
      return true
    }
    if (Date.now() >= allowanceDeadlineMs) {
      throw new ErrorToReport(
        'INSUFFICIENT_APPROVE',
        'Insufficient approve, please try again.',
      )
    }
    await sleep(ALLOWANCE_READ_INTERVAL_MS)
  }
}

// A Prerequisite's on-chain proof.
async function tryWaitUntilProvedOnChain(
  readOnChainStatus: (hash: string) => Promise<OnChainTxStatus>,
  hash: string,
): Promise<boolean> {
  while (true) {
    const onChainStatus = await readOnChainStatus(hash).catch(
      (): 'pending' => 'pending',
    )
    if (onChainStatus === 'failed') {
      throw new ErrorToReport(
        'CLIENT_UNEXPECTED_BEHAVIOUR',
        'Prerequisite transaction failed on chain.',
      )
    }
    if (onChainStatus === 'success') {
      return true
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

/*
 * An approve emits `approval_tx_succeeded`. A Stellar trustline needs no proof: its `sign`
 * resolves only once the network accepted it.
 */
function storeEntryCompletedAndEmitApprovalSucceeded(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  shouldEmitApprovalSucceeded: boolean,
): TaskResult {
  const storage = actions.getStorage()
  const entry = storage.transactions[transactionId]
  entry.execution.status = 'completed'
  actions.setStorage(storage)
  if (shouldEmitApprovalSucceeded) {
    actions.context.emit.stepEvent(
      storage.data.requestId,
      entry.step,
      transactionId,
      { type: 'approval_tx_succeeded' },
    )
  }
  return []
}

async function proveEvmApproveOnChain(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  evm: EvmWallet,
  transactionId: string,
  prerequisite: EvmApprovePrerequisite,
  hash: string,
): Promise<TaskResult> {
  const readOnChainStatus = async (
    signedHash: string,
  ): Promise<OnChainTxStatus> => evm.getTransactionInfo({ hash: signedHash })
  if (!(await tryWaitUntilProvedOnChain(readOnChainStatus, hash))) {
    return []
  }
  const readGrantedAllowance = async () => evm.getAllowance({ prerequisite })
  if (
    !(await tryWaitUntilAllowanceConfirmed(
      readGrantedAllowance,
      prerequisite.amount,
    ))
  ) {
    return []
  }
  return storeEntryCompletedAndEmitApprovalSucceeded(
    actions,
    transactionId,
    true,
  )
}

async function proveTronApproveOnChain(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  tron: TronWallet,
  transactionId: string,
  prerequisite: TronApprovePrerequisite,
  hash: string,
): Promise<TaskResult> {
  const readOnChainStatus = async (
    signedHash: string,
  ): Promise<OnChainTxStatus> =>
    getTronTxStatus(await tron.getTransactionInfo({ hash: signedHash }))
  if (!(await tryWaitUntilProvedOnChain(readOnChainStatus, hash))) {
    return []
  }
  const readGrantedAllowance = async () => tron.getAllowance({ prerequisite })
  if (
    !(await tryWaitUntilAllowanceConfirmed(
      readGrantedAllowance,
      prerequisite.amount,
    ))
  ) {
    return []
  }
  return storeEntryCompletedAndEmitApprovalSucceeded(
    actions,
    transactionId,
    true,
  )
}

async function proveXrplTrustlineOnChain(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  xrpl: XrplWallet,
  transactionId: string,
  hash: string,
): Promise<TaskResult> {
  const readOnChainStatus = async (
    signedHash: string,
  ): Promise<OnChainTxStatus> =>
    getXrplTxStatus(await xrpl.getTransactionInfo({ hash: signedHash }))
  if (!(await tryWaitUntilProvedOnChain(readOnChainStatus, hash))) {
    return []
  }
  return storeEntryCompletedAndEmitApprovalSucceeded(
    actions,
    transactionId,
    false,
  )
}
