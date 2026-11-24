/*
 * The built package: each subpath resolves and loads only its own hub3 packages and chain library, plus the shared
 * peers, and none of them bundles `@rango-dev/sdk`.
 * It reads `dist`, so it needs a build first: run it with `yarn test:build`, which builds and then runs it.
 */
import type { Metafile } from 'esbuild'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build } from 'esbuild'
import { describe, expect, test } from 'vitest'

const PACKAGE_NAME = '@rango-dev/sdk-adapter-hub3'
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HUB3_SCOPE = '@hub3js/'
// The peers every hub3 subpath may load, whatever its namespace.
const SHARED_PEERS = ['@hub3js/core', 'caip']
// The chain libraries the adapters use where hub3 has no action, counted with the `@hub3js` packages.
const CHAIN_LIBRARIES = ['xrpl']

// Subpaths are named after the SDK namespace, not hub3's: `bip122` is hub3's `utxo`, and `ton`'s package is `tvm`.
const NAMESPACES = [
  { namespace: 'evm', adapter: 'hub3EvmAdapter', hub3Package: '@hub3js/evm' },
  {
    namespace: 'solana',
    adapter: 'hub3SolanaAdapter',
    hub3Package: '@hub3js/solana',
  },
  {
    namespace: 'starknet',
    adapter: 'hub3StarknetAdapter',
    hub3Package: '@hub3js/starknet',
  },
  { namespace: 'ton', adapter: 'hub3TonAdapter', hub3Package: '@hub3js/tvm' },
  { namespace: 'sui', adapter: 'hub3SuiAdapter', hub3Package: '@hub3js/sui' },
  {
    namespace: 'bip122',
    adapter: 'hub3Bip122Adapter',
    hub3Package: '@hub3js/bip122',
  },
  {
    namespace: 'tron',
    adapter: 'hub3TronAdapter',
    hub3Package: '@hub3js/tron',
  },
  {
    namespace: 'xrpl',
    adapter: 'hub3XrplAdapter',
    hub3Package: '@hub3js/xrpl',
    chainLibrary: 'xrpl',
  },
]

// Resolves a specifier through the package's own exports map, the way a Host's import of it does.
const resolveFromPackage = createRequire(
  join(PACKAGE_ROOT, 'package.json'),
).resolve

/*
 * The entry and every chunk of the package it reaches, through static and dynamic imports. Packages stay external, so
 * this is the package's own output, not hub3's.
 */
async function metafileOf(entry: string): Promise<Metafile> {
  const { metafile } = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    packages: 'external',
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    absWorkingDir: PACKAGE_ROOT,
  })

  return metafile
}

// Static and dynamic imports of the hub3 packages, shared peers and chain libraries, from the entry and its chunks.
async function hub3ImportsOf(entry: string): Promise<string[]> {
  return externalImportsOf(await metafileOf(entry))
    .filter(
      (path) =>
        path.startsWith(HUB3_SCOPE) ||
        SHARED_PEERS.includes(path) ||
        isChainLibrary(path),
    )
    .sort()
}

function isChainLibrary(path: string): boolean {
  return CHAIN_LIBRARIES.some(
    (library) => path === library || path.startsWith(`${library}/`),
  )
}

function externalImportsOf(metafile: Metafile): string[] {
  const imports = Object.values(metafile.inputs).flatMap((input) =>
    input.imports
      .filter((imported) => imported.external === true)
      .map((imported) => imported.path),
  )

  return [...new Set(imports)]
}

/*
 * The sources the entry and every chunk it reaches were built from, read from their source maps, relative to the
 * package root. A bundled `@rango-dev/sdk` would show up here as a source outside the package's own `src`.
 */
async function bundledSourcesOf(entry: string): Promise<string[]> {
  const files = Object.keys((await metafileOf(entry)).inputs).map((input) =>
    resolve(PACKAGE_ROOT, input),
  )
  const sources = files.flatMap((file) => {
    const map: { sources: string[] } = JSON.parse(
      readFileSync(`${file}.map`, 'utf8'),
    )

    return map.sources.map((source) =>
      relative(PACKAGE_ROOT, resolve(dirname(file), source))
        .split('\\')
        .join('/'),
    )
  })

  return [...new Set(sources)].sort()
}

describe('the built package', () => {
  describe.each(NAMESPACES)(
    'the $namespace subpath',
    ({ namespace, adapter, hub3Package, chainLibrary }) => {
      const subpath = `${PACKAGE_NAME}/${namespace}`

      test('resolves through the exports map to its own built entry', () => {
        const resolved = resolveFromPackage(subpath)

        expect(relative(PACKAGE_ROOT, resolved).split('\\').join('/')).toBe(
          `dist/${namespace}.js`,
        )
      })

      test('exports only its adapter', async () => {
        const entry: Record<string, unknown> = await import(
          pathToFileURL(resolveFromPackage(subpath)).href
        )

        expect(Object.keys(entry)).toEqual([adapter])
        expect(entry[adapter]).toBeTypeOf('function')
      })

      test("imports no hub3 package, shared peer or chain library but the shared peers (core and caip), its own namespace's and its own chain's", async () => {
        const hub3Imports = await hub3ImportsOf(resolveFromPackage(subpath))

        expect(
          hub3Imports.filter(
            (path) =>
              !SHARED_PEERS.includes(path) &&
              path !== hub3Package &&
              path !== chainLibrary,
          ),
        ).toEqual([])
      })

      test("bundles no `@rango-dev/sdk`, through its chunks either: everything it reaches is built from the package's own source", async () => {
        const sources = await bundledSourcesOf(resolveFromPackage(subpath))

        expect(sources).toContain(`src/${namespace}.ts`)
        expect(sources.filter((source) => !source.startsWith('src/'))).toEqual(
          [],
        )
      })
    },
  )
})
