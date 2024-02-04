import {
  RangoClient,
  Amount,
  WalletDetail,
  MetaResponse,
} from 'rango-sdk-basic'
import BigNumber from 'bignumber.js'

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export async function checkApprovalSync(
  requestId: string,
  txId: string,
  rangoClient: RangoClient
) {
  while (true) {
    const approvalResponse = await rangoClient.isApproved(requestId, txId)
    if (approvalResponse.isApproved) {
      return true
    }
    await sleep(3000)
  }
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()

export const numberToString = (
  number: BigNumber | string | null,
  minDecimals: number | null = null,
  maxDecimals: number | null = null
): string => {
  if (number === null) return ''
  if (number === '') return ''
  const n = new BigNumber(number)
  const roundingMode = 1
  let maxI = 1000
  for (let i = 0; i < 60; i++) {
    if (new BigNumber(n.toFixed(i, roundingMode)).eq(n)) {
      maxI = i
      break
    }
  }

  if (n.gte(10000)) return n.toFormat(0, roundingMode)
  if (n.gte(1000))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 1))
      ),
      roundingMode
    )
  if (n.gte(100))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 1))
      ),
      roundingMode
    )
  if (n.gte(1))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 2))
      ),
      roundingMode
    )
  if (n.gte(0.01))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 4))
      ),
      roundingMode
    )
  for (let i = minDecimals || 4; i < 17; i++)
    if (n.gte(Math.pow(10, -i)))
      return n.toFormat(
        Math.min(
          maxI,
          Math.min(maxDecimals || 100, Math.max(minDecimals || 0, i))
        ),
        roundingMode
      )
  if (n.isEqualTo(0)) return '0'

  return n.toFormat(
    Math.min(maxI, Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 8))),
    roundingMode
  )
}

export function getBalanceFromWallet(
  balances: WalletDetail[],
  chain: string,
  symbol: string,
  address: string | null
) {
  if (balances.length === 0) return null

  const selectedChainBalances = balances.filter(
    (balance) => balance.blockChain === chain
  )
  if (selectedChainBalances.length === 0) return null

  return (
    selectedChainBalances
      .map(
        (a) =>
          a.balances?.find(
            (bl) =>
              (address !== null && bl.asset.address === address) ||
              (address === null &&
                bl.asset.address === address &&
                bl.asset.symbol === symbol)
          ) || null
      )
      .filter((b) => b !== null)
      .sort(
        (a, b) =>
          parseFloat(b?.amount.amount || '0') -
          parseFloat(a?.amount.amount || '1')
      )
      .find(() => true) || null
  )
}

export const getSampleDefaultTokens = (meta: MetaResponse) => {
  const { blockchains, tokens } = meta
  const defaultFromChain = 'BSC'
  const defaultFromTokenAddress = '0x55d398326f99059ff775485246999027b3197955' // usdt in bsc
  const defaultToChain = 'BSC'
  const defaultToTokenAddress = null // native
  const fromChain = blockchains.find((b) => b.name === defaultFromChain)
  const toChain = blockchains.find((b) => b.name === defaultToChain)
  const fromToken = tokens.find(
    (t) =>
      t.blockchain === defaultFromChain && t.address === defaultFromTokenAddress
  )
  const toToken = tokens.find(
    (t) =>
      t.blockchain === defaultToChain && t.address === defaultToTokenAddress
  )
  return { fromChain, fromToken, toChain, toToken }
}
