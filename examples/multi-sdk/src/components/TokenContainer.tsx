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
    <div className={props.variant}>
      <div className="header">{props.variant} Token</div>
      <div className="body">
        <div className="img-container">
          {props.loading && <div className="loading" />}
          {!props.loading && (
            <img src={props.token?.image} alt={props.token?.symbol} />
          )}
        </div>
        <div className="symbol">{props.token?.symbol ?? '?'}</div>
        <div className="blockchain">on {props.token?.blockchain ?? '?'}</div>
        <div className="amount">
          {props.variant === 'from' ? 'Input:' : 'Output:'}&nbsp;
          {props.outputLoading && <div className="loading output-loading" />}
          {!props.outputLoading && (
            <input
              type="number"
              className={`${props.variant}-amount`}
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
