import { Token, TransactionType } from 'rango-sdk'
import { ExampleTxType } from './types'

const sampleTokens = {
  [TransactionType.EVM]: { from: 'BSC.BNB', to: 'AVAX_CCHAIN.AVAX' },
  [TransactionType.COSMOS]: {
    from: 'COSMOS.ATOM',
    to: 'OSMOSIS.AKT--ibc/1480b8fd20ad5fcae81ea87584d269547dd4d436843c1d20f15e00eb64743ef4',
  },
}

export const chooseSampleToken = (
  tokens: Token[],
  txType: ExampleTxType,
  variant: 'from' | 'to'
) => {
  const [tokenBlockchainStr, tokenStr] =
    sampleTokens[txType][variant].split('.')
  const tokenSymbol = tokenStr.split('--')?.[0]
  const tokenAddress = tokenStr.split('--')?.[1] || null
  const token = tokens.find(
    (t) =>
      t.blockchain === tokenBlockchainStr &&
      t.symbol === tokenSymbol &&
      t.address === tokenAddress
  )
  return token
}
