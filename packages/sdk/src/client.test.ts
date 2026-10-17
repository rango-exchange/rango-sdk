import type * as Sdk from './mod.js'
import type * as LegacySdk from 'rango-sdk'

import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest'

const legacy = vi.hoisted(() => ({ getAllRoutes: vi.fn() }))

vi.mock('rango-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySdk>()),
  RangoClient: class {
    readonly #args: unknown[]
    constructor(...args: unknown[]) {
      this.#args = args
    }
    getAllRoutes = async (...callArgs: unknown[]) =>
      legacy.getAllRoutes(this.#args, ...callArgs)
  },
}))

async function loadSdk(): Promise<typeof Sdk> {
  return import('./mod.js')
}

describe('client', () => {
  beforeEach(() => {
    legacy.getAllRoutes.mockReset()
  })

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

  test('two clients with different API keys each use their own config', async () => {
    const { RangoClient } = await loadSdk()
    legacy.getAllRoutes.mockResolvedValue({ results: [] })
    const request = {
      from: { blockchain: 'ETH', symbol: 'ETH', address: null },
      to: { blockchain: 'BSC', symbol: 'BNB', address: null },
      amount: '1',
    }

    const first = new RangoClient({
      apiKey: 'first-key',
      meta: { blockchains: [] },
    })
    const second = new RangoClient({
      apiKey: 'second-key',
      baseUrl: 'https://example.test',
      meta: { blockchains: [] },
    })
    await first.quotes(request).catch(() => undefined)
    await second.quotes(request).catch(() => undefined)
    await first.quotes(request).catch(() => undefined)

    expect(legacy.getAllRoutes.mock.calls.map(([args]) => args)).toEqual([
      ['first-key', 'https://api.rango.exchange'],
      ['second-key', 'https://example.test'],
      ['first-key', 'https://api.rango.exchange'],
    ])
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
      EXCESSIVE_OUTPUT_AMOUNT_CHANGE: Sdk.ExcessiveOutputAmountChangeWarningMetadata
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
