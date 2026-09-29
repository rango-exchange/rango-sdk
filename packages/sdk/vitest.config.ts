import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
})
