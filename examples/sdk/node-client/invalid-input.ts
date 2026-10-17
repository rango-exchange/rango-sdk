import type { InvalidInputMetadata } from '@rango-dev/sdk'

// Points at the input to fix, the way an app would highlight a form field.
export function describeInvalidInput({
  field,
  reason,
}: InvalidInputMetadata): string {
  switch (field) {
    case 'to':
      return 'Choose two different assets.'
    case 'amount':
      return reason === 'NOT_POSITIVE'
        ? 'Enter an amount greater than 0.'
        : 'Enter a valid amount.'
    case 'destination':
      return reason === 'PATTERN_MISMATCH'
        ? 'The destination is not a valid address on the destination blockchain.'
        : "The destination can't be checked for this blockchain."
  }
}
