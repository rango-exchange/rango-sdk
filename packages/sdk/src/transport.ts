import type { Affiliate } from './client.js'
import type { RequestFailedMetadata } from './errors.js'
import type { ValidationConfig } from './thresholds.js'

export type RequestOptions = {
  signal?: AbortSignal
  validation?: ValidationConfig
}

type AffiliateFields = {
  affiliateRef?: string | null
  affiliatePercent?: number | null
  affiliateWallets?: { [key: string]: string }
}

export function withAffiliate<T extends AffiliateFields>(
  body: T,
  affiliate: Affiliate | undefined,
): T {
  const result = { ...body }
  if (affiliate) {
    result.affiliateRef = affiliate.ref
    if (affiliate.percent !== undefined) {
      result.affiliatePercent = affiliate.percent
    }
    if (affiliate.wallets) {
      result.affiliateWallets = affiliate.wallets
    }
  }
  return result
}

export function httpStatus(error: unknown): number | undefined {
  const response = errorResponse(error)
  return response && 'status' in response && typeof response.status === 'number'
    ? response.status
    : undefined
}

// Reads the error code and trace ID from an HTTP error's response body, when the API sent one.
export function requestFailedMetadata(error: unknown): RequestFailedMetadata {
  const body = responseBody(error)
  if (typeof body !== 'object' || body === null) {
    return { errorCode: null, traceId: null }
  }
  return {
    errorCode:
      'errorCode' in body && typeof body.errorCode === 'number'
        ? body.errorCode
        : null,
    traceId:
      'traceId' in body && typeof body.traceId === 'number'
        ? body.traceId
        : null,
  }
}

export function responseErrorMessage(error: unknown): string | undefined {
  const body = responseBody(error)
  if (typeof body === 'string') {
    return body || undefined
  }
  if (typeof body !== 'object' || body === null) {
    return undefined
  }
  if ('error' in body && typeof body.error === 'string' && body.error) {
    return body.error
  }
  if ('message' in body && typeof body.message === 'string' && body.message) {
    return body.message
  }
  return undefined
}

function errorResponse(error: unknown): object | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined
  }
  const { response } = error
  return typeof response === 'object' && response !== null
    ? response
    : undefined
}

function responseBody(error: unknown): unknown {
  const response = errorResponse(error)
  return response && 'data' in response ? response.data : undefined
}
