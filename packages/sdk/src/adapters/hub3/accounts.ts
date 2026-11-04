import type { Namespace } from '@hub3js/core'

import { getCaip10Address } from './caip-10.js'

// What the adapters read of a hub3 namespace: its state, whatever its actions.
export type StatefulNamespace = Pick<Namespace<object>, 'state'>

// hub3's **Active account**, read without connecting: the first account in the namespace's state that `isWanted` keeps.
export function getFirstAccount(
  namespace: StatefulNamespace | undefined,
  isWanted: (accountId: string) => boolean = () => true,
): string | null {
  if (namespace === undefined) {
    return null
  }
  const [getState] = namespace.state()
  const { connected, accounts } = getState()
  const first = accounts?.find(isWanted)
  if (!connected || first === undefined) {
    return null
  }
  return getCaip10Address(first)
}
