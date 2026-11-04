// The CAIP-10 parser the hub3 adapters read account addresses and chain references with.
import { describe, expect, test } from 'vitest'

import { getCaip10Address, getCaip10Reference } from './caip-10.js'

describe('getCaip10Address', () => {
  test('answers everything after the second `:`', () => {
    expect(
      getCaip10Address('eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb'),
    ).toBe('0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb')
    expect(
      getCaip10Address(
        'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
      ),
    ).toBe('128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6')
  })

  test('keeps any further `:` in the address', () => {
    expect(getCaip10Address('ns:ref:addr:with:colons')).toBe('addr:with:colons')
  })

  test('answers an id with fewer than two `:` as it is', () => {
    expect(getCaip10Address('0xabc')).toBe('0xabc')
    expect(getCaip10Address('eip155:0xabc')).toBe('eip155:0xabc')
  })
})

describe('getCaip10Reference', () => {
  test('answers what lies between the first and second `:`', () => {
    expect(getCaip10Reference('eip155:1:0xabc')).toBe('1')
    expect(
      getCaip10Reference(
        'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
      ),
    ).toBe('000000000019d6689c085ae165831e93')
  })

  test('ignores any further `:` in the address', () => {
    expect(getCaip10Reference('ns:ref:addr:with:colons')).toBe('ref')
  })

  test('answers null for an id with fewer than two `:`', () => {
    expect(getCaip10Reference('0xabc')).toBeNull()
    expect(getCaip10Reference('eip155:0xabc')).toBeNull()
  })
})
