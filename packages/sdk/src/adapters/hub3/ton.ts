import type { TonWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { TonActions } from '@hub3js/tvm'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './single-chain.js'

/**
 * The TON **WalletPort** entry of a hub3 **Host**: `hub3TonAdapter(hub.get(providerId))`. It answers the first account
 * in the provider's `ton` hub3 namespace's state and signs with it, through the signer the provider's wallet
 * registered for TON. `sign` rejects only with a `SignerError`. It never connects.
 */
export function hub3TonAdapter(
  provider: Provider<{ ton: TonActions }>,
): TonWallet {
  return buildSingleChainWallet(provider, {
    key: 'ton',
    type: TransactionType.TON,
    findNamespace: () => provider.get('ton'),
  })
}
