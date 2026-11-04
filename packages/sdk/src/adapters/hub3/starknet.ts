import type { StarknetWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { StarknetActions } from '@hub3js/starknet'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './single-chain.js'

/**
 * The Starknet **WalletPort** entry of a hub3 **Host**: `hub3StarknetAdapter(hub.get(providerId))`. It answers the
 * first account in the provider's `starknet` hub3 namespace's state and signs with it, through the signer the
 * provider's wallet registered for STARKNET. `sign` rejects only with a `SignerError`. It never connects.
 */
export function hub3StarknetAdapter(
  provider: Provider<{ starknet: StarknetActions }>,
): StarknetWallet {
  return buildSingleChainWallet(provider, {
    key: 'starknet',
    type: TransactionType.STARKNET,
    findNamespace: () => provider.get('starknet'),
  })
}
