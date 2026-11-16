import type { Provider } from '@hub3js/core'
import type { SolanaActions } from '@hub3js/solana'
import type { SolanaWallet } from '@rango-dev/sdk'

import { TransactionType } from 'rango-types'

import { buildSingleChainWallet } from './utils.js'

export function hub3SolanaAdapter(
  provider: Provider<{ solana: SolanaActions }>,
): SolanaWallet {
  return buildSingleChainWallet(provider, {
    key: 'solana',
    type: TransactionType.SOLANA,
  })
}
