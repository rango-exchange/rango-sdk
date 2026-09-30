// run `node --import=tsx index.ts` in the terminal

import { confirmFirstQuote } from './confirm.js'
import { clientFromConsumer } from './consumer.js'
import { printRoute } from './quote.js'
import { printQuotes } from './quotes.js'
import { client } from './rango.js'

const sameInstance = client === clientFromConsumer()
console.log(`Both modules share the same Rango client: ${sameInstance}`)

const quotes = await printQuotes()
await confirmFirstQuote(quotes)
await printRoute()
