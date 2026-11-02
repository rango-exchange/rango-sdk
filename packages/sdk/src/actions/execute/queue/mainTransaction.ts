import type {
  EvmTransaction,
  GatedMainTransaction,
  HyperliquidTransaction,
  SdkActions,
  TaskResult,
  TransferTransaction,
} from './types.js'
import type { SignAndSendResult } from '../mod.js'
import type { Transaction } from 'rango-sdk'

import { TransactionType } from 'rango-types'

import {
  buildEvmChainDescription,
  loadBlockchainMetaOf,
} from './blockchainMeta.js'
import { signPostAndLookUpHyperliquidHash } from './hyperliquid.js'
import { getRequiredWallet, readWallet } from './requiredWallet.js'
import { buildMainTransactionSigner } from './sign.js'
import { waitForHashThenPollStepStatus } from './transactionStatusPolling.js'
import {
  getAccountBlockReason,
  switchToRequiredChainOrGetBlockReason,
} from './walletReadiness.js'

/*
 * `buildMainTransactionSigner` reads the meta after the gate, a Cache read for an EVM entry; Hyperliquid reads it only
 * once its hash is found. No `signAndSend` gets a chain ID, as the chain was checked first.
 */
export async function gateSignAndProveMainTransaction(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  mainTx: Transaction,
): Promise<TaskResult> {
  const { context } = actions
  let gated: GatedMainTransaction
  switch (mainTx.type) {
    case TransactionType.HYPERLIQUID:
      gated = await gateAndBuildHyperliquidMainTransactionSigner(
        actions,
        mainTx,
      )
      break
    case TransactionType.EVM:
      gated = await gateAndBuildEvmMainTransactionSigner(actions, mainTx)
      break
    case TransactionType.TRANSFER:
      gated = await gateAndBuildBip122MainTransactionSigner(actions, mainTx)
      break
    case TransactionType.TRON:
      gated = await gateAccountAndBuildMainTransactionSigner(
        actions,
        readWallet(actions, 'tron'),
        mainTx,
      )
      break
    case TransactionType.XRPL:
      gated = await gateAccountAndBuildMainTransactionSigner(
        actions,
        readWallet(actions, 'xrpl'),
        mainTx,
      )
      break
    case TransactionType.STELLAR:
      gated = await gateAccountAndBuildMainTransactionSigner(
        actions,
        readWallet(actions, 'stellar'),
        mainTx,
      )
      break
    case TransactionType.SOLANA:
      gated = await gateAccountAndBuildMainTransactionSigner(
        actions,
        readWallet(actions, 'solana'),
        mainTx,
      )
      break
    case TransactionType.STARKNET:
      gated = await gateAccountAndBuildMainTransactionSigner(
        actions,
        readWallet(actions, 'starknet'),
        mainTx,
      )
      break
    case TransactionType.TON:
      gated = await gateAccountAndBuildMainTransactionSigner(
        actions,
        readWallet(actions, 'ton'),
        mainTx,
      )
      break
    case TransactionType.SUI:
      gated = await gateAccountAndBuildMainTransactionSigner(
        actions,
        readWallet(actions, 'sui'),
        mainTx,
      )
      break
    case TransactionType.COSMOS:
      throw new Error(
        'Unexpected Error: Cosmos transactions are no longer supported.',
      )
  }
  if (gated.blockReason !== null) {
    return { block: gated.blockReason }
  }

  const signedMainTx = await gated.signMainTransaction()
  if (signedMainTx === null) {
    return []
  }
  const isWaitedByItsWallet =
    mainTx.type === TransactionType.EVM &&
    readWallet(actions, 'evm').wait !== undefined
  if (isWaitedByItsWallet) {
    const { transactionId } = actions.getCurrentTask().payload
    const { requestId } = actions.getStorage().data
    context.signResponsesAwaitingWait.set(
      `${requestId}/${transactionId}`,
      signedMainTx.response,
    )
  }

  return waitForHashThenPollStepStatus(actions, signedMainTx.walletResult.hash)
}

async function gateAndBuildHyperliquidMainTransactionSigner(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  mainTx: HyperliquidTransaction,
): Promise<GatedMainTransaction> {
  const { transactionId } = actions.getCurrentTask().payload
  const storage = actions.getStorage()
  const requiredWallet = getRequiredWallet(storage, mainTx)
  const hyperliquid = readWallet(actions, 'evm')
  const blockReason =
    getAccountBlockReason(
      requiredWallet,
      await hyperliquid.getAccount().catch(() => null),
    ) ??
    (await switchToRequiredChainOrGetBlockReason(
      actions,
      transactionId,
      requiredWallet,
      mainTx.action.signatureChainId,
      async () => hyperliquid.getChainId(),
      async (chainId) => hyperliquid.switchChain({ chainId }),
    ))
  return blockReason === null
    ? {
        blockReason,
        signMainTransaction: async () =>
          signPostAndLookUpHyperliquidHash(actions, hyperliquid, mainTx),
      }
    : { blockReason }
}

async function gateAndBuildEvmMainTransactionSigner(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  mainTx: EvmTransaction,
): Promise<GatedMainTransaction> {
  const { transactionId } = actions.getCurrentTask().payload
  const storage = actions.getStorage()
  const requiredWallet = getRequiredWallet(storage, mainTx)
  const evm = readWallet(actions, 'evm')
  // Only an EVM entry needs its meta at the gate, for the chain ID it must be on.
  const blockchainMeta = await loadBlockchainMetaOf(
    actions,
    requiredWallet.blockchain,
  )
  // The chain ID is looked up only once the account passes.
  const blockReason =
    getAccountBlockReason(
      requiredWallet,
      await evm.getAccount().catch(() => null),
    ) ??
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
  return blockReason === null
    ? {
        blockReason,
        signMainTransaction: buildMainTransactionSigner(actions, async () =>
          evm.signAndSend({ tx: mainTx }),
        ),
      }
    : { blockReason }
}

async function gateAndBuildBip122MainTransactionSigner(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  mainTx: TransferTransaction,
): Promise<GatedMainTransaction> {
  const storage = actions.getStorage()
  const requiredWallet = getRequiredWallet(storage, mainTx)
  const bip122 = readWallet(actions, 'bip122')
  const blockReason = getAccountBlockReason(
    requiredWallet,
    await bip122.getAccount().catch(() => null),
  )
  return blockReason === null
    ? {
        blockReason,
        signMainTransaction: buildMainTransactionSigner(actions, async () =>
          bip122.signAndSend({ tx: mainTx }),
        ),
      }
    : { blockReason }
}

// For a namespace whose gate is the account alone.
async function gateAccountAndBuildMainTransactionSigner<
  EntryTx extends Transaction,
>(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  namespace: {
    getAccount(): Promise<string | null>
    signAndSend(request: { tx: EntryTx }): Promise<SignAndSendResult>
  },
  mainTx: EntryTx,
): Promise<GatedMainTransaction> {
  const requiredWallet = getRequiredWallet(actions.getStorage(), mainTx)
  const blockReason = getAccountBlockReason(
    requiredWallet,
    await namespace.getAccount().catch(() => null),
  )
  return blockReason === null
    ? {
        blockReason,
        signMainTransaction: buildMainTransactionSigner(actions, async () =>
          namespace.signAndSend({ tx: mainTx }),
        ),
      }
    : { blockReason }
}
