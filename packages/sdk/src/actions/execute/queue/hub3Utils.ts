// Replicas of helpers from hub3 (@hub3js/*). Keep in sync with the source; replace with the package import once the SDK depends on hub3.
const EVM_WORD_LENGTH = 64
/** First 4 bytes of keccak256("approve(address,uint256)") */
const ERC20_APPROVE_SELECTOR = '0x095ea7b3'

function padAddressToEvmWord(address: string): string {
  return address.toLowerCase().replace(/^0x/, '').padStart(EVM_WORD_LENGTH, '0')
}

const HEX_RADIX = 16

function padUintToEvmWord(value: string): string {
  return BigInt(value).toString(HEX_RADIX).padStart(EVM_WORD_LENGTH, '0')
}

export function encodeApproveCallData(
  spender: string,
  amount: string,
): `0x${string}` {
  return `${ERC20_APPROVE_SELECTOR}${padAddressToEvmWord(
    spender,
  )}${padUintToEvmWord(amount)}`
}
