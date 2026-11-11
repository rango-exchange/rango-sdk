import type { EvmWallet, SignResult } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { EvmActions } from '@hub3js/evm'
import type { mainAPI } from 'rango-types'

import { utils } from '@hub3js/evm'
import { SignerError, SignerErrorCode, TransactionType } from 'rango-types'

import { tryRunAndRejectWithSignerError } from './errors.js'
import { findSigner, getFirstAccount, getNamespace } from './utils.js'

export type EvmNamespaces = { evm: EvmActions }
export type EvmProvider = Provider<EvmNamespaces>

const NAMESPACE_KEY = 'evm'

/*
 * The EVM **WalletPort** entry of a hub3 **Host**, Hyperliquid included. Put it flat under `evm`, or under each
 * blockchain's key, such as `ETH` or `HYPERLIQUID`, in `evm`'s map.
 */
export function hub3EvmAdapter(provider: EvmProvider): EvmWallet {
  return {
    async getAccount() {
      return getFirstAccount(provider.get(NAMESPACE_KEY))
    },
    async getChainId() {
      return getNamespace(provider, NAMESPACE_KEY).getChainId()
    },
    async switchChain({ chainId, chain }) {
      await getNamespace(provider, NAMESPACE_KEY).connect(
        chain === undefined ? chainId : { chainId, ...chain },
      )
    },
    async sign({ tx }) {
      return tryRunAndRejectWithSignerError(async () => {
        const namespace = getNamespace(provider, NAMESPACE_KEY)
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
        const { hash, response } = await signer.signAndSendTx(
          tx,
          address,
          await namespace.getChainId(),
        )
        return buildSignResult(hash, response)
      })
    },
    async wait({ hash, response }) {
      return tryRunAndRejectWithSignerError(async () => {
        const signer = await findSigner<EvmNamespaces, mainAPI.EvmTransaction>(
          provider,
          TransactionType.EVM,
        )
        if (signer.wait === undefined) {
          return { hash }
        }
        const chainId = await getNamespace(provider, NAMESPACE_KEY).getChainId()
        return signer.wait(hash, chainId, response)
      })
    },
    async getAllowance({ prerequisite }) {
      return getNamespace(provider, NAMESPACE_KEY).getAllowance({
        token: prerequisite.token,
        owner: prerequisite.wallet,
        spender: prerequisite.spender,
      })
    },
    async buildTransaction({ prerequisite }) {
      return {
        type: TransactionType.EVM,
        blockChain: prerequisite.blockChain,
        from: prerequisite.wallet,
        to: prerequisite.token,
        data: utils.encodeApproveCallData(
          prerequisite.spender,
          prerequisite.amount,
        ),
        value: null,
        nonce: null,
        gasLimit: null,
        gasPrice: null,
        maxPriorityFeePerGas: null,
        maxFeePerGas: null,
        isApprovalTx: true,
        prerequisites: [],
      }
    },
    async getTransactionInfo({ hash }) {
      const prefixedHash: `0x${string}` = hash.startsWith('0x')
        ? `0x${hash.slice(2)}`
        : `0x${hash}`
      const receipt = await getNamespace(
        provider,
        NAMESPACE_KEY,
      ).getTransactionReceipt(prefixedHash)
      if (receipt === null) {
        return 'pending'
      }
      return Number(receipt.status) === 1 ? 'success' : 'failed'
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

// A signer may answer a provisional hash (`hashRequiringUpdate: true` in `response`); `wait` then answers the real one.
function buildSignResult(hash: string, response: unknown): SignResult {
  const isHashRequiringUpdate =
    typeof response === 'object' &&
    response !== null &&
    'hashRequiringUpdate' in response &&
    response.hashRequiringUpdate === true
  return isHashRequiringUpdate
    ? { hash, response, hashRequiringUpdate: true }
    : { hash, response }
}
