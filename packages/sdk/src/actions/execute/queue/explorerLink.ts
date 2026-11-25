import type { CheckResult } from './types.js'
import type { BlockchainMeta } from 'rango-sdk'

// Its quirks are kept on purpose.
function buildExplorerTxUrl(
  blockchainMeta: BlockchainMeta,
  hash: string,
): string | null {
  const txUrlTemplate = blockchainMeta.info?.transactionUrl
  if (!txUrlTemplate) {
    return null
  }
  if (txUrlTemplate.includes('/{txHash}')) {
    return txUrlTemplate.replace('{txHash}', hash)
  }
  return `${txUrlTemplate}/${hash}`
}

// Seeded by the write that first stores `hash`.
export function buildCheckResultWithExplorerLink(
  blockchainMeta: BlockchainMeta,
  hash: string,
  description: 'Approve' | 'Swap',
): CheckResult | null {
  const explorerTxUrl = buildExplorerTxUrl(blockchainMeta, hash)
  return explorerTxUrl === null
    ? null
    : {
        outputAmount: null,
        explorerUrl: [{ url: explorerTxUrl, description }],
        diagnosisUrl: null,
      }
}

// After `wait` replaced the hash.
export function replaceLastExplorerLinkWithReplacedHash(
  storedCheckResult: CheckResult,
  blockchainMeta: BlockchainMeta,
  hash: string,
): CheckResult {
  const explorerTxUrl = buildExplorerTxUrl(blockchainMeta, hash)
  return explorerTxUrl === null
    ? storedCheckResult
    : {
        ...storedCheckResult,
        explorerUrl: [
          ...storedCheckResult.explorerUrl.slice(0, -1),
          { url: explorerTxUrl, description: 'Replaced Swap' },
        ],
      }
}
