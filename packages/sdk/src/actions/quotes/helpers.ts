import type { CheckedResponse, QuotesResult, WarnedResponse } from './types.js'
import type { MultiRouteResponse } from 'rango-sdk'

import { NO_RESULT_MESSAGE, SdkError } from '../../errors/mod.js'
import {
  getQuoteWarnings,
  omitErrorFields,
  validateRoute,
} from '../quote/mod.js'

// Throws for a failure of the whole response, and gives each server result its first error.
export function checkErrors(response: MultiRouteResponse): CheckedResponse {
  if (response.error) {
    throw new SdkError('REQUEST_FAILED', response.error, { cause: response })
  }

  if (!response.results?.length) {
    const diagnosisMessage = response.diagnosisMessages?.[0]
    throw new SdkError('NO_RESULT', NO_RESULT_MESSAGE, {
      metadata: diagnosisMessage === undefined ? {} : { diagnosisMessage },
    })
  }

  return {
    response,
    errors: response.results.map((result) => {
      try {
        // The response's diagnosis messages are about the whole request, so a Quote with no swaps gets none.
        validateRoute({ result })
        return undefined
      } catch (error) {
        if (error instanceof SdkError) {
          return error
        }
        throw error
      }
    }),
  }
}

export function checkWarnings(slippage: string | undefined) {
  return ({ response, errors }: CheckedResponse): WarnedResponse => ({
    response,
    errors,
    warnings: response.results.map((result) =>
      getQuoteWarnings(
        {
          requestAmount: response.requestAmount,
          outputAmount: result.outputAmount,
          swaps: result.swaps,
        },
        slippage,
      ),
    ),
  })
}

export function generateResult(slippage: string | undefined) {
  return ({ response, errors, warnings }: WarnedResponse): QuotesResult => {
    const { results, ...rest } = omitErrorFields(response)
    return {
      data: {
        ...rest,
        quotes: results.map((result, index) => {
          const error = errors[index]
          return {
            data: {
              ...result,
              requestAmount: response.requestAmount,
              to: response.to,
              ...(slippage === undefined ? {} : { slippage }),
            },
            warnings: warnings[index],
            ...(error === undefined ? {} : { error }),
          }
        }),
      },
      _response: response,
    }
  }
}
