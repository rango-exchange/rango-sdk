// Shared because NO_RESULT is thrown from several places.
export const NO_RESULT_MESSAGE = 'No result was found for this request.'

export const REQUEST_FAILED_MESSAGE = 'The request failed.'

export const HTTP_STATUS_ERROR_TYPES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'TOO_MANY_REQUESTS',
} as const

export const HTTP_SERVER_ERROR_MIN = 500
export const HTTP_SERVER_ERROR_MAX = 599
