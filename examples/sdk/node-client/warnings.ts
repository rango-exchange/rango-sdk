import type { RouteWarning } from '@rango-dev/sdk'

export function describeWarning(warning: RouteWarning): string {
  switch (warning.kind) {
    case 'HIGH_VALUE_LOSS':
      return `High value loss (${warning.level}): $${warning.usdIn.toFixed(2)} in, $${warning.usdOut.toFixed(2)} out, price impact ${warning.priceImpact.toFixed(2)}%, fees $${warning.totalFee.toFixed(2)}`
    case 'UNKNOWN_PRICE':
      return 'The USD value of the input or output is unknown.'
    case 'INSUFFICIENT_SLIPPAGE':
      return `Slippage is below what a swap recommends. Use at least ${warning.minRequired}%.`
    case 'HIGH_SLIPPAGE':
      return `Slippage of ${warning.slippage}% is higher than needed.`
    case 'INSUFFICIENT_BALANCE': {
      const { asset, required, current, reason } = warning
      return `Not enough ${asset.symbol} on ${warning.blockchain} (${reason}): needs ${required.amount}, has ${current.amount} (decimals: ${required.decimals}).`
    }
  }
}

export function printWarnings(warnings: RouteWarning[], indent = '  ') {
  for (const warning of warnings) {
    console.log(`${indent}Warning: ${describeWarning(warning)}`)
  }
}
