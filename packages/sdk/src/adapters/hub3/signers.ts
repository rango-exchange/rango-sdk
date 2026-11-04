import type { Provider } from '@hub3js/core'
import type { GenericSigner, mainAPI, TransactionType } from 'rango-types'

// Looked up afresh on every call: the wallet may register a new signer, such as when the user switches accounts.
export async function tryFindSigner<TNS, Tx extends mainAPI.Transaction>(
  provider: Provider<TNS>,
  type: TransactionType,
): Promise<GenericSigner<Tx>> {
  const signersProperty = provider
    .info()
    ?.metadata.properties?.find(
      (item): item is Extract<typeof item, { name: 'signers' }> =>
        item.name === 'signers',
    )
  if (signersProperty === undefined) {
    throw new Error(
      `The hub3 provider "${provider.id}" has no "signers" metadata property.`,
    )
  }
  const signers = await signersProperty.value.getSigners()
  return signers.getSigner<Tx>(type)
}
