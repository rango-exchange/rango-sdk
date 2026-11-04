import type { TronWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { TronActions } from '@hub3js/tron'

import { TransactionType } from 'rango-types'

import { getFirstAccount } from './accounts.js'
import { tryGetNamespace } from './namespaces.js'
import { signWithFirstAccount } from './single-chain.js'

type TronProvider = Provider<{ tron: TronActions }>
type TronTx = Awaited<ReturnType<TronWallet['buildTransaction']>>
type TronRawData = NonNullable<TronTx['raw_data']>
type TronContract = TronRawData['contract'][number]

const NAMESPACE_KEY = 'tron'

/**
 * The Tron **WalletPort** entry of a hub3 **Host**: `hub3TronAdapter(hub.get(providerId))`. It answers the first
 * account in the provider's `tron` hub3 namespace's state and signs with it, through the signer the provider's wallet
 * registered for TRON. It reads allowances and transaction info, and builds the TRC-20 approve, through that hub3
 * namespace. `sign` rejects only with a `SignerError`. It never connects.
 */
export function hub3TronAdapter(provider: TronProvider): TronWallet {
  const findNamespace = () => provider.get(NAMESPACE_KEY)
  return {
    async getAccount() {
      return getFirstAccount(findNamespace())
    },
    async sign({ tx }) {
      return signWithFirstAccount(
        provider,
        { key: NAMESPACE_KEY, type: TransactionType.TRON, findNamespace },
        tx,
      )
    },
    async getAllowance({ prerequisite }) {
      return tryGetNamespace(provider, NAMESPACE_KEY).getAllowance({
        token: prerequisite.token,
        owner: prerequisite.wallet,
        spender: prerequisite.spender,
      })
    },
    // No fee limit is passed, so hub3 builds the approve with its default one.
    async buildTransaction({ prerequisite }) {
      const approveTransaction = await tryGetNamespace(
        provider,
        NAMESPACE_KEY,
      ).buildApproveTransaction({
        token: prerequisite.token,
        owner: prerequisite.wallet,
        spender: prerequisite.spender,
        amount: prerequisite.amount,
      })
      return {
        type: TransactionType.TRON,
        blockChain: prerequisite.blockChain,
        isApprovalTx: true,
        prerequisites: [],
        raw_data: tryParseRawData(provider, approveTransaction.raw_data),
        raw_data_hex: approveTransaction.raw_data_hex ?? null,
        txID: approveTransaction.txID,
        visible: approveTransaction.visible ?? false,
        __payload__: approveTransaction.__payload__ ?? {},
      }
    },
    // Passed on as hub3 answers it: the SDK decides whether the approve succeeded.
    async getTransactionInfo({ hash }) {
      return tryGetNamespace(provider, NAMESPACE_KEY).getTransactionInfo(hash)
    },
  }
}

/*
 * hub3 types a built transaction's `raw_data` as `unknown`, so it is checked here, then passed on as the same object
 * rather than rebuilt, so every field the signer needs is kept.
 */
function tryParseRawData(
  provider: TronProvider,
  rawData: unknown,
): TronRawData | null {
  if (rawData === null || isRawData(rawData)) {
    return rawData
  }
  throw new Error(
    `The hub3 provider "${provider.id}" built a Tron approve whose \`raw_data\` is not a Tron transaction's raw data.`,
  )
}

function isRawData(value: unknown): value is TronRawData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'contract' in value &&
    Array.isArray(value.contract) &&
    value.contract.every(isContract) &&
    'ref_block_bytes' in value &&
    typeof value.ref_block_bytes === 'string' &&
    'ref_block_hash' in value &&
    typeof value.ref_block_hash === 'string' &&
    'expiration' in value &&
    typeof value.expiration === 'number' &&
    'timestamp' in value &&
    typeof value.timestamp === 'number'
  )
}

function isContract(value: unknown): value is TronContract {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    'parameter' in value &&
    typeof value.parameter === 'object' &&
    value.parameter !== null &&
    'value' in value.parameter &&
    'type_url' in value.parameter &&
    typeof value.parameter.type_url === 'string'
  )
}
