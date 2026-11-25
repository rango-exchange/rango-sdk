import { RangoClient } from '@rango-dev/sdk'

// No `execution` config: execution is browser only, so `execute()` throws `INVALID_INPUT` here.
export const client = new RangoClient({ apiKey: 'YOUR_API_KEY' })
