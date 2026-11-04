import type { SolanaWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { SolanaActions } from '@hub3js/solana'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './single-chain.js'

/**
 * The Solana **WalletPort** entry of a hub3 **Host**: `hub3SolanaAdapter(hub.get(providerId))`. It answers the first
 * account in the provider's `solana` hub3 namespace's state and signs with it, through the signer the provider's
 * wallet registered for SOLANA. `sign` rejects only with a `SignerError`. It never connects.
 */
export function hub3SolanaAdapter(
  provider: Provider<{ solana: SolanaActions }>,
): SolanaWallet {
  return buildSingleChainWallet(provider, {
    key: 'solana',
    type: TransactionType.SOLANA,
    findNamespace: () => provider.get('solana'),
  })
}
