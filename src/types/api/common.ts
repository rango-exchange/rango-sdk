import { Asset } from 'rango-types/lib/api/basic'
export * from 'rango-types/lib/api/basic/common'

export function assetToString(asset: Asset): string {
  if (!!asset.address)
    return `${asset.blockchain}.${asset.symbol}--${asset.address}`
  else return `${asset.blockchain}.${asset.symbol}`
}
