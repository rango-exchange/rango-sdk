import BigNumber from 'bignumber.js'

export function numberToBN(amount: string, decimals: number) {
  return new BigNumber(amount).shiftedBy(-decimals)
}

export const numberToString = (
  number: BigNumber | string | null | undefined,
  minDecimals: number | null = null,
  maxDecimals: number | null = null
): string => {
  if (number === null || number === undefined) {
    return ''
  }
  if (number === '') {
    return ''
  }
  const n = new BigNumber(number)
  const roundingMode = 1
  let maxI = 1000
  for (let i = 0; i < 60; i++) {
    if (new BigNumber(n.toFixed(i, roundingMode)).eq(n)) {
      maxI = i
      break
    }
  }

  if (n.gte(10000)) {
    return n.toFormat(0, roundingMode)
  }
  if (n.gte(1000)) {
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 1))
      ),
      roundingMode
    )
  }
  if (n.gte(100)) {
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 1))
      ),
      roundingMode
    )
  }
  if (n.gte(1)) {
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 2))
      ),
      roundingMode
    )
  }
  if (n.gte(0.01)) {
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 4))
      ),
      roundingMode
    )
  }
  for (let i = minDecimals || 4; i < 17; i++) {
    if (n.gte(Math.pow(10, -i))) {
      return n.toFormat(
        Math.min(
          maxI,
          Math.min(maxDecimals || 100, Math.max(minDecimals || 0, i))
        ),
        roundingMode
      )
    }
  }
  if (n.isEqualTo(0)) {
    return '0'
  }

  return n.toFormat(
    Math.min(maxI, Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 8))),
    roundingMode
  )
}
