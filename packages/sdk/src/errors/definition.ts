/*
 * To add an error:
 * 1. Add its type to `SdkErrorMetadata` with its metadata type, or `undefined` when it has none.
 * 2. Define the metadata type here, and export it from this folder's `mod.ts` and from the package entry.
 * 3. Document it in the README's Errors table and in the error list of each method that throws it, and how its
 *    fields are read or computed as JSDoc on its metadata type here.
 */

import type { SwapResult } from 'rango-sdk'

export type NoResultMetadata = {
  /**
   * The server's reason, when it gives one: the response's first diagnosis message. A Quote with no swaps and a
   * confirm response with no result give none.
   */
  diagnosisMessage?: string
}

export type BridgeLimitMetadata = {
  /**
   * The first swap whose input amount is outside its limits: `fromAmountMinValue` and `fromAmountMaxValue`.
   * With a `fromAmountRestrictionType` of `EXCLUSIVE`, an amount equal to a limit is out of range; with any other
   * value, or none, it's in range. A missing or empty limit is no limit.
   */
  swap: SwapResult
  /**
   * The limit the amount breaks. `MIN`: the amount must go up. `MAX`: the amount must go down.
   * When an amount breaks both, it's `MAX`.
   */
  limit: 'MIN' | 'MAX'
  /** The broken limit as the server sends it: `fromAmountMinValue` for `MIN`, `fromAmountMaxValue` for `MAX`. */
  limitValue: string
  /**
   * Whether an amount equal to `limitValue` is out of range: the swap's `fromAmountRestrictionType` is `EXCLUSIVE`.
   * For `MIN`, the amount must be greater than `limitValue` when true, and at least `limitValue` when false.
   * For `MAX`, it must be less than `limitValue` when true, and at most `limitValue` when false.
   */
  exclusive: boolean
}

/**
 * The input field that fails a check, and why. `quote()` and `quotes()` check `to` (`SAME_ASSET` as `from`) and
 * `amount` (`NOT_A_NUMBER` or `NOT_POSITIVE`). `quote()` and `confirm()` check `destination`
 * (`PATTERN_MISMATCH` with every address pattern of the destination blockchain, or `NO_ADDRESS_PATTERNS` when that
 * blockchain has none in the client's `meta.blockchains`). The slippage isn't checked.
 */
export type InvalidInputMetadata =
  | { field: 'to'; reason: 'SAME_ASSET' }
  | { field: 'amount'; reason: 'NOT_A_NUMBER' | 'NOT_POSITIVE' }
  | {
      field: 'destination'
      reason: 'NO_ADDRESS_PATTERNS' | 'PATTERN_MISMATCH'
    }

export type SdkErrorMetadata = {
  NO_RESULT: NoResultMetadata
  REQUEST_FAILED: undefined
  REQUEST_CANCELED: undefined
  BAD_REQUEST: undefined
  UNAUTHORIZED: undefined
  FORBIDDEN: undefined
  NOT_FOUND: undefined
  TOO_MANY_REQUESTS: undefined
  SERVER_ERROR: undefined
  INVALID_INPUT: InvalidInputMetadata
  BRIDGE_LIMIT: BridgeLimitMetadata
  UNKNOWN_SLIPPAGE: undefined
}
