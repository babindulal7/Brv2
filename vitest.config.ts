import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Deliberately a **separate** config from `vite.config.ts`.
 *
 * When a `vitest.config.ts` exists it replaces `vite.config.ts` outright rather
 * than merging, which is what we want: the app config carries the PWA plugin,
 * Tailwind and the React plugin, none of which a pure-engine test run needs.
 * Loading them would add seconds per run and a service-worker build step to CI
 * for no coverage.
 *
 * `environment: 'node'` because every suite here tests a pure module in
 * `src/lib`. `jsdom` is installed so a future component test can opt in with a
 * `// @vitest-environment jsdom` pragma at the top of that one file, without a
 * global switch that slows the engine suites down.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Explicit imports from 'vitest' in every file — no ambient globals, so
    // `tsc --noEmit` typechecks the suites with the same strictness as `src/`.
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/seed.ts'],
    },
  },
})
