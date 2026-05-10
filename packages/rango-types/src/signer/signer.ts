import { Transaction, TransactionType } from '../api/main/index.js'

export interface GenericSigner<Tx extends Transaction> {
  /*
   * Sign a message with the private key of the given address.
   * @param msg The message to sign.
   * @param address The address of the account to sign with.
   * @param chainId The chainId of the network to sign with.
   * @returns The signed message.
   */
  signMessage(
    msg: string,
    address: string,
    chainId: string | null
  ): Promise<string>

  /*
   * Sign and send a transaction with the private key of the given address.
   * @param tx The transaction to sign.
   * @param address The address of the account to sign with.
   * @param chainId The chainId of the network to sign with.
   * @returns The signed transaction hash.
   */
  signAndSendTx(
    tx: Tx,
    address: string,
    chainId: string | null
  ): Promise<{ hash: string; response?: any }>

  /*
   * Signs the typed data value with types data structure for domain using the EIP-712 specification. This method is specific to EVM namespace. https://docs.ethers.org/v6/api/providers/#Signer-signTypedData
   * @param typedData The TypedData to sign.
   * @param address The address of the account to sign with.
   * @param chainId The chainId of the network to sign with.
   * @returns The signed message.
   */
  signTypedData?(
    typedData: any,
    address: string,
    chainId: string | null
  ): Promise<string>

  /*
   * Wait for the transaction receipt using txHash and txResponse
   * @param txHash signed transaction hash
   * @param chainId for the transaction
   * @param confirmations number of block confirmation desired before returning response
   * @returns The signed transaction hash or the replaced one and transaction response
   */
  wait?(
    txHash: string,
    chainId?: string,
    txResponse?: any,
    confirmations?: number
  ): Promise<{ hash: string; response?: any }>
}

export interface SignerFactory {
  registerSigner<Tx extends Transaction>(
    txType: TransactionType,
    signer: GenericSigner<Tx>
  ): void
  getSigner<Tx extends Transaction>(txType: TransactionType): GenericSigner<Tx>
}

export class DefaultSignerFactory implements SignerFactory {
  private signers: { [key in TransactionType]?: GenericSigner<Transaction> } =
    {}

  constructor() {
    this.signers = {}
  }

  registerSigner<Tx extends Transaction>(
    txType: TransactionType,
    signer: GenericSigner<Tx>
  ): void {
    this.signers[txType] = signer
  }

  getSigner<Tx extends Transaction>(
    txType: TransactionType
  ): GenericSigner<Tx> {
    if (this.signers && txType in this.signers) {
      const signer = this.signers[txType]
      if (!!signer) return signer
    }
    throw new Error('Signer not found for ' + txType)
  }
}
