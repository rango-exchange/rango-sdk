import type {
  ExcessiveOutputAmountChangeWarningMetadata,
  HighFeeWarningMetadata,
  HighSlippageWarningMetadata,
  HighValueLossWarningMetadata,
  InsufficientBalanceWarningMetadata,
  InsufficientSlippageWarningMetadata,
  LongDurationWarningMetadata,
} from './definition.js'
import type { SdkWarning, SdkWarningType } from './implementation.js'

import { describe, expect, expectTypeOf, test } from 'vitest'

import { createWarning, WARNING_MESSAGES } from './implementation.js'

describe('SdkWarning', () => {
  test('has the agreed message for every type', () => {
    expectTypeOf(WARNING_MESSAGES).toEqualTypeOf<
      Record<SdkWarningType, string>
    >()
    expect(WARNING_MESSAGES).toEqual({
      HIGH_VALUE_LOSS:
        "The route loses a large share of the input's USD value.",
      UNKNOWN_PRICE: 'The USD value of the input or the output is unknown.',
      INSUFFICIENT_SLIPPAGE:
        'The slippage is below the minimum the route requires.',
      HIGH_SLIPPAGE: 'The slippage is above the high-slippage threshold.',
      HIGH_FEE: "The route's total fee is at or above the high-fee threshold.",
      LONG_DURATION:
        "The route's estimated time is at or above the long-duration threshold.",
      INSUFFICIENT_BALANCE: "A wallet doesn't hold enough of an asset.",
      EXCESSIVE_OUTPUT_AMOUNT_CHANGE:
        'The confirmed output is worth much less than the quoted output.',
    })
  })

  test('requires metadata for every type but UNKNOWN_PRICE', () => {
    type TypesWithOptionalMetadata = {
      [K in SdkWarningType]: { type: K; message: string } extends SdkWarning<K>
        ? K
        : never
    }[SdkWarningType]

    expectTypeOf<TypesWithOptionalMetadata>().toEqualTypeOf<'UNKNOWN_PRICE'>()
    expectTypeOf<{
      type: 'UNKNOWN_PRICE'
      message: string
    }>().toExtend<SdkWarning<'UNKNOWN_PRICE'>>()
    expectTypeOf<{
      type: 'HIGH_FEE'
      message: string
    }>().not.toExtend<SdkWarning<'HIGH_FEE'>>()
  })

  test('narrows metadata on type', () => {
    function readMetadata(warning: SdkWarning) {
      switch (warning.type) {
        case 'HIGH_VALUE_LOSS':
          expectTypeOf(
            warning.metadata,
          ).toEqualTypeOf<HighValueLossWarningMetadata>()
          break
        case 'UNKNOWN_PRICE':
          expectTypeOf(warning.metadata).toEqualTypeOf<undefined>()
          break
        case 'INSUFFICIENT_SLIPPAGE':
          expectTypeOf(
            warning.metadata,
          ).toEqualTypeOf<InsufficientSlippageWarningMetadata>()
          break
        case 'HIGH_SLIPPAGE':
          expectTypeOf(
            warning.metadata,
          ).toEqualTypeOf<HighSlippageWarningMetadata>()
          break
        case 'HIGH_FEE':
          expectTypeOf(warning.metadata).toEqualTypeOf<HighFeeWarningMetadata>()
          break
        case 'LONG_DURATION':
          expectTypeOf(
            warning.metadata,
          ).toEqualTypeOf<LongDurationWarningMetadata>()
          break
        case 'INSUFFICIENT_BALANCE':
          expectTypeOf(
            warning.metadata,
          ).toEqualTypeOf<InsufficientBalanceWarningMetadata>()
          break
        case 'EXCESSIVE_OUTPUT_AMOUNT_CHANGE':
          expectTypeOf(
            warning.metadata,
          ).toEqualTypeOf<ExcessiveOutputAmountChangeWarningMetadata>()
          break
      }
    }

    void readMetadata
  })

  test('createWarning rejects missing or wrong metadata for a type that has it', () => {
    // @ts-expect-error HIGH_FEE needs metadata.
    void createWarning('HIGH_FEE')
    // @ts-expect-error HIGH_FEE has no slippage.
    void createWarning('HIGH_FEE', { slippage: '1' })
    // @ts-expect-error UNKNOWN_PRICE takes no metadata.
    void createWarning('UNKNOWN_PRICE', { totalFee: 1 })

    expectTypeOf(createWarning('UNKNOWN_PRICE')).toEqualTypeOf<
      SdkWarning<'UNKNOWN_PRICE'>
    >()
    expectTypeOf(createWarning('HIGH_FEE', { totalFee: 1 })).toEqualTypeOf<
      SdkWarning<'HIGH_FEE'>
    >()
  })
})
