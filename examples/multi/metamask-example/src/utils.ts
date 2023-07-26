import { EvmTransaction, RangoClient, Amount, WalletDetail } from 'rango-sdk'
import { TransactionRequest } from '@ethersproject/abstract-provider/src.ts/index'
import BigNumber from 'bignumber.js'
import {
  DefaultSignerFactory,
  GenericSigner,
  TransactionType,
} from 'rango-types'
import { DefaultEvmSigner } from '@rango-dev/signer-evm'

export function prepareEvmTransaction(
  evmTransaction: EvmTransaction,
  isApprove: boolean
): TransactionRequest {
  const manipulatedTx = {
    ...evmTransaction,
    gasPrice:
      !!evmTransaction.gasPrice && !evmTransaction.gasPrice.startsWith('0x')
        ? '0x' + parseInt(evmTransaction.gasPrice).toString(16)
        : null,
  }

  let tx = {}
  if (!!manipulatedTx.from) tx = { ...tx, from: manipulatedTx.from }
  if (isApprove) {
    if (!!manipulatedTx.isApprovalTx)
      tx = { ...tx, isApprovalTx: manipulatedTx.isApprovalTx }
  } else {
    if (!!manipulatedTx.to) tx = { ...tx, to: manipulatedTx.to }
    if (!!manipulatedTx.data) tx = { ...tx, data: manipulatedTx.data }
    if (!!manipulatedTx.value) tx = { ...tx, value: manipulatedTx.value }
    if (!!manipulatedTx.gasLimit)
      tx = { ...tx, gasLimit: manipulatedTx.gasLimit }
    if (!!manipulatedTx.gasPrice)
      tx = { ...tx, gasPrice: manipulatedTx.gasPrice }
  }

  return tx
}

export function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

export async function checkApprovalSync(
  requestId: string,
  txId: string,
  rangoClient: RangoClient
) {
  while (true) {
    const approvalResponse = await rangoClient.checkApproval(requestId, txId)
    if (approvalResponse.isApproved) {
      return true
    }
    await sleep(3000)
  }
}

export const prettyAmount = (amount: Amount) =>
  new BigNumber(amount.amount).shiftedBy(-amount.decimals).toFixed()

export function getBalanceFromWallet(
  balances: WalletDetail[],
  chain: string,
  symbol: string,
  address: string | null
) {
  if (balances.length === 0) return null

  const selectedChainBalances = balances.filter(
    (balance) => balance.blockChain === chain
  )
  if (selectedChainBalances.length === 0) return null

  return (
    selectedChainBalances
      .map(
        (a) =>
          a.balances?.find(
            (bl) =>
              (address !== null && bl.asset.address === address) ||
              (address === null &&
                bl.asset.address === address &&
                bl.asset.symbol === symbol)
          ) || null
      )
      .filter((b) => b !== null)
      .sort(
        (a, b) =>
          parseFloat(b?.amount.amount || '0') -
          parseFloat(a?.amount.amount || '1')
      )
      .find(() => true) || null
  )
}
export const numberToString = (
  number: BigNumber | string | null,
  minDecimals: number | null = null,
  maxDecimals: number | null = null
): string => {
  if (number === null) return ''
  if (number === '') return ''
  const n = new BigNumber(number)
  const roundingMode = 1
  let maxI = 1000
  for (let i = 0; i < 60; i++) {
    if (new BigNumber(n.toFixed(i, roundingMode)).eq(n)) {
      maxI = i
      break
    }
  }

  if (n.gte(10000)) return n.toFormat(0, roundingMode)
  if (n.gte(1000))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 1))
      ),
      roundingMode
    )
  if (n.gte(100))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 1))
      ),
      roundingMode
    )
  if (n.gte(1))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 2))
      ),
      roundingMode
    )
  if (n.gte(0.01))
    return n.toFormat(
      Math.min(
        maxI,
        Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 4))
      ),
      roundingMode
    )
  for (let i = minDecimals || 4; i < 17; i++)
    if (n.gte(Math.pow(10, -i)))
      return n.toFormat(
        Math.min(
          maxI,
          Math.min(maxDecimals || 100, Math.max(minDecimals || 0, i))
        ),
        roundingMode
      )
  if (n.isEqualTo(0)) return '0'

  return n.toFormat(
    Math.min(maxI, Math.min(maxDecimals || 100, Math.max(minDecimals || 0, 8))),
    roundingMode
  )
}

export default function getSigners(
  provider: any
): GenericSigner<EvmTransaction> {
  const signers = new DefaultSignerFactory()
  signers.registerSigner(TransactionType.EVM, new DefaultEvmSigner(provider))
  return signers.getSigner(TransactionType.EVM)
}
