/**
 * `Symbol.for` shares the brand across package copies; typed as `symbol` so
 * two copies' classes stay assignable.
 */
const RANGO_ERROR_BRAND: symbol = Symbol.for('rango.RangoError')
const DEFAULT_MESSAGE = 'Unknown error'
const DEFAULT_TYPE = 'unknown'

export type RangoErrorOptions<M> = {
  cause?: unknown
  type?: string
  metadata?: M
  tags?: Record<string, string>
  defaultMessage?: string
}

function getCauseMessage(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('message' in cause)) {
    return undefined
  }
  const { message } = cause
  return typeof message === 'string' && message ? message : undefined
}

export class RangoError<M = Record<string, unknown>> extends Error {
  readonly name: string = 'RangoError'
  readonly type: string
  readonly metadata: M
  readonly tags: Record<string, string>

  constructor(message?: string, options: RangoErrorOptions<M> = {}) {
    super(
      message ||
        getCauseMessage(options.cause) ||
        options.defaultMessage ||
        DEFAULT_MESSAGE,
      { cause: options.cause },
    )
    this.type = options.type ?? DEFAULT_TYPE
    this.metadata = options.metadata ?? ({} as M)
    this.tags = { ...options.tags }
  }

  get [RANGO_ERROR_BRAND](): true {
    return true
  }

  static isRangoError(value: unknown): value is RangoError {
    return (
      typeof value === 'object' &&
      value !== null &&
      Reflect.get(value, RANGO_ERROR_BRAND) === true
    )
  }

  addTag(key: string, value: string): this {
    if (!Object.prototype.hasOwnProperty.call(this.tags, key)) {
      this.tags[key] = value
    }
    return this
  }

  getErrorTags(): Record<string, string> {
    return { ...this.tags, name: this.name, type: this.type }
  }

  getErrorContext(): M {
    return this.metadata
  }
}

export function getRangoError(error: unknown): RangoError {
  return RangoError.isRangoError(error)
    ? error
    : new RangoError(undefined, { cause: error })
}
