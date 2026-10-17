// run `node --import=tsx index.ts` in the terminal

import { SdkError } from '@rango-dev/sdk'

import { printRoute } from './quote.js'

try {
  await printRoute()
} catch (error) {
  // Each step handles the SDK errors it expects; this catches any other.
  if (!(error instanceof SdkError)) {
    throw error
  }
  console.error(`Unhandled SDK error (${error.type})`, error.cause)
}
