import type * as Sdk from './mod.js'

import { beforeEach, describe, expect, expectTypeOf, test } from 'vitest'

import {
  clientArgsOf,
  httpClient,
  loadSdk,
  recordingNamespaces,
  resetHttpClient,
} from '../tests/support.js'

describe('client', () => {
  beforeEach(() => {
    resetHttpClient()
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
    httpClient.getAllRoutes.mockResolvedValue({ results: [] })
    const args: [Sdk.Asset, Sdk.Asset, string] = [
      { blockchain: 'ETH', symbol: 'ETH', address: null },
      { blockchain: 'BSC', symbol: 'BNB', address: null },
      '1',
    ]

    const first = new RangoClient({
      apiKey: 'first-key',
    })
    const second = new RangoClient({
      apiKey: 'second-key',
      baseUrl: 'https://example.test',
    })
    // No results, so each call throws NO_RESULT after reaching the server.
    const noResult = { type: 'NO_RESULT' }
    await expect(first.quotes(...args)).rejects.toMatchObject(noResult)
    await expect(second.quotes(...args)).rejects.toMatchObject(noResult)
    await expect(first.quotes(...args)).rejects.toMatchObject(noResult)

    expect(clientArgsOf(httpClient.getAllRoutes)).toEqual([
      ['first-key', 'https://api.rango.exchange'],
      ['second-key', 'https://example.test'],
      ['first-key', 'https://api.rango.exchange'],
    ])
  })

  test('has no affiliate settings', async () => {
    const { RangoClient } = await loadSdk()

    const client = new RangoClient({
      apiKey: 'test-key',
    })

    expect('setAffiliate' in client).toBe(false)
    expectTypeOf<keyof Sdk.RangoClientConfig>().toEqualTypeOf<
      'apiKey' | 'baseUrl' | 'execution'
    >()
    // @ts-expect-error The Affiliate type is no longer exported.
    expectTypeOf<Sdk.Affiliate>()
  })

  test('takes only an API key, an optional base URL and an optional execution config', async () => {
    const { RangoClient } = await loadSdk()

    expect(new RangoClient({ apiKey: 'test-key' })).toBeInstanceOf(RangoClient)
    expect(
      new RangoClient({ apiKey: 'test-key', baseUrl: 'https://example.test' }),
    ).toBeInstanceOf(RangoClient)
    expectTypeOf<Sdk.RangoClientConfig>().toEqualTypeOf<{
      apiKey: string
      baseUrl?: string
      execution?: Sdk.ExecutionConfig
    }>()
    expect(
      new RangoClient({ apiKey: 'test-key', execution: {} }),
    ).toBeInstanceOf(RangoClient)
    const { wallet } = recordingNamespaces()
    // @ts-expect-error the execution settings are under execution: the config has no top-level wallet
    void new RangoClient({ apiKey: 'test-key', wallet })
    // @ts-expect-error the execution settings are under execution: the config has no top-level pauseOnStart
    void new RangoClient({ apiKey: 'test-key', pauseOnStart: true })
    // @ts-expect-error the config takes no meta: the client fetches the blockchains itself
    void new RangoClient({ apiKey: 'test-key', meta: { blockchains: [] } })
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
