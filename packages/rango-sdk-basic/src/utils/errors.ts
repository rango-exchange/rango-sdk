import { getMessageFromCode } from 'eth-rpc-errors'
import { MetamaskErrorCodes } from '../types/utils/errors'

export const prettifyError = (error: any) => {
  if (!error) return error
  if (error.code && (error.code === 'ACTION_REJECTED' || error.code === 4001))
    return new Error('Transaction Rejected')
  if (error && typeof error.code === 'number') {
    if (Object.values(MetamaskErrorCodes.provider).includes(error.code)) {
      return new Error(getMessageFromCode(error.code))
    }
    if (Object.values(MetamaskErrorCodes.rpc).includes(error.code)) {
      if (
        error.code === MetamaskErrorCodes.rpc.internal &&
        error.message?.includes('underpriced')
      )
        return new Error('Transaction underpriced')
      if (
        error.message?.includes('intrinsic gas too low') ||
        error.message?.includes('out of gas')
      )
        return new Error('This Gas limit is low.')
      return new Error(getMessageFromCode(error.code))
    }
  }
  if (error.message) return new Error(error.message)
  return error
}
