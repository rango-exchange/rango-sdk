import type * as Sdk from './mod.js'

import { describe, expect, expectTypeOf, test } from 'vitest'

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

  test('has no affiliate settings', async () => {
    const { RangoClient } = await loadSdk()

    const client = new RangoClient({
      apiKey: 'test-key',
      meta: { blockchains: [] },
    })

    expect('setAffiliate' in client).toBe(false)
    expectTypeOf<keyof Sdk.RangoClientConfig>().toEqualTypeOf<
      'apiKey' | 'baseUrl' | 'meta'
    >()
    // @ts-expect-error The Affiliate type is no longer exported.
    expectTypeOf<Sdk.Affiliate>()
  })

  test('requires the blockchains meta in the config', () => {
    expectTypeOf<Sdk.RangoClientConfig['meta']>().toEqualTypeOf<{
      blockchains: readonly Sdk.BlockchainMeta[]
    }>()
    expectTypeOf<{ apiKey: string }>().not.toExtend<Sdk.RangoClientConfig>()
    expectTypeOf<{
      apiKey: string
      meta: Record<string, never>
    }>().not.toExtend<Sdk.RangoClientConfig>()
  })
})

describe('warning exports', () => {
  test('exports the warning types', () => {
    expectTypeOf<Sdk.SdkWarningType>().toEqualTypeOf<
      keyof Sdk.SdkWarningMetadata
    >()
    expectTypeOf<Sdk.SdkWarningMetadata>().toEqualTypeOf<{
      HIGH_VALUE_LOSS: Sdk.HighValueLossWarningMetadata
      UNKNOWN_PRICE: undefined
      INSUFFICIENT_SLIPPAGE: Sdk.InsufficientSlippageWarningMetadata
      HIGH_SLIPPAGE: Sdk.HighSlippageWarningMetadata
      HIGH_FEE: Sdk.HighFeeWarningMetadata
      LONG_DURATION: Sdk.LongDurationWarningMetadata
      INSUFFICIENT_BALANCE: Sdk.InsufficientBalanceWarningMetadata
    }>()
    expectTypeOf<
      Sdk.HighValueLossWarningMetadata['warningLevel']
    >().toEqualTypeOf<Sdk.HighValueLossLevel>()
    expectTypeOf<
      Sdk.InsufficientBalanceWarningMetadata['reason']
    >().toEqualTypeOf<Sdk.InsufficientBalanceReason>()

    expectTypeOf<Sdk.SdkWarning['type']>().toEqualTypeOf<Sdk.SdkWarningType>()
  })

  test('keeps createWarning internal', async () => {
    const sdk = await loadSdk()

    expect('createWarning' in sdk).toBe(false)
    // @ts-expect-error createWarning is not exported.
    void sdk.createWarning
  })
})
