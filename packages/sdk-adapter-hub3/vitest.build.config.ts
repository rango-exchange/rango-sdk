import { defineConfig } from 'vitest/config'

// The build test reads the built output, so it runs on its own, after a build: `yarn test:build`.
export default defineConfig({
  test: {
    include: ['tests/build.test.ts'],
  },
})
