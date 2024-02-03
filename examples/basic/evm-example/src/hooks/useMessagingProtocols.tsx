/* eslint-disable @typescript-eslint/no-empty-function */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useRangoClient } from './useRangoClient'

export type MessagingProtocolsType = {
  protocols: string[]
  selectedProtocols: string[]
  loadingProtocols: boolean
  handleSelectedProtocolsChange: (protocol: string) => void
}

export const MessagingProtocolsContext = createContext<MessagingProtocolsType>({
  protocols: [],
  selectedProtocols: [],
  loadingProtocols: true,
  handleSelectedProtocolsChange: () => {},
})

export const MessagingProtocolsContextProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [protocols, setProtocols] = useState<string[]>([])
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([])
  const [loadingProtocols, setLoadingProtocols] = useState<boolean>(true)

  const { sdk } = useRangoClient()

  useEffect(() => {
    sdk.messagingProtocols().then(({ protocols }) => {
      const protocolsList = protocols.map((p) => p.id)
      setProtocols(protocolsList)
      setLoadingProtocols(false)
    })
  }, [sdk])

  const handleSelectedProtocolsChange = useCallback(
    (protocol: string) => {
      if (selectedProtocols.includes(protocol)) {
        setSelectedProtocols((selectedProtocols) =>
          selectedProtocols.filter((p) => p !== protocol)
        )
      } else {
        setSelectedProtocols((selectedProtocols) => [
          ...selectedProtocols,
          protocol,
        ])
      }
    },
    [selectedProtocols, setSelectedProtocols]
  )

  return (
    <MessagingProtocolsContext.Provider
      value={{
        protocols,
        loadingProtocols,
        selectedProtocols,
        handleSelectedProtocolsChange,
      }}
    >
      {children}
    </MessagingProtocolsContext.Provider>
  )
}

export function useMessagingProtocols() {
  const {
    protocols,
    loadingProtocols,
    selectedProtocols,
    handleSelectedProtocolsChange,
  } = useContext(MessagingProtocolsContext)

  return {
    protocols,
    loadingProtocols,
    selectedProtocols,
    handleSelectedProtocolsChange,
  }
}
