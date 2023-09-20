import { ExampleWallet } from '../types'

type ConnectWalletProps = {
  wallet: ExampleWallet
  onConnect: (address?: string, error?: string) => void
}

async function connectMetamask() {
  if (!window.ethereum) {
    throw new Error('Metamask is not installed')
  }
  return (
    await window.ethereum.request({
      method: 'eth_requestAccounts',
    })
  )?.[0]
}

async function connect(wallet: ExampleWallet) {
  const connectFuncMap = {
    [ExampleWallet.Metamask]: connectMetamask,
    [ExampleWallet.Keplr]: connectMetamask,
  }
  return await connectFuncMap[wallet]()
}

export default function ConnectWallet({
  wallet,
  onConnect,
}: ConnectWalletProps) {
  return (
    <button
      onClick={async () => {
        try {
          const address = await connect(wallet)
          if (!address) onConnect(undefined, 'Connect failed')
          else onConnect(address)
        } catch (error) {
          onConnect(
            undefined,
            (error as Error)?.message ||
              JSON.stringify(error) ||
              'Connect failed'
          )
          return
        }
      }}
      className="bg-button text-white w-full text-sm border-white border-2 border-t-0 rounded-b-xl px-2 py-1"
    >
      Connect {wallet}
    </button>
  )
}
