import type * as Sdk from './mod.js'

import { describe, expect, test } from 'vitest'

async function loadSdk(): Promise<typeof Sdk> {
  return import('./mod.js')
}

describe('client', () => {
  test('RangoClient is the only way to get a client', async () => {
    const sdk = await loadSdk()

    expect(sdk.RangoClient).toBeTypeOf('function')
    expect('createClient' in sdk).toBe(false)
    expect('getClient' in sdk).toBe(false)
    // @ts-expect-error createClient is not exported.
    void sdk.createClient
    // @ts-expect-error getClient is not exported.
    void sdk.getClient
  })
})
