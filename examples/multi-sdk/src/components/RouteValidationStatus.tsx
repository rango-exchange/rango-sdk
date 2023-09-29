import { BestRouteResponse } from 'rango-sdk'
import { numberToString, numberToBN } from '../helpers/numbers'

type RouteValidationStatusProps = {
  route: BestRouteResponse | null
}

export default function RouteValidationStatus(
  props: RouteValidationStatusProps
) {
  const routeBalanceChecks = props.route?.validationStatus?.flatMap((status) =>
    status.wallets.flatMap((wallet) =>
      wallet.requiredAssets.flatMap((assetWithBalance) => ({
        blockchain: assetWithBalance.asset.blockchain,
        symbol: assetWithBalance.asset.symbol,
        required: numberToString(
          numberToBN(
            assetWithBalance.requiredAmount.amount,
            assetWithBalance.requiredAmount.decimals
          ),
          5
        ),
        current: numberToString(
          numberToBN(
            assetWithBalance.currentAmount.amount,
            assetWithBalance.currentAmount.decimals
          ),
          5
        ),
      }))
    )
  )

  return (
    <>
      {props.route?.validationStatus && (
        <div className="py-3 bg-white text-primary text-sm">
          <div>Validation Status:</div>
          <ul>
            {routeBalanceChecks?.map((balance, i) => (
              <li
                className={
                  balance.required > balance.current
                    ? 'text-red-500'
                    : 'text-green-500'
                }
                key={i}
              >
                -{' '}
                {`${balance.blockchain}.${balance.symbol} required: ${balance.required}, current: ${balance.current}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
