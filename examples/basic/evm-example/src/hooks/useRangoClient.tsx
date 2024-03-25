/* eslint-disable @typescript-eslint/no-empty-function */
import React, { createContext, useContext, useMemo, useState } from 'react'
import { DEFAULT_BASE_URL, DEFAULT_RANGO_API_KEY } from '../constatnts'
import { RangoClient } from 'rango-sdk-basic'

export type RangoClientType = {
  sdk: RangoClient
  baseUrl: string
  handleBaseUrlChange: (baseUrl: string) => void
  rangoApiKey: string
  handleRangoApiKeyChange: (rangoApiKey: string) => void
  enableCentralizedSwappers: boolean
  toggleEnableCentralizedSwappers: () => void
}

export const RangoClientContext = createContext<RangoClientType>({
  sdk: new RangoClient(DEFAULT_RANGO_API_KEY, undefined, DEFAULT_BASE_URL),
  baseUrl: DEFAULT_BASE_URL,
  handleBaseUrlChange: () => {},
  rangoApiKey: DEFAULT_RANGO_API_KEY,
  handleRangoApiKeyChange: () => {},
  enableCentralizedSwappers: false,
  toggleEnableCentralizedSwappers: () => {},
})

export const RangoClientContextProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [baseUrl, setBaseUrl] = useState<string>(DEFAULT_BASE_URL)
  const [rangoApiKey, setRangoApiKey] = useState<string>(DEFAULT_RANGO_API_KEY)

  const [enableCentralizedSwappers, setEnableCentralizedSwappers] =
    useState<boolean>(false)

  const rangoClient = useMemo(
    () => new RangoClient(rangoApiKey, undefined, baseUrl),
    [baseUrl, rangoApiKey]
  )

  return (
    <RangoClientContext.Provider
      value={{
        sdk: rangoClient,
        baseUrl,
        handleBaseUrlChange: (baseUrl) => setBaseUrl(baseUrl),
        rangoApiKey,
        handleRangoApiKeyChange: (rangoApiKey) => setRangoApiKey(rangoApiKey),
        enableCentralizedSwappers,
        toggleEnableCentralizedSwappers: () =>
          setEnableCentralizedSwappers((prev) => !prev),
      }}
    >
      {children}
    </RangoClientContext.Provider>
  )
}

export function useRangoClient() {
  const {
    sdk,
    baseUrl,
    handleBaseUrlChange,
    rangoApiKey,
    handleRangoApiKeyChange,
    enableCentralizedSwappers,
    toggleEnableCentralizedSwappers,
  } = useContext(RangoClientContext)

  return {
    sdk,
    baseUrl,
    handleBaseUrlChange,
    rangoApiKey,
    handleRangoApiKeyChange,
    enableCentralizedSwappers,
    toggleEnableCentralizedSwappers,
  }
}
