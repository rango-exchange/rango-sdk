import type { EvmWallet, SignResult } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { EvmActions } from '@hub3js/evm'
import type { mainAPI } from 'rango-types'

import { utils } from '@hub3js/evm'
import { TransactionType } from 'rango-types'

import { tryRunAndRejectWithSignerError } from './errors.js'
import {
  findSigner,
  getFirstAccount,
  getNamespace,
  getProvider,
} from './utils.js'

export type EvmNamespaces = { evm: EvmActions }
export type EvmProvider = Provider<EvmNamespaces>
// Keyed by Rango blockchain name, such as `ETH` or `BSC`; leave out the blockchains the Host doesn't use.
export type EvmProviders = Partial<Record<string, EvmProvider>>

const NAMESPACE_KEY = 'evm'

// The EVM **WalletPort** entry of a hub3 **Host**: one provider per blockchain.
export function hub3EvmAdapter(providers: EvmProviders): EvmWallet {
  return {
    async getAccount({ blockchain }) {
      return getFirstAccount(
        getProvider(providers, blockchain).get(NAMESPACE_KEY),
      )
    },
    async getChainId({ blockchain }) {
      const provider = getProvider(providers, blockchain)
      return getNamespace(provider, NAMESPACE_KEY).getChainId()
    },
    async switchChain({ blockchain, chainId, chain }) {
      const provider = getProvider(providers, blockchain)
      await getNamespace(provider, NAMESPACE_KEY).connect(
        chain === undefined ? chainId : { chainId, ...chain },
      )
    },
    async sign({ blockchain, tx }) {
      return tryRunAndRejectWithSignerError(async () => {
        const provider = getProvider(providers, blockchain)
        const namespace = getNamespace(provider, NAMESPACE_KEY)
        const address = getFirstAccount(namespace)
        if (address === null) {
          throw new Error(
            `The hub3 provider "${provider.id}" has no connected "evm" account to sign with.`,
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
    async wait({ blockchain, hash, response }) {
      return tryRunAndRejectWithSignerError(async () => {
        const provider = getProvider(providers, blockchain)
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
    async getAllowance({ blockchain, prerequisite }) {
      const provider = getProvider(providers, blockchain)
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
    async getTransactionInfo({ blockchain, hash }) {
      const provider = getProvider(providers, blockchain)
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
