import type { FindProxiedNamespace, Namespace, Provider } from '@hub3js/core'
import type { GenericSigner, mainAPI, TransactionType } from 'rango-types'

import { AccountId } from 'caip'

export function getNamespace<TNS, K extends keyof TNS & string>(
  provider: Provider<TNS>,
  key: K,
): FindProxiedNamespace<K, TNS> {
  const namespace = provider.get(key)
  if (namespace === undefined) {
    throw new Error(
      `The hub3 provider "${provider.id}" has no "${key}" namespace.`,
    )
  }
  return namespace
}

export type StatefulNamespace = Pick<Namespace<object>, 'state'>

export function getParsedAccounts(
  namespace: StatefulNamespace | undefined,
): AccountId[] {
  if (namespace === undefined) {
    return []
  }
  const [getState] = namespace.state()
  const { connected, accounts } = getState()
  if (!connected) {
    return []
  }
  return (accounts ?? []).flatMap((accountId) => {
    const account = parseAccountId(accountId)
    return account === null ? [] : [account]
  })
}

export function getFirstAccount(
  namespace: StatefulNamespace | undefined,
): string | null {
  return getParsedAccounts(namespace)[0]?.address ?? null
}

function parseAccountId(accountId: string): AccountId | null {
  try {
    return new AccountId(accountId)
  } catch {
    return null
  }
}

// Looked up afresh on every call: the wallet may register a new signer, such as when the user switches accounts.
export async function findSigner<TNS, Tx extends mainAPI.Transaction>(
  provider: Provider<TNS>,
  type: TransactionType,
): Promise<GenericSigner<Tx>> {
  const signersProperty = provider
    .info()
    ?.metadata.properties?.find(
      (item): item is Extract<typeof item, { name: 'signers' }> =>
        item.name === 'signers',
    )
  if (signersProperty === undefined) {
    throw new Error(
      `The hub3 provider "${provider.id}" has no "signers" metadata property.`,
    )
  }
  const signers = await signersProperty.value.getSigners()
  return signers.getSigner<Tx>(type)
}
