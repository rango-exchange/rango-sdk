import React, { createContext, useContext, useEffect, useState } from 'react'
import { useRangoClient } from './useRangoClient'
import { MetaResponse } from 'rango-sdk-basic'

export type MetaType = {
  meta: MetaResponse | null
  metaLoading: boolean
}

export const MetaContext = createContext<MetaType>({
  meta: null,
  metaLoading: true,
})

export const MetaContextProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [metaLoading, setMetaLoading] = useState<boolean>(true)

  const { sdk, enableCentralizedSwappers } = useRangoClient()

  useEffect(() => {
    if (sdk) {
      sdk
        .meta(
          enableCentralizedSwappers ? { enableCentralizedSwappers } : undefined
        )
        .then((meta) => {
          setMeta(meta)
          setMetaLoading(false)
        })
    }
  }, [sdk, enableCentralizedSwappers])

  return (
    <MetaContext.Provider
      value={{
        meta,
        metaLoading,
      }}
    >
      {children}
    </MetaContext.Provider>
  )
}

export function useMeta() {
  const { meta, metaLoading } = useContext(MetaContext)

  return {
    meta,
    metaLoading,
  }
}
