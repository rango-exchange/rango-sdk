import type { Provider } from '@hub3js/core'
import type { TonActions } from '@hub3js/tvm'
import type { TonWallet } from '@rango-dev/sdk'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './utils.js'

export function hub3TonAdapter(
  provider: Provider<{ ton: TonActions }>,
): TonWallet {
  return buildSingleChainWallet(provider, {
    key: 'ton',
    type: TransactionType.TON,
  })
}
