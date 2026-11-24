import type { Provider } from '@hub3js/core'
import type { SuiActions } from '@hub3js/sui'
import type { SuiWallet } from '@rango-dev/sdk'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './utils.js'

export function hub3SuiAdapter(
  provider: Provider<{ sui: SuiActions }>,
): SuiWallet {
  return buildSingleChainWallet(provider, {
    key: 'sui',
    type: TransactionType.SUI,
  })
}
