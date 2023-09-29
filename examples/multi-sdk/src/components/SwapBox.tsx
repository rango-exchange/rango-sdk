import { Token } from 'rango-sdk'
import TokenContainer from './TokenContainer'

type SwapBoxProps = {
  loadingMeta: boolean
  outputLoading: boolean
  fromToken: Token | undefined
  toToken: Token | undefined
  fromInputAmount: string
  setFromInputAmount: (amount: string) => void
  outputAmount: string | undefined
}

export default function SwapBox({
  loadingMeta,
  outputLoading,
  fromToken,
  toToken,
  fromInputAmount,
  setFromInputAmount,
  outputAmount,
}: SwapBoxProps) {
  return (
    <div className="flex my-6 mx-auto font-medium">
      <TokenContainer
        variant="from"
        loading={loadingMeta}
        token={fromToken}
        amount={fromInputAmount}
        onChangeAmount={setFromInputAmount}
      />
      <div className="arrow">&#8594;</div>
      <TokenContainer
        variant="to"
        loading={loadingMeta}
        outputLoading={outputLoading}
        token={toToken}
        amount={outputAmount || ''}
      />
    </div>
  )
}
