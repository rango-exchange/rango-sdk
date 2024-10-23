import { RequestedAsset } from 'rango-types/lib/api/basic'
export * from 'rango-types/lib/api/basic/common'

export function assetToString(asset: RequestedAsset): string {
  return `${asset.blockchain}${asset.symbol ? '.' + asset.symbol : ''}${
    asset.address ? '--' + asset.address : ''
  }`
}
