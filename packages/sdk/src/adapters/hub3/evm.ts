import type { EvmWallet, SignResult } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { EvmActions } from '@hub3js/evm'

import { utils } from '@hub3js/evm'
import { TransactionType } from 'rango-types'

import { getFirstAccount } from './accounts.js'
import { runAndRejectWithSignerError } from './errors.js'
import { tryGetNamespace } from './namespaces.js'
import { tryFindSigner } from './signers.js'

export type EvmProvider = Provider<{ evm: EvmActions }>
type EvmTx = Parameters<EvmWallet['sign']>[0]['tx']

const NAMESPACE_KEY = 'evm'

/**
 * The EVM **WalletPort** entry of a hub3 **Host**: `hub3EvmAdapter(hub.get(providerId))`. It answers the first
 * account and reads the network from the provider's `evm` hub3 namespace, switches (or adds) the network through it,
 * builds the ERC-20 approve with `@hub3js/evm`'s calldata, and signs and waits with the signer the provider's wallet
 * registered. `sign` and `wait` reject only with a `SignerError`. It holds `provider` for its whole life and never
 * connects: the **Host** connects, and gives a new adapter to change wallets.
 */
export function hub3EvmAdapter(provider: EvmProvider): EvmWallet {
  return {
    async getAccount() {
      return getFirstAccount(provider.get(NAMESPACE_KEY))
    },
    async getChainId() {
      return tryGetNamespace(provider, NAMESPACE_KEY).getChainId()
    },
    async switchChain({ chainId, chain }) {
      await tryGetNamespace(provider, NAMESPACE_KEY).connect(
        chain === undefined ? chainId : { chainId, ...chain },
      )
    },
    async sign({ tx }) {
      return runAndRejectWithSignerError(async () => {
        const namespace = tryGetNamespace(provider, NAMESPACE_KEY)
        if (tx.from === null) {
          throw new Error(
            'The EVM transaction has no `from` address to sign with.',
          )
        }
        const signer = await tryFindEvmSigner(provider)
        const { hash, response } = await signer.signAndSendTx(
          tx,
          tx.from,
          await namespace.getChainId(),
        )
        return buildSignResult(hash, response)
      })
    },
    // A signer with no `wait` has nothing to follow, so the hash it was given is the final one.
    async wait({ hash, response }) {
      return runAndRejectWithSignerError(async () => {
        const signer = await tryFindEvmSigner(provider)
        if (signer.wait === undefined) {
          return { hash }
        }
        const chainId = await tryGetNamespace(
          provider,
          NAMESPACE_KEY,
        ).getChainId()
        return signer.wait(hash, chainId, response)
      })
    },
    async getAllowance({ prerequisite }) {
      return tryGetNamespace(provider, NAMESPACE_KEY).getAllowance({
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
      const receipt = await tryGetNamespace(
        provider,
        NAMESPACE_KEY,
      ).getTransactionReceipt(
        // hub3 types the hash as a 0x template; the node, not the adapter, decides on any other hash.
        hash as `0x${string}`,
      )
      if (receipt === null) {
        return 'pending'
      }
      return Number(receipt.status) === 1 ? 'success' : 'failed'
    },
  }
}

async function tryFindEvmSigner(provider: EvmProvider) {
  return tryFindSigner<{ evm: EvmActions }, EvmTx>(
    provider,
    TransactionType.EVM,
  )
}

/*
 * The Safe signer answers a provisional hash, with `hashRequiringUpdate: true` in its untyped `response`; `wait` then
 * answers the real one.
 */
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
