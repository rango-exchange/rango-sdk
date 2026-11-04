// CAIP-10 account ids, such as `eip155:1:0xabc`: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
const SEPARATOR = ':'

export function getCaip10Address(accountId: string): string {
  const { referenceEnd } = findSeparators(accountId)
  return referenceEnd === -1 ? accountId : accountId.slice(referenceEnd + 1)
}

export function getCaip10Reference(accountId: string): string | null {
  const { namespaceEnd, referenceEnd } = findSeparators(accountId)
  return referenceEnd === -1
    ? null
    : accountId.slice(namespaceEnd + 1, referenceEnd)
}

function findSeparators(accountId: string): {
  namespaceEnd: number
  referenceEnd: number
} {
  const namespaceEnd = accountId.indexOf(SEPARATOR)
  const referenceEnd =
    namespaceEnd === -1 ? -1 : accountId.indexOf(SEPARATOR, namespaceEnd + 1)
  return { namespaceEnd, referenceEnd }
}
