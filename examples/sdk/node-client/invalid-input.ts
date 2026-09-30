import type { InvalidInputMetadata } from '@rango-dev/sdk'

// Points at the input to fix, the way an app would highlight a form field.
export function describeInvalidInput({
  field,
  reason,
}: InvalidInputMetadata): string {
  switch (field) {
    case 'from':
    case 'to':
      return reason === 'SAME_ASSET'
        ? 'Choose two different assets.'
        : `Choose the ${field === 'from' ? 'source' : 'destination'} asset.`
    case 'amount':
      return reason === 'NOT_POSITIVE'
        ? 'Enter an amount greater than 0.'
        : 'Enter a valid amount.'
    case 'slippage':
      return reason === 'OUT_OF_RANGE'
        ? 'Choose a slippage above 0 and within the allowed maximum.'
        : 'Enter a valid slippage.'
    case 'destination':
      return reason === 'PATTERN_MISMATCH'
        ? 'The destination is not a valid address on the destination blockchain.'
        : "The destination can't be checked for this blockchain."
  }
}
