import type { SuiWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { SuiActions } from '@hub3js/sui'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './single-chain.js'

/**
 * The Sui **WalletPort** entry of a hub3 **Host**: `hub3SuiAdapter(hub.get(providerId))`. It answers the first account
 * in the provider's `sui` hub3 namespace's state and signs with it, through the signer the provider's wallet
 * registered for SUI. `sign` rejects only with a `SignerError`. It never connects.
 */
export function hub3SuiAdapter(
  provider: Provider<{ sui: SuiActions }>,
): SuiWallet {
  return buildSingleChainWallet(provider, {
    key: 'sui',
    type: TransactionType.SUI,
    findNamespace: () => provider.get('sui'),
  })
}
