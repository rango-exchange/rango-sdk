import {
  HTTP_SERVER_ERROR_MAX,
  HTTP_SERVER_ERROR_MIN,
  HTTP_STATUS_ERROR_TYPES,
  REQUEST_FAILED_MESSAGE,
} from './constants.js'
import { SdkError } from './implementation.js'

type HttpErrorType =
  | (typeof HTTP_STATUS_ERROR_TYPES)[keyof typeof HTTP_STATUS_ERROR_TYPES]
  | 'SERVER_ERROR'
  | 'REQUEST_FAILED'

/*
 * Rethrows an SdkError as it is, and throws anything else as REQUEST_CANCELED, the type of its HTTP status, or
 * REQUEST_FAILED.
 */
export function throwRequestError(
  cause: unknown,
  signal: AbortSignal | undefined,
): never {
  if (cause instanceof SdkError) {
    throw cause
  }
  if (signal?.aborted) {
    throw new SdkError('REQUEST_CANCELED', 'The request was canceled.', {
      cause,
    })
  }
  const message = getResponseErrorMessage(cause) ?? REQUEST_FAILED_MESSAGE
  throw new SdkError(getHttpErrorType(getHttpStatus(cause)), message, {
    cause,
  })
}

function getHttpErrorType(status: number | undefined): HttpErrorType {
  if (status === undefined) {
    return 'REQUEST_FAILED'
  }
  if (status >= HTTP_SERVER_ERROR_MIN && status <= HTTP_SERVER_ERROR_MAX) {
    return 'SERVER_ERROR'
  }
  return status in HTTP_STATUS_ERROR_TYPES
    ? HTTP_STATUS_ERROR_TYPES[status as keyof typeof HTTP_STATUS_ERROR_TYPES]
    : 'REQUEST_FAILED'
}

export function getHttpStatus(error: unknown): number | undefined {
  const response = getErrorResponse(error)
  return response && 'status' in response && typeof response.status === 'number'
    ? response.status
    : undefined
}

export function getResponseErrorMessage(error: unknown): string | undefined {
  const body = getResponseBody(error)
  if (typeof body !== 'object' || body === null) {
    return undefined
  }
  if ('error' in body && typeof body.error === 'string' && body.error) {
    return body.error
  }
  return undefined
}

function getErrorResponse(error: unknown): object | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined
  }
  const { response } = error
  return typeof response === 'object' && response !== null
    ? response
    : undefined
}

function getResponseBody(error: unknown): unknown {
  const response = getErrorResponse(error)
  return response && 'data' in response ? response.data : undefined
}
