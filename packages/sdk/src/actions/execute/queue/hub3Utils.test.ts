import { describe, expect, test } from 'vitest'

import { encodeApproveCallData } from './hub3Utils.js'

describe('encodeApproveCallData', () => {
  test('encodes the approve selector, the lower-cased spender and the amount as hex, each padded to a 32-byte word', () => {
    const spender = '0xAbC0000000000000000000000000000000000123'
    const amount = '1000000'

    const callData = encodeApproveCallData(spender, amount)

    expect(callData).toBe(
      '0x095ea7b3000000000000000000000000abc000000000000000000000000000000000012300000000000000000000000000000000000000000000000000000000000f4240',
    )
  })
})
