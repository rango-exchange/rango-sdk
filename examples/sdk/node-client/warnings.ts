import type { SdkWarning } from '@rango-dev/sdk'

const SECONDS_PER_MINUTE = 60

export function describeWarning(warning: SdkWarning): string {
  switch (warning.type) {
    case 'HIGH_VALUE_LOSS': {
      const {
        warningLevel,
        inputUsdValue,
        outputUsdValue,
        priceImpact,
        totalFee,
      } = warning.metadata
      return `High value loss (${warningLevel ?? 'no level'}): $${inputUsdValue.toFixed(2)} in, $${outputUsdValue.toFixed(2)} out, price impact ${priceImpact.toFixed(2)}%, fees $${totalFee.toFixed(2)}`
    }
    case 'UNKNOWN_PRICE':
      return 'The USD value of the input or output is unknown.'
    case 'INSUFFICIENT_SLIPPAGE':
      return `Slippage is below what a swap recommends. Use at least ${warning.metadata.minRequiredSlippage}%.`
    case 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE':
      return `The output changed by ${warning.metadata.percentageChange.toFixed(2)}% ($${warning.metadata.usdValueChange.toFixed(2)}) since the quote.`
    case 'HIGH_SLIPPAGE':
      return `Slippage of ${warning.metadata.slippage}% is higher than needed.`
    case 'HIGH_FEE':
      return `High fees: $${warning.metadata.totalFee.toFixed(2)}.`
    case 'LONG_DURATION':
      return `Slow route: about ${Math.ceil(warning.metadata.estimatedTimeInSeconds / SECONDS_PER_MINUTE)} minutes.`
    case 'INSUFFICIENT_BALANCE': {
      const { asset, blockchain, required, current, reason } = warning.metadata
      return `Not enough ${asset.symbol} on ${blockchain} (${reason}): needs ${required.amount}, has ${current.amount} (decimals: ${required.decimals}).`
    }
  }
}

export function printWarnings(warnings: SdkWarning[], indent = '  ') {
  for (const warning of warnings) {
    console.log(`${indent}Warning: ${describeWarning(warning)}`)
  }
}
