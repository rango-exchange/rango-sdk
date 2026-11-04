/*
 * The built package: each hub3 subpath resolves and loads only its own hub3 packages, and the main entry loads
 * none of them.
 * It reads `dist`, so it needs a build first: run it with `yarn test:build`, which builds and then runs it.
 */
import type { Metafile } from 'esbuild'

import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build } from 'esbuild'
import { describe, expect, test } from 'vitest'

const PACKAGE_NAME = '@rango-dev/sdk'
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HUB3_SCOPE = '@hub3js/'
const HUB3_CORE = '@hub3js/core'

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
]

// Resolves a specifier through the package's own exports map, the way a Host's import of it does.
const resolveFromPackage = createRequire(
  join(PACKAGE_ROOT, 'package.json'),
).resolve

/*
 * Static and dynamic imports, from the entry and every chunk of the package it reaches. Packages stay external, so
 * this counts the SDK's output, not hub3's own imports.
 */
async function hub3ImportsOf(entry: string): Promise<string[]> {
  const { metafile } = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    packages: 'external',
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
  })

  return externalImportsOf(metafile)
    .filter((path) => path.startsWith(HUB3_SCOPE))
    .sort()
}

function externalImportsOf(metafile: Metafile): string[] {
  const imports = Object.values(metafile.inputs).flatMap((input) =>
    input.imports
      .filter((imported) => imported.external === true)
      .map((imported) => imported.path),
  )

  return [...new Set(imports)]
}

describe('the built package', () => {
  describe.each(NAMESPACES)(
    'the $namespace subpath',
    ({ namespace, adapter, hub3Package }) => {
      const subpath = `${PACKAGE_NAME}/adapters/hub3/${namespace}`

      test('resolves through the exports map to its own built entry', () => {
        const resolved = resolveFromPackage(subpath)

        expect(relative(PACKAGE_ROOT, resolved).split('\\').join('/')).toBe(
          `dist/adapters/hub3/${namespace}.js`,
        )
      })

      test('exports only its adapter', async () => {
        const entry: Record<string, unknown> = await import(
          pathToFileURL(resolveFromPackage(subpath)).href
        )

        expect(Object.keys(entry)).toEqual([adapter])
        expect(entry[adapter]).toBeTypeOf('function')
      })

      test("imports no hub3 package but core and its own namespace's", async () => {
        const hub3Imports = await hub3ImportsOf(resolveFromPackage(subpath))

        expect(
          hub3Imports.filter(
            (path) => path !== HUB3_CORE && path !== hub3Package,
          ),
        ).toEqual([])
      })
    },
  )

  test('no longer resolves the single hub3 subpath', () => {
    expect(() => resolveFromPackage(`${PACKAGE_NAME}/adapters/hub3`)).toThrow(
      /not defined by "exports"/,
    )
  })

  test('the main entry imports no hub3 package, through its chunks either', async () => {
    const hub3Imports = await hub3ImportsOf(resolveFromPackage(PACKAGE_NAME))

    expect(hub3Imports).toEqual([])
  })
})
