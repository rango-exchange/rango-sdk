import type * as Sdk from './mod.js'

import { beforeEach, describe, expect, test, vi } from 'vitest'

async function loadSdk(): Promise<typeof Sdk> {
  return import('./mod.js')
}

describe('default client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('createClient and getClient return the same instance', async () => {
    const { createClient, getClient } = await loadSdk()

    const client = createClient({ apiKey: 'test-key' })

    expect(getClient()).toBe(client)
  })

  test('getClient throws before createClient has been called', async () => {
    const { getClient } = await loadSdk()

    expect(() => getClient()).toThrow(/createClient\(\{ apiKey \}\)/)
  })

  test('a second call to createClient throws', async () => {
    const { createClient } = await loadSdk()

    createClient({ apiKey: 'test-key' })

    expect(() => createClient({ apiKey: 'other-key' })).toThrow(
      /already been created/,
    )
  })

  test('a standalone RangoClient is not registered as the default', async () => {
    const { RangoClient, getClient } = await loadSdk()

    new RangoClient({ apiKey: 'test-key' })

    expect(() => getClient()).toThrow(/createClient\(\{ apiKey \}\)/)
  })
})
