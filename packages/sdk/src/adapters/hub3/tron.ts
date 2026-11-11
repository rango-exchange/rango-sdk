import type { TronWallet } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { TronActions } from '@hub3js/tron'
import type { mainAPI } from 'rango-types'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet, getNamespace } from './utils.js'

type TronProvider = Provider<{ tron: TronActions }>

const NAMESPACE_KEY = 'tron'

export function hub3TronAdapter(provider: TronProvider): TronWallet {
  return {
    ...buildSingleChainWallet(provider, {
      key: NAMESPACE_KEY,
      type: TransactionType.TRON,
    }),
    async getAllowance({ prerequisite }) {
      return getNamespace(provider, NAMESPACE_KEY).getAllowance({
        token: prerequisite.token,
        owner: prerequisite.wallet,
        spender: prerequisite.spender,
      })
    },
    // No fee limit is passed, so hub3 builds the approve with its default one.
    async buildTransaction({ prerequisite }) {
      const approveTransaction = await getNamespace(
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
        raw_data: parseRawData(provider, approveTransaction.raw_data),
        raw_data_hex: approveTransaction.raw_data_hex ?? null,
        txID: approveTransaction.txID,
        visible: approveTransaction.visible ?? false,
        __payload__: approveTransaction.__payload__ ?? {},
      }
    },
    // Passed on as hub3 answers it: the SDK decides whether the approve succeeded.
    async getTransactionInfo({ hash }) {
      return getNamespace(provider, NAMESPACE_KEY).getTransactionInfo(hash)
    },
  }
}

// hub3 types `raw_data` as `unknown`, so it's checked here, then passed on as the same object so no field is lost.
function parseRawData(
  provider: TronProvider,
  rawData: unknown,
): mainAPI.TrxRawData | null {
  if (rawData === null || isRawData(rawData)) {
    return rawData
  }
  throw new Error(
    `The hub3 provider "${provider.id}" built a Tron approve whose \`raw_data\` is not a Tron transaction's raw data.`,
  )
}

function isRawData(value: unknown): value is mainAPI.TrxRawData {
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

function isContract(value: unknown): value is mainAPI.TrxContractData {
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
