import type { EvmNamespaces, EvmProvider } from './evm.js'
import type { HyperliquidWallet } from '../../mod.js'
import type { mainAPI } from 'rango-types'

import { SignerError, SignerErrorCode, TransactionType } from 'rango-types'

import { tryRunAndRejectWithSignerError } from './errors.js'
import { findSigner, getFirstAccount, getNamespace } from './utils.js'

// hub3 has no Hyperliquid namespace: Hyperliquid is read and signed through the EVM wallet.
const NAMESPACE_KEY = 'evm'

export function hub3HyperliquidAdapter(
  provider: EvmProvider,
): HyperliquidWallet {
  return {
    async getAccount() {
      return getFirstAccount(provider.get(NAMESPACE_KEY))
    },
    async getChainId() {
      return getNamespace(provider, NAMESPACE_KEY).getChainId()
    },
    async switchChain({ chainId }) {
      await getNamespace(provider, NAMESPACE_KEY).connect(chainId)
    },
    async signTypedData({ typedData, chainId }) {
      return tryRunAndRejectWithSignerError(async () => {
        const namespace = getNamespace(provider, NAMESPACE_KEY)
        // The request carries no swap wallet; hub3's EVM signer signs with the active account anyway.
        const address = getFirstAccount(namespace)
        if (address === null) {
          throw new Error(
            `The hub3 provider "${provider.id}" has no connected "${NAMESPACE_KEY}" account to sign with.`,
          )
        }
        const signer = await findSigner<EvmNamespaces, mainAPI.EvmTransaction>(
          provider,
          TransactionType.EVM,
        )
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
