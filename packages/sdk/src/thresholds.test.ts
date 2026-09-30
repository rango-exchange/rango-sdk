import type { ValidationThresholds } from './thresholds.js'

import { describe, expect, test } from 'vitest'

import {
  DEFAULT_VALIDATION_THRESHOLDS,
  resolveThresholds,
} from './thresholds.js'

describe('resolveThresholds', () => {
  test('uses the widget defaults when nothing is configured', () => {
    expect(resolveThresholds()).toEqual({
      priceImpact: { low: -3, high: -10 },
      highValueLoss: [
        { threshold: -10, minInput: 400 },
        { threshold: -5, minInput: 1000 },
      ],
      excessiveOutputChange: [
        { threshold: -1, minInput: 1000 },
        { threshold: -2, minInput: 500 },
      ],
      highSlippage: 5,
      slippage: { max: 30 },
    } satisfies ValidationThresholds)
  })

  test('applies the client config over the defaults, per top-level key', () => {
    expect(resolveThresholds({ highSlippage: 8 }, undefined)).toEqual({
      ...DEFAULT_VALIDATION_THRESHOLDS,
      highSlippage: 8,
    })
  })

  test('applies a per-call override over the client config', () => {
    const client = { highSlippage: 8, priceImpact: { low: -2, high: -6 } }

    expect(resolveThresholds(client, { highSlippage: 3 })).toEqual({
      ...DEFAULT_VALIDATION_THRESHOLDS,
      priceImpact: { low: -2, high: -6 },
      highSlippage: 3,
    })
  })

  test('replaces a default array whole with a supplied array', () => {
    const highValueLoss = [{ threshold: -20, minInput: 50 }]

    expect(resolveThresholds({ highValueLoss })).toEqual({
      ...DEFAULT_VALIDATION_THRESHOLDS,
      highValueLoss,
    })
  })

  test('replaces the default slippage object whole', () => {
    expect(resolveThresholds({ slippage: { max: 50 } }, undefined)).toEqual({
      ...DEFAULT_VALIDATION_THRESHOLDS,
      slippage: { max: 50 },
    })
    expect(
      resolveThresholds({ slippage: { max: 50 } }, { slippage: { max: 10 } }),
    ).toEqual({ ...DEFAULT_VALIDATION_THRESHOLDS, slippage: { max: 10 } })
  })

  test('keeps the earlier value for a key set to undefined', () => {
    expect(
      resolveThresholds({ highSlippage: 8 }, { highSlippage: undefined }),
    ).toEqual({ ...DEFAULT_VALIDATION_THRESHOLDS, highSlippage: 8 })
  })
})
