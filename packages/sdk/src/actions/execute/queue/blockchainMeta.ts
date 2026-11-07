import type { SdkActions } from './types.js'
import type { EvmChainDescription } from '../mod.js'
import type { BlockchainMeta } from 'rango-sdk'

import { TransactionType } from 'rango-types'

import { getErrorMessage } from './executionFailure.js'

/*
 * At the gate, before signing, and once a Hyperliquid hash is found. A failed load isn't retried, and both throws are
 * plain `Error`s, so they aren't reported.
 */
export async function loadBlockchainMetaOf(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  blockchainName: string,
): Promise<BlockchainMeta> {
  const blockchainsMeta = await actions.context
    .loadBlockchainsMeta()
    .catch((error: unknown) => {
      throw new Error(getErrorMessage(error))
    })
  const blockchainMeta = blockchainsMeta.find(
    ({ name }) => name === blockchainName,
  )
  if (blockchainMeta === undefined) {
    throw new Error(
      `Unexpected Error: ${blockchainName} is not in the Blockchain list.`,
    )
  }
  return blockchainMeta
}

export function buildEvmChainDescription(
  blockchainMeta: BlockchainMeta,
): EvmChainDescription {
  if (blockchainMeta.type !== TransactionType.EVM) {
    throw new Error(
      `Unexpected Error: ${blockchainMeta.name} is not an EVM blockchain.`,
    )
  }
  const { chainName, nativeCurrency, rpcUrls, blockExplorerUrls } =
    blockchainMeta.info
  return { chainName, nativeCurrency, rpcUrls, blockExplorerUrls }
}
