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
    /*
     * Vitest stubs CSS imports to an empty string by default, which is right
     * for component suites — they should not pay to parse a stylesheet.
     * `lib/__tests__/breakpoints.test.ts` is the exception: it READS
     * `styles/responsive.css` as text to prove its breakpoints still match
     * `lib/breakpoints.ts`. With the stub in place that guard silently
     * compared against "" and passed while proving nothing.
     *
     * Scoped to the one stylesheet so no other suite starts paying for CSS.
     */
    css: {
      include: [
        /responsive\.css/,
        /modules[\\/]today[\\/]dashboard\.css/,
        /modules[\\/]rentals[\\/].*\.css/,
        /modules[\\/]operations[\\/].*\.css/,
      ],
    },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    /* `src/archive` holds screens ruled out of the application. Their suites
       are kept with them (Law 3 — nothing is deleted) but not run: they assert
       the behaviour of code that is no longer mounted, so a failure there would
       report a defect in something nobody can reach. Restoring a screen means
       moving it back and its suite comes with it. */
    exclude: ['node_modules/**', 'src/archive/**'],
    // Explicit imports from 'vitest' in every file — no ambient globals, so
    // `tsc --noEmit` typechecks the suites with the same strictness as `src/`.
    globals: false,
    /*
     * Raised from vitest's 5000ms default, 16 Aug 2026, after the same failure
     * shape appeared four separate times: `numberingPreview`,
     * `ExpenseReports.toolbar`, `calendar.kpiBand` and `ReportCatalog.dedup`
     * each timed out at exactly 5000ms during a full parallel run and passed in
     * isolation seconds later.
     *
     * The cause is not a slow test, it is contention. A `jsdom` component suite
     * pays ~3.5s just to build its environment before its first assertion, and
     * with several running in parallel on a loaded machine that leaves under two
     * seconds of real budget. The failures were never reproducible, which cost
     * two sessions distinguishing them from regressions.
     *
     * 20s is chosen to be far above the contention band and still low enough to
     * catch a genuine hang. It is NOT a licence for slow tests: the engine
     * suites in `src/lib` run in single-digit milliseconds and should stay there.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/actions/**/*.ts', 'src/modules/**/*.ts', 'src/modules/**/*.tsx'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/lib/seed.ts',
        'src/actions/**/*.test.ts',
        'src/modules/**/*.test.ts',
        'src/modules/**/*.test.tsx',
      ],
    },
  },
})
