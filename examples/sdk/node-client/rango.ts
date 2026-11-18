import { RangoClient } from '@rango-dev/sdk'

// No `execution` config: execution is browser only, and `execute()` throws `REQUEST_FAILED` in Node.
export const client = new RangoClient({ apiKey: 'YOUR_API_KEY' })
