// Price impact percentages for HIGH_VALUE_LOSS's warning level.
export const PRICE_IMPACT_LEVELS = { low: -3, high: -10 } as const

// HIGH_VALUE_LOSS: price impact percentage and minimum input in USD.
export const HIGH_VALUE_LOSS_CRITERIA = [
  { threshold: -10, minInput: 400 },
  { threshold: -5, minInput: 1000 },
] as const

// EXCESSIVE_OUTPUT_AMOUNT_CHANGE: output change percentage and minimum input in USD.
export const EXCESSIVE_OUTPUT_CHANGE_CRITERIA = [
  { threshold: -1, minInput: 1000 },
  { threshold: -2, minInput: 500 },
] as const

// HIGH_SLIPPAGE, as a percentage.
export const HIGH_SLIPPAGE_THRESHOLD = 5

// HIGH_FEE, in USD.
export const HIGH_FEE_THRESHOLD = 30

// LONG_DURATION, in seconds.
export const LONG_DURATION_THRESHOLD = 900
