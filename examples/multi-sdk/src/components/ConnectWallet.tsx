import { ExampleWallet } from '../types'

type ConnectWalletProps = {
  wallet: ExampleWallet
  onConnect: (address: string) => void
}

async function connectMetamask() {
  return (
    await (window as any).ethereum.request({
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
      onClick={async () => onConnect(await connect(wallet))}
      className="bg-button text-white w-full text-sm border-white border-2 border-t-0 rounded-b-xl px-2 py-1"
    >
      Connect {wallet}
    </button>
  )
}
