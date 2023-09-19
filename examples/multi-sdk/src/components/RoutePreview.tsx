import { BestRouteResponse, SwapResultAsset } from 'rango-sdk'

type RoutePreviewProps = {
  route: BestRouteResponse | null
  loading: boolean
}

function RouteItem(props: { token: SwapResultAsset; amount: string }) {
  return (
    <span className="mx-2 inline-block w-16 text-xs justify-center">
      <img
        src={props.token.logo}
        alt={props.token.symbol}
        className="rounded-full w-8 h-8 mx-auto mb-2"
        width={100}
      />
      <div>{props.token.symbol}</div>
      <div>{props.amount}</div>
    </span>
  )
}

export default function RoutePreview(props: RoutePreviewProps) {
  const { route, loading } = props
  const result = route?.result
  const swaps = result?.swaps
  return (
    <div className="border-2 bg-secondary w-full rounded-t-lg mt-6 pb-8">
      <div className="bg-white w-full border-solid border-white rounded-t-md text-primary text-center py-1 capitalize">
        Route Preview
      </div>
      <div className="flex flex-row pt-4 justify-center h-20 px-4">
        {loading && <div className="loading pt-4" />}
        {swaps && (
          <>
            <div key={0}>
              <RouteItem
                amount={route?.requestAmount ?? ''}
                token={swaps[0].from}
              />
            </div>
            {swaps.map((swap, i) => (
              <div key={i}>
                <div>
                  <div className="inline-block w-7">
                    <span className="text-2xl -top-6 relative">&#8594;</span>
                  </div>
                  <RouteItem
                    token={swap.to}
                    amount={swap.toAmount.substring(0, 6)}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
