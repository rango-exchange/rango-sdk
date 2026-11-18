/*
 * A copy of `map` with `key` set as its newest entry, dropping the oldest past `cap`. Maps keep insertion order, so
 * keys() yields the oldest first, and deleting before set moves a repeated key to newest.
 */
export function withNewest<K, V>(
  map: ReadonlyMap<K, V> | undefined,
  key: K,
  value: V,
  cap: number,
): Map<K, V> {
  const next = new Map(map)
  next.delete(key)
  next.set(key, value)
  // Each write adds at most one key, so at most the oldest one needs evicting.
  if (next.size > cap) {
    const [oldest] = next.keys()
    next.delete(oldest)
  }
  return next
}
