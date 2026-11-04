import type { FindProxiedNamespace, Provider } from '@hub3js/core'

export function tryGetNamespace<TNS, K extends keyof TNS & string>(
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
