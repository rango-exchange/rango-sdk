import type {Asset, QuoteSimulationResult} from './common'


/**
 * Body of quote request
 *
 * @property {Asset} from - The source asset
 * @property {Asset} to - The destination asset
 * @property {string} amount - The human-readable amount of asset X that is going to be swapped, example: 0.28
 * @property {string[]} [swappers] - List of all accepted swappers, an empty list means no filter is required
 *
 */
export type QuoteRequest = {
  from: Asset
  to: Asset
  amount: string
  swappers?: string[]
}

/**
 * The response of quote API, if the route field is null, it means that no route is found
 *
 * @property {string} requestId - The unique requestId which is generated for this request by the server. It should be
 * passed down to all other endpoints if this swap continues on. e.g. d10657ce-b13a-405c-825b-b47f8a5016ad
 * @property {string} resultType - Type of result (OK or error type)
 * @property {QuoteSimulationResult | null} route - Suggested route
 *
 */
export type QuoteResponse = {
  requestId: string
  resultType: "OK" | "HIGH_IMPACT" | "INPUT_LIMIT_ISSUE" | "NO_ROUTE"
  route: QuoteSimulationResult | null
}
