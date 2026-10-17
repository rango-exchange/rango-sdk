import { RangoClient } from '@rango-dev/sdk'

export const client = new RangoClient({
  apiKey: 'YOUR_API_KEY',
  // Pass the meta API's blockchain list; it's only used to check a set destination.
  meta: { blockchains: [] },
})
