export type ThresholdCriterion = {
  threshold: number
  minInput: number
}

export type ValidationThresholds = {
  priceImpact: { low: number; high: number }
  highValueLoss: ThresholdCriterion[]
  excessiveOutputChange: ThresholdCriterion[]
  highSlippage: number
  highFee: number
  longDuration: number
  // The lower bound, greater than 0, is fixed.
  slippage: { max: number }
}

export type ValidationConfig = Partial<ValidationThresholds>

export const DEFAULT_VALIDATION_THRESHOLDS: ValidationThresholds = {
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
  highFee: 30,
  longDuration: 900,
  slippage: { max: 30 },
}

// Later configs win per top-level key. A key set to undefined keeps the earlier value.
export function resolveThresholds(
  ...configs: (ValidationConfig | undefined)[]
): ValidationThresholds {
  const resolved = { ...DEFAULT_VALIDATION_THRESHOLDS }
  for (const config of configs) {
    if (config) {
      Object.assign(
        resolved,
        Object.fromEntries(
          Object.entries(config).filter(([, value]) => value !== undefined),
        ),
      )
    }
  }
  return resolved
}
