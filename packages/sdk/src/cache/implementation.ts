// A `Map` whose `get` and `set` take the value type of each key in `T`.
interface DataMap<T> extends Map<keyof T, T[keyof T]> {
  get<K extends keyof T>(key: K): T[K] | undefined
  set<K extends keyof T>(key: K, value: T[K]): this
}

export class Cache<T> {
  #data: DataMap<T> = new Map()

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.#data.get(key)
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.#data.set(key, value)
  }
}
