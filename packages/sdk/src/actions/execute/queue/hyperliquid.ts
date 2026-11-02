import type {
  HyperliquidTransaction,
  RequiredWallet,
  SdkActions,
} from './types.js'
import type { HyperliquidWallet } from '../mod.js'

import { loadBlockchainMetaOf } from './blockchain-meta.js'
import {
  HEX,
  HYPERLIQUID_EXCHANGE_URL,
  HYPERLIQUID_EXPLORER_URL,
  POLL_INTERVAL_MS,
  SUPPORTED_HYPERLIQUID_ACTION_TYPES,
} from './constants.js'
import { ErrorToReport } from './execution-failure.js'
import { buildCheckResultWithExplorerLink } from './explorer-link.js'
import { getRequiredWallet } from './required-wallet.js'
import { signEntryAndStoreSignedHash } from './sign.js'
import { sleep } from './utils.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// As ethers takes EIP-712 typed data: the types of its primary type only, and its message as the value.
function parseHyperliquidTypedData(message: string): {
  domain: unknown
  types: Record<string, unknown>
  value: unknown
} {
  let parsedTypedData: unknown
  try {
    parsedTypedData = JSON.parse(message)
  } catch {
    parsedTypedData = null
  }
  if (
    !isRecord(parsedTypedData) ||
    !isRecord(parsedTypedData.types) ||
    typeof parsedTypedData.primaryType !== 'string'
  ) {
    throw new ErrorToReport(
      'CLIENT_UNEXPECTED_BEHAVIOUR',
      'Unexpected Error: Hyperliquid message is not typed data.',
    )
  }
  const { primaryType } = parsedTypedData
  return {
    domain: parsedTypedData.domain,
    types: { [primaryType]: parsedTypedData.types[primaryType] },
    value: parsedTypedData.message,
  }
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const httpResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responseBody: unknown = await httpResponse.json()
  return responseBody
}

// Where a `0x` signature's `r`, `s` and `v` end, and what a `v` of 0 or 1 is offset by.
const SIGNATURE_R_END = 66
const SIGNATURE_S_END = 130
const SIGNATURE_V_END = 132
const SIGNATURE_V_LEGACY_OFFSET = 27

function splitSignature(signature: string): {
  r: string
  s: string
  v: number
} {
  const v = parseInt(signature.slice(SIGNATURE_S_END, SIGNATURE_V_END), HEX)
  return {
    r: `0x${signature.slice(2, SIGNATURE_R_END)}`,
    s: `0x${signature.slice(SIGNATURE_R_END, SIGNATURE_S_END)}`,
    v: v < 2 ? v + SIGNATURE_V_LEGACY_OFFSET : v,
  }
}

/*
 * The sign for a Hyperliquid entry. Its hash isn't known until the explorer lists it, so it resolves with a `null`
 * `walletResult`.
 */
async function signAndPostHyperliquidAction(
  hyperliquid: HyperliquidWallet,
  tx: HyperliquidTransaction,
): Promise<{ walletResult: null } | null> {
  const signature = await hyperliquid.signTypedData({
    typedData: parseHyperliquidTypedData(tx.message),
    chainId: tx.action.signatureChainId,
  })
  const exchangeResponse = await postJson(HYPERLIQUID_EXCHANGE_URL, {
    action: tx.action,
    signature: splitSignature(signature),
    nonce: tx.nonce,
  }).catch(() => null)
  if (!isRecord(exchangeResponse) || exchangeResponse.status !== 'ok') {
    throw new ErrorToReport(
      'CLIENT_UNEXPECTED_BEHAVIOUR',
      'Unexpected Error: Failed to initiate withdrawal.',
    )
  }
  return { walletResult: null }
}

function findHashOfActionByNonce(
  explorerResponse: unknown,
  nonce: number,
): string | null {
  const explorerTxs: unknown = isRecord(explorerResponse)
    ? explorerResponse.txs
    : null
  if (!Array.isArray(explorerTxs)) {
    return null
  }
  const matchingTx: unknown = explorerTxs.find(
    (explorerTx: unknown) =>
      isRecord(explorerTx) &&
      isRecord(explorerTx.action) &&
      typeof explorerTx.action.type === 'string' &&
      SUPPORTED_HYPERLIQUID_ACTION_TYPES.has(explorerTx.action.type) &&
      explorerTx.action.time === nonce,
  )
  return isRecord(matchingTx) && typeof matchingTx.hash === 'string'
    ? matchingTx.hash
    : null
}

/*
 * The entry's first Blockchain list read is here, so a failed load fails the swap though the action is posted. It
 * answers the hash once stored.
 */
export async function waitForHyperliquidHashAndStoreIt(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  transactionId: string,
  requiredWallet: RequiredWallet,
  nonce: number,
): Promise<string | null> {
  while (true) {
    const explorerResponse = await postJson(HYPERLIQUID_EXPLORER_URL, {
      type: 'userDetails',
      user: requiredWallet.address,
    }).catch(() => null)
    const hyperliquidHash = findHashOfActionByNonce(explorerResponse, nonce)
    if (hyperliquidHash !== null) {
      const blockchainMeta = await loadBlockchainMetaOf(
        actions,
        requiredWallet.blockchain,
      )
      const storage = actions.getStorage()
      const { result } = storage.transactions[transactionId].execution
      result.walletResult = { hash: hyperliquidHash }
      result.checkResult =
        buildCheckResultWithExplorerLink(
          blockchainMeta,
          hyperliquidHash,
          'Swap',
        ) ?? result.checkResult
      actions.setStorage(storage)
      return hyperliquidHash
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

/*
 * Stored `signed` right after the post, so a resume during the lookup isn't read as expired. The hash it found.
 */
export async function signPostAndLookUpHyperliquidHash(
  actions: SdkActions<'SDK_EXECUTE_TRANSACTION'>,
  hyperliquid: HyperliquidWallet,
  tx: HyperliquidTransaction,
): Promise<{ walletResult: { hash: string } } | null> {
  const { transactionId } = actions.payload
  const postResult = await signEntryAndStoreSignedHash(
    actions,
    transactionId,
    async () => signAndPostHyperliquidAction(hyperliquid, tx),
  )
  if (postResult === null) {
    return null
  }
  const hyperliquidHash = await waitForHyperliquidHashAndStoreIt(
    actions,
    transactionId,
    getRequiredWallet(actions.getStorage(), tx),
    tx.nonce,
  )
  return hyperliquidHash === null
    ? null
    : { walletResult: { hash: hyperliquidHash } }
}
