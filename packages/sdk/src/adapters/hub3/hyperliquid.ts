import type { EvmProvider } from './evm.js'
import type { HyperliquidWallet } from '../../mod.js'
import type { EvmActions } from '@hub3js/evm'
import type { mainAPI } from 'rango-types'

import { SignerError, SignerErrorCode, TransactionType } from 'rango-types'

import { getFirstAccount } from './accounts.js'
import { runAndRejectWithSignerError } from './errors.js'
import { tryGetNamespace } from './namespaces.js'
import { tryFindSigner } from './signers.js'

// hub3 has no Hyperliquid namespace: Hyperliquid is read and signed through the EVM wallet.
const NAMESPACE_KEY = 'evm'

/**
 * The Hyperliquid **WalletPort** entry of a hub3 **Host**: `hub3HyperliquidAdapter(hub.get(providerId))`, over the
 * same provider as its EVM entry. It answers the first account and reads the network from the provider's `evm` hub3
 * namespace, switches the network through it, and signs typed data with the signer the provider's wallet registered
 * for EVM. `signTypedData` rejects only with a `SignerError`. It holds `provider` for its whole life and never
 * connects.
 */
export function hub3HyperliquidAdapter(
  provider: EvmProvider,
): HyperliquidWallet {
  return {
    async getAccount() {
      return getFirstAccount(provider.get(NAMESPACE_KEY))
    },
    async getChainId() {
      return tryGetNamespace(provider, NAMESPACE_KEY).getChainId()
    },
    // Hyperliquid's request carries no chain description, so the wallet can switch but not add the chain.
    async switchChain({ chainId }) {
      await tryGetNamespace(provider, NAMESPACE_KEY).connect(chainId)
    },
    async signTypedData({ typedData, chainId }) {
      return runAndRejectWithSignerError(async () => {
        const namespace = tryGetNamespace(provider, NAMESPACE_KEY)
        /*
         * The request carries no swap wallet, so the first account goes instead: the one `getAccount` answered and the
         * gate matched to the swap wallet. hub3's EVM signer signs with the active account whatever the address.
         */
        const address = getFirstAccount(namespace)
        if (address === null) {
          throw new Error(
            `The hub3 provider "${provider.id}" has no connected "${NAMESPACE_KEY}" account to sign with.`,
          )
        }
        const signer = await tryFindSigner<
          { evm: EvmActions },
          mainAPI.EvmTransaction
        >(provider, TransactionType.EVM)
        if (signer.signTypedData === undefined) {
          throw new SignerError(
            SignerErrorCode.UNEXPECTED_BEHAVIOUR,
            'The wallet’s EVM signer cannot sign typed data.',
          )
        }
        return signer.signTypedData(typedData, address, chainId)
      })
    },
  }
}
