import { Token } from 'rango-sdk-basic'

export function findToken(
  tokens: Token[],
  blockchain: string,
  address: string | null
): Token {
  const token = tokens.find(
    (token) => token.blockchain === blockchain && token.address == address
  )
  if (!token) {
    throw new Error(
      `There was no token with blockchain=${blockchain} & address=${address}`
    )
  }
  return token
}
