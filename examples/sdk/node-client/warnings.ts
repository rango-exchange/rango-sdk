import type { ConfirmWarning } from '@rango-dev/sdk'

const SECONDS_PER_MINUTE = 60

export function describeWarning(warning: ConfirmWarning): string {
  switch (warning.kind) {
    case 'HIGH_VALUE_LOSS':
      return `High value loss (${warning.level ?? 'no level'}): $${warning.usdIn.toFixed(2)} in, $${warning.usdOut.toFixed(2)} out, price impact ${warning.priceImpact.toFixed(2)}%, fees $${warning.totalFee.toFixed(2)}`
    case 'UNKNOWN_PRICE':
      return 'The USD value of the input or output is unknown.'
    case 'INSUFFICIENT_SLIPPAGE':
      return `Slippage is below what a swap recommends. Use at least ${warning.minRequired}%.`
    case 'EXCESSIVE_OUTPUT_CHANGE':
      return `The output changed by ${warning.percentageChange.toFixed(2)}% ($${warning.usdValueChange.toFixed(2)}) since the quote.`
    case 'HIGH_SLIPPAGE':
      return `Slippage of ${warning.slippage}% is higher than needed.`
    case 'HIGH_FEE':
      return `High fees: ${warning.totalFeeUsd.toFixed(2)}.`
    case 'LONG_DURATION':
      return `Slow route: about ${Math.ceil(warning.estimatedTimeInSeconds / SECONDS_PER_MINUTE)} minutes.`
    case 'INSUFFICIENT_BALANCE': {
      const { asset, required, current, reason } = warning
      return `Not enough ${asset.symbol} on ${warning.blockchain} (${reason}): needs ${required.amount}, has ${current.amount} (decimals: ${required.decimals}).`
    }
  }
}

export function printWarnings(warnings: ConfirmWarning[], indent = '  ') {
  for (const warning of warnings) {
    console.log(`${indent}Warning: ${describeWarning(warning)}`)
  }
}
