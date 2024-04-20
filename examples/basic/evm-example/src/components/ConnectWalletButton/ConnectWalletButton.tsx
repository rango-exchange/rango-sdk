import React, { memo } from 'react'
import { Button } from '@rango-dev/ui'
import { WalletTypes } from '@rango-dev/wallets-shared'
import { useWallets } from '@rango-dev/wallets-react'

const ConnectWalletButton = ({
  title,
  type,
  setError,
}: {
  title: string
  type: WalletTypes
  setError: (error: string) => void
}) => {
  const { connect, state, disconnect } = useWallets()

  const walletState = state(type)

  const handleClick = () => {
    if (!walletState.connected) {
      connect(type).catch((error) => {
        console.log(error)

        setError(
          `Error connecting to ${title}. Please check ${title} and try again.`
        )
      })
    } else {
      disconnect(type)
    }
  }

  return (
    <Button
      variant="outlined"
      size="small"
      type="primary"
      onClick={handleClick}
      loading={walletState.connecting}
      suffix={
        <>
          {walletState.connecting
            ? null
            : walletState.connected
            ? 'Connected'
            : walletState.installed
            ? 'Disconnected'
            : 'Not Installed'}
        </>
      }
    >
      {title}
    </Button>
  )
}

export default memo(ConnectWalletButton)
