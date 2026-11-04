import type { StatefulNamespace } from './accounts.js'
import type { SignResult } from '../../mod.js'
import type { Provider } from '@hub3js/core'
import type { mainAPI, TransactionType } from 'rango-types'

import { getFirstAccount } from './accounts.js'
import { runAndRejectWithSignerError } from './errors.js'
import { tryFindSigner } from './signers.js'

type SingleChainWallet<Tx> = {
  getAccount(): Promise<string | null>
  sign(req: { tx: Tx }): Promise<SignResult>
}

export function buildSingleChainWallet<TNS, Tx extends mainAPI.Transaction>(
  provider: Provider<TNS>,
  options: {
    key: string
    type: TransactionType
    findNamespace: () => StatefulNamespace | undefined
  },
): SingleChainWallet<Tx> {
  return {
    async getAccount() {
      return getFirstAccount(options.findNamespace())
    },
    async sign({ tx }) {
      return signWithFirstAccount(provider, options, tx)
    },
  }
}

// The non-EVM way: the signer gets no chain ID.
export async function signWithFirstAccount<TNS, Tx extends mainAPI.Transaction>(
  provider: Provider<TNS>,
  options: {
    key: string
    type: TransactionType
    findNamespace: () => StatefulNamespace | undefined
    isWanted?: (accountId: string) => boolean
  },
  tx: Tx,
): Promise<SignResult> {
  const { key, type, findNamespace, isWanted } = options
  return runAndRejectWithSignerError(async () => {
    const namespace = findNamespace()
    if (namespace === undefined) {
      throw new Error(
        `The hub3 provider "${provider.id}" has no "${key}" namespace.`,
      )
    }
    const address = getFirstAccount(namespace, isWanted)
    if (address === null) {
      throw new Error(
        `The hub3 provider "${provider.id}" has no connected "${key}" account to sign with.`,
      )
    }
    const signer = await tryFindSigner<TNS, Tx>(provider, type)
    const { hash, response } = await signer.signAndSendTx(tx, address, null)
    return { hash, response }
  })
}
