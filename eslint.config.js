// ESLint 9 flat config, ESM because package.json is `"type": "module"`.
//
// The previous file here was a stringified object with every quote lost
// (`require(@eslint/js)`, `no-undef: error`) — a SyntaxError on load, so lint
// had never run in this repo (TODO_SWEEP_2026-09-02.md A2).
//
// Scope: `src/` only. `supabase/functions` is Deno, `scripts/` is plain Node,
// `src/archive/` is outside the TypeScript program. `tsc --noEmit` already owns
// unused locals and undefined names under `strict`, so those rules stay off
// here rather than reporting the same thing twice.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/archive/**', 'supabase/**', 'scripts/**', 'graft/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Seven files already carry `eslint-disable-next-line react-hooks/exhaustive-deps`
  // — the rule was always expected here; the plugin had simply never been installed.
  reactHooks.configs['recommended-latest'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // `actions/core.ts` groups capability cases with an explanatory comment
      // between labels; the default flags a label that holds only a comment.
      'no-fallthrough': ['error', { allowEmptyCase: true }],
      // Two deliberate empty catches (Web Audio beep, localStorage write):
      // silence is the fallback, and there is no operator to tell.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 36 on the first run (2 Sep 2026); 0 since the A13 burn-down. Back to
      // an error so the next one is caught at the source, not in a sweep.
      '@typescript-eslint/no-explicit-any': 'error',
      // TODO: Add custom rule to enforce CSS variable usage for z-index.
      // Pattern: flag hardcoded z-index literals (zIndex: number, z-index: number)
      // in component styles. Allowed: var(--z-dropdown), var(--z-sticky-nav),
      // var(--z-overlay), var(--z-drawer), var(--z-modal), var(--z-toast), var(--z-system).
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
