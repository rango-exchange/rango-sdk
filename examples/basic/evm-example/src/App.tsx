import React, { useEffect, useState } from 'react'
import { BlockchainMeta, TransactionType } from 'rango-sdk-basic'
import { Provider as WalletsProvider } from '@rango-dev/wallets-react'
import * as metamask from '@rango-dev/provider-metamask'
import * as keplr from '@rango-dev/provider-keplr'
import * as phantom from '@rango-dev/provider-phantom'
import BaseURLInput from './components/BaseURLInput'
import { Button, Spacer, Switch } from '@rango-dev/ui'
import APIKeyInput from './components/APIKeyInput'
import {
  MessagingProtocolsContextProvider,
  useMessagingProtocols,
} from './hooks/useMessagingProtocols'
import { MetaContextProvider, useMeta } from './hooks/useMeta'
import MessagingProtocolsModal from './components/MessagingProtocolsModal'
import LiquiditySourcesModal from './components/LiquiditySourcesModal'
import ConnectWalletButton from './components/ConnectWalletButton'
import { WalletTypes } from '@rango-dev/wallets-shared'
import SwapContent from './components/SwapContent'

export const App = () => {
  const { meta, metaLoading } = useMeta()
  const { loadingProtocols } = useMessagingProtocols()

  const [allBlockChains, setAllBlockChains] = useState<BlockchainMeta[]>([])
  const [disabledLiquiditySources, setDisabledLiquiditySources] = useState<
    string[]
  >([])
  const [testMessagePassing, setTestMessagePassing] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  const [messagingProtocolsModalOpen, setMessagingProtocolsModalOpen] =
    useState(false)
  const [liquiditySourcesModalOpen, setLiquiditySourcesModalOpen] =
    useState(false)

  useEffect(() => {
    if (meta) {
      setAllBlockChains(
        meta.blockchains?.filter(
          (chain) =>
            chain.type === TransactionType.EVM ||
            chain.type === TransactionType.COSMOS ||
            chain.type === TransactionType.SOLANA
        )
      )
    }
  }, [meta])

  return (
    <WalletsProvider
      providers={[metamask, keplr, phantom]}
      allBlockChains={allBlockChains}
    >
      <MetaContextProvider>
        <MessagingProtocolsContextProvider>
          <main className="container">
            <div className="main-content">
              <BaseURLInput />
              <Spacer size={16} direction="vertical" />
              <APIKeyInput />
              <Spacer size={16} direction="vertical" />
              <div className="row">
                <Button
                  loading={metaLoading}
                  variant="outlined"
                  type="primary"
                  size="small"
                  onClick={() => setLiquiditySourcesModalOpen(true)}
                >
                  Liquidity Sources
                </Button>
                <Spacer />
                <Button
                  size="small"
                  onClick={() => setMessagingProtocolsModalOpen(true)}
                  variant="outlined"
                  type="primary"
                  loading={loadingProtocols}
                >
                  Messaging Protocols
                </Button>
              </div>
              <Spacer size={16} direction="vertical" />
              <div className="row">
                <Button
                  variant="outlined"
                  size="small"
                  type="primary"
                  suffix={<Switch checked={testMessagePassing} />}
                  onClick={() => setTestMessagePassing((prev) => !prev)}
                >
                  Test Message Passing
                </Button>
              </div>
              <Spacer size={16} direction="vertical" />
              <div>
                <ConnectWalletButton
                  title="Metamask"
                  type={WalletTypes.META_MASK}
                  setError={setError}
                />
                <Spacer direction="vertical" />
                <ConnectWalletButton
                  title="Keplr"
                  type={WalletTypes.KEPLR}
                  setError={setError}
                />
                <Spacer direction="vertical" />
                <ConnectWalletButton
                  title="Phantom"
                  type={WalletTypes.PHANTOM}
                  setError={setError}
                />
              </div>
              <Spacer size={16} direction="vertical" />
              <SwapContent
                disabledLiquiditySources={disabledLiquiditySources}
                testMessagePassing={testMessagePassing}
                error={error}
                setError={setError}
              />
            </div>
            <MessagingProtocolsModal
              open={messagingProtocolsModalOpen}
              handleClose={() => setMessagingProtocolsModalOpen(false)}
            />
            <LiquiditySourcesModal
              open={liquiditySourcesModalOpen}
              handleClose={() => setLiquiditySourcesModalOpen(false)}
              disabledLiquiditySources={disabledLiquiditySources}
              setDisabledLiquiditySources={setDisabledLiquiditySources}
            />
          </main>
        </MessagingProtocolsContextProvider>
      </MetaContextProvider>
    </WalletsProvider>
  )
}

export default App
