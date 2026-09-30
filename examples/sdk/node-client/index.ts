// run `node --import=tsx index.ts` in the terminal

import { clientFromConsumer } from './consumer.js'
import { printRoute } from './quote.js'
import { printQuotes } from './quotes.js'
import { client } from './rango.js'

const sameInstance = client === clientFromConsumer()
console.log(`Both modules share the same Rango client: ${sameInstance}`)

await printQuotes()
await printRoute()
