import { Token } from 'rango-sdk'

type TokenContainerProps = {
  variant: 'from' | 'to'
  loading: boolean
  outputLoading?: boolean
  token?: Token
  amount: string
  onChangeAmount?: (amount: string) => void
}

export default function TokenContainer(props: TokenContainerProps) {
  return (
    <div className="w-64 min-h-[256px] bg-secondary rounded-xl border-white border-2 ">
      <div className="bg-white w-full border-solid border-white rounded-t-md text-primary text-center py-1 capitalize">
        {props.variant} Token
      </div>
      <div className="py-7">
        <div className="h-12">
          {props.loading && <div className="loading" />}
          {!props.loading && (
            <img
              src={props.token?.image}
              alt={props.token?.symbol}
              className="w-12 h-12 m-auto"
            />
          )}
        </div>
        <div className="font-medium pt-4 pb-0">
          {props.token?.symbol ?? '?'}
        </div>
        <div className="font-medium pb-4 text-[#b9b9b9]">
          on {props.token?.blockchain ?? '?'}
        </div>
        <div className="h-12">
          {props.variant === 'from' ? 'Input:' : 'Output:'}&nbsp;
          {props.outputLoading && <div className="loading output-loading" />}
          {!props.outputLoading && (
            <input
              type="number"
              className={`w-28 text-lg ${
                props.variant === 'to'
                  ? 'text-success border-none bg-transparent text-center text-xl'
                  : 'text-primary pl-2'
              }`}
              disabled={props.variant === 'to'}
              value={props.amount}
              onChange={(e) => {
                props.onChangeAmount?.(e.target.value)
              }}
              min="0.01"
              step="0.01"
            />
          )}
        </div>
      </div>
    </div>
  )
}
