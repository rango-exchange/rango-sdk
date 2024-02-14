import { WalletState, WalletTypes } from '@rango-dev/wallets-shared'
import { MetaResponse, RangoClient, TransactionType } from 'rango-sdk-basic'

export const getWalletByChainType: (chainType: string) => WalletTypes = (
  chainType
) => {
  if (chainType === TransactionType.EVM) {
    return WalletTypes.META_MASK
  } else if (chainType === TransactionType.SOLANA) {
    return WalletTypes.PHANTOM
  } else {
    return WalletTypes.KEPLR
  }
}

export const getEVMAddress = (metamaskWalletState: WalletState) => {
  return metamaskWalletState.accounts?.[0]?.split(':')?.[1]
}

export const getSolanaAddress = (phantomWalletState: WalletState) => {
  return phantomWalletState.accounts?.[0]?.split(':')?.[1]
}

export const getCosmosAddressByChain = (
  chainName: string,
  keplrWalletState: WalletState
) => {
  if (!chainName) return null

  return keplrWalletState.accounts
    ?.find((account) => account.split(':')?.[0] === chainName)
    ?.split(':')?.[1]
}

export const getEvmBalances = async (
  meta: MetaResponse,
  sdk: RangoClient,
  metamaskWalletState: WalletState
) => {
  const promises =
    meta?.blockchains
      .filter((chain) => chain.type === TransactionType.EVM)
      .map((chain) =>
        sdk.balance({
          address: getEVMAddress(metamaskWalletState) || '',
          blockchain: chain.name,
        })
      ) || []

  const evmBalances = (await Promise.allSettled(promises)).flatMap((p) =>
    p.status === 'fulfilled' ? p.value.wallets : []
  )

  return evmBalances
}

export const getSolanaBalances = async (
  meta: MetaResponse,
  sdk: RangoClient,
  phantomWalletState: WalletState
) => {
  const promises =
    meta?.blockchains
      .filter((chain) => chain.type === TransactionType.SOLANA)
      .map((chain) =>
        sdk.balance({
          address: getSolanaAddress(phantomWalletState) || '',
          blockchain: chain.name,
        })
      ) || []

  const solanaBalances = (await Promise.allSettled(promises)).flatMap((p) =>
    p.status === 'fulfilled' ? p.value.wallets : []
  )

  return solanaBalances
}

export const getCosmosBalances = async (
  meta: MetaResponse,
  sdk: RangoClient,
  keplrWalletState: WalletState
) => {
  const promises =
    keplrWalletState.accounts?.map((account) =>
      sdk.balance({
        address: account?.split(':')?.[1] || '',
        blockchain: account?.split(':')?.[0] || '',
      })
    ) || []

  const cosmosBalances = (await Promise.allSettled(promises)).flatMap((p) =>
    p.status === 'fulfilled' ? p.value.wallets : []
  )

  return cosmosBalances
}
