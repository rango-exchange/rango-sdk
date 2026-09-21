import * as basicAPI from './api/basic/index.js'
import * as mainAPI from './api/main/index.js'

export * from './api/shared/index.js'
export * from './signer/index.js'
export * from './errors/index.js'
export * from './execution/index.js'
// eslint-disable-next-line @typescript-eslint/consistent-type-exports -- its fix, `export type *`, needs TypeScript 5.0
export * from './blockchains/index.js'
export { mainAPI, basicAPI }
