import type { SdkActions, SignedEntryResult, TaskResult } from './types.js'
import type { BlockReason } from '../mod.js'

import { TransactionType } from 'rango-types'

import {
  buildEvmChainDescription,
  loadBlockchainMetaOf,
} from './blockchain-meta.js'
import { ErrorToReport } from './execution-failure.js'
import { getRequiredWallet } from './required-wallet.js'
import { buildMainTransactionSigner } from './sign.js'
import { waitForHashThenPollStepStatus } from './transaction-status-polling.js'
import {
  getAccountBlockReason,
  switchToRequiredChainOrGetBlockReason,
} from './wallet-readiness.js'

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
    throw new Error('Unexpected Error: Prerequisites are not supported yet.')
  }
  const mainTx = entry.data.value
  // No gate on a resume.
  const { walletResult: storedWalletResult } = entry.execution.result
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
    case TransactionType.HYPERLIQUID:
      throw new Error(
        'Unexpected Error: Hyperliquid transactions are not supported yet.',
      )
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
      const connectedAccounts = await evm
        .getAccounts({ blockchain: requiredWallet.blockchain })
        .catch(() => null)
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
