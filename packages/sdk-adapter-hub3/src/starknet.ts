import type { Provider } from '@hub3js/core'
import type { StarknetActions } from '@hub3js/starknet'
import type { StarknetWallet } from '@rango-dev/sdk'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './utils.js'

export function hub3StarknetAdapter(
  provider: Provider<{ starknet: StarknetActions }>,
): StarknetWallet {
  return buildSingleChainWallet(provider, {
    key: 'starknet',
    type: TransactionType.STARKNET,
  })
}
