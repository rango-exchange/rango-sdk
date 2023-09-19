import { TransactionType } from 'rango-sdk'
import { ExampleTxType } from '../types'

type ExampleSelectProps = {
  onChange: (txType: ExampleTxType) => void
}

export default function ExampleSelect(props: ExampleSelectProps) {
  return (
    <div className="text-left w-full">
      Select Example:{' '}
      <select
        className="p-1 pr-5 pl-0 text-primary"
        onChange={(e) => {
          props?.onChange(e.target.value as ExampleTxType)
        }}
      >
        <option value={TransactionType.EVM}>{TransactionType.EVM}</option>
        <option value={TransactionType.COSMOS}>{TransactionType.COSMOS}</option>
      </select>
    </div>
  )
}
