export enum SignerErrorCode {
  REJECTED_BY_USER = 'REJECTED_BY_USER',
  SIGN_TX_ERROR = 'SIGN_TX_ERROR',
  SEND_TX_ERROR = 'SEND_TX_ERROR',
  TX_FAILED_IN_BLOCKCHAIN = 'TX_FAILED_IN_BLOCKCHAIN',
  OPERATION_UNSUPPORTED = 'OPERATION_UNSUPPORTED',
  UNEXPECTED_BEHAVIOUR = 'UNEXPECTED_BEHAVIOUR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

export enum RPCErrorCode {
  REJECTION = 'REJECTION',
  UNDER_PRICED = 'UNDER_PRICED',
  OUT_OF_GAS = 'OUT_OF_GAS',
  CALL_EXCEPTION = 'CALL_EXCEPTION',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INTERNAL = 'INTERNAL',
  SLIPPAGE = 'SLIPPAGE',
  UNKNOWN_ERROR = 'UNKNOWN',
}

export function isSignerErrorCode(value: string): value is SignerErrorCode {
  return Object.keys(SignerErrorCode).includes(value)
}

export function getDefaultErrorMessage(code: SignerErrorCode): string {
  const errorMap: { [key in SignerErrorCode]: string } = {
    [SignerErrorCode.REJECTED_BY_USER]: 'User rejected the transaction',
    [SignerErrorCode.SIGN_TX_ERROR]: 'Error signing the transaction',
    [SignerErrorCode.SEND_TX_ERROR]: 'Error sending the transaction',
    [SignerErrorCode.NOT_IMPLEMENTED]: 'Operation not implemented',
    [SignerErrorCode.OPERATION_UNSUPPORTED]: 'Unsupported operation',
    [SignerErrorCode.TX_FAILED_IN_BLOCKCHAIN]:
      'Transaction failed in blockchain',
    [SignerErrorCode.UNEXPECTED_BEHAVIOUR]: 'Unexpected error',
  }
  return errorMap[code]
}

export type SignerOperationName =
  | 'executeEvmTransaction'
  | 'executeCosmosMessage'
  | 'executeSolanaTransaction'
  | 'executeTransfer'
  | 'executeStarknetTransaction'
  | 'executeTronTransaction'
  | 'signMessage'

export class SignerError extends Error {
  name = 'SignerError'
  public readonly code: SignerErrorCode
  public readonly root?: any
  public readonly rpcCode?: RPCErrorCode
  public context?: Record<string, unknown>
  public _isSignerError = true

  constructor(
    code: SignerErrorCode,
    m?: string | undefined,
    root?: any,
    rpcCode?: RPCErrorCode,
    cause?: any,
    context?: Record<string, unknown>
  ) {
    super(m || getDefaultErrorMessage(code), { cause })
    Object.setPrototypeOf(this, SignerError.prototype)
    SignerError.prototype._isSignerError = true
    this.code = code
    this.root = root
    this.rpcCode = rpcCode
    this.context = context
    if (
      this.code === SignerErrorCode.REJECTED_BY_USER ||
      SignerError.isRejectedError(root)
    ) {
      this.code = SignerErrorCode.REJECTED_BY_USER
      this.message = 'User rejected the transaction'
      this.root = undefined
    }
  }

  static isSignerError(obj: unknown): obj is SignerError {
    return (
      obj instanceof SignerError ||
      Object.prototype.hasOwnProperty.call(obj, '_isSignerError')
    )
  }

  static isRejectedError(error: any): boolean {
    const POSSIBLE_REJECTION_ERRORS = [
      'rejected by user',
      'rejected by the user',
      'user canceled',
      'user rejected',
      'user denied',
      'request rejected',
      'user abort',
      'disapproved',
      'declined by user',
    ]
    if (!!error && typeof error === 'string') {
      for (const msg of POSSIBLE_REJECTION_ERRORS) {
        if (error.toLowerCase().includes(msg.toLowerCase())) return true
      }
    } else if (!!error && typeof error === 'object') {
      if (error?.code === 4001) return true
      for (const msg of POSSIBLE_REJECTION_ERRORS) {
        if (
          JSON.stringify(error).toLowerCase().includes(msg.toLowerCase()) ||
          (error?.message || '').toLowerCase().includes(msg.toLowerCase())
        )
          return true
      }
    }
    return false
  }

  static UnsupportedError(operation: SignerOperationName): SignerError {
    return new SignerError(
      SignerErrorCode.OPERATION_UNSUPPORTED,
      `'${operation}' is not supported by the signer`
    )
  }
  static UnimplementedError(operation: SignerOperationName): SignerError {
    return new SignerError(
      SignerErrorCode.NOT_IMPLEMENTED,
      `'${operation}' is not implemented by the signer`
    )
  }

  static AssertionFailed(m: string): SignerError {
    return new SignerError(
      SignerErrorCode.UNEXPECTED_BEHAVIOUR,
      'Assertion failed: ' + m
    )
  }

  getErrorContext(): Record<string, unknown> {
    return {
      code: this.code,
      rpcCode: this.rpcCode,
      message: this.message,
      ...(this.context || {}),
    }
  }

  getErrorDetail(): {
    code: SignerErrorCode
    message: string
    detail?: string | undefined
  } {
    if (this.code === SignerErrorCode.REJECTED_BY_USER) {
      return {
        code: this.code,
        message: this.message,
        detail: this.root?.message || 'User rejected the transaction',
      }
    }

    const rawMessage =
      typeof this.root === 'object' && this.root && this.root.error
        ? this.root.error
        : JSON.stringify(this.root)

    const rootStr =
        typeof this.root === 'string'
        ? this.root
        : this.root instanceof Error
        ? this.root.message
        : rawMessage

    return {
      code: this.code,
      message: this.message,
      detail: rootStr,
    }
  }
}
