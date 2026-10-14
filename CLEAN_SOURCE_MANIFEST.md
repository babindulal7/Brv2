# CLEAN SOURCE MANIFEST — Babin Rentals OS

**Date:** 14 October 2026 (Asia/Kathmandu)  
**Target:** Clean, private repository containing ONLY the latest verified Babin Rentals OS application.  
**Governing Rule:** No files from old GitHub projects (`Br`, `Brv2/main`, old Codex/Claude experiments, or historical scaffolds) may be imported, merged, or cherry-picked.

---

## 1. Top-Level Inclusion Allowlist

| Path | Purpose & Description | Target Environments |
|---|---|---|
| `src/` | Active React 18 & TypeScript 5.7 application source: UI modules, shared shell, components, business engines (`src/lib`), data access, actions (`src/actions`), types, and test suites. | Web, Desktop, Mobile, Tests |
| `public/` | Static web & PWA assets: icons, `favicon.ico`, `robots.txt`, `_redirects`. | Web, Mobile, Deployment |
| `packages/design-tokens/` | Monorepo package defining canonical design tokens and styling contracts. | Web, Desktop, Mobile |
| `supabase/migrations/` | 160 numbered PostgreSQL migrations (0001–0160) defining the complete database schema, RLS policies, and RPCs. | Supabase, Tests, CI Gates |
| `supabase/config.toml` | Supabase local CLI configuration. | Supabase Local CLI |
| `supabase/pglite-prelude.sql` | SQL bootstrap script for running migrations in-process via PGlite. | Tests, CI Gates |
| `supabase/preflight_0062.sql` | Preflight schema validation script. | Supabase Verification |
| `scripts/` | Essential testing, verification, migration, linting, and build scripts (`check-pglite.mjs`, `e2e-lifecycle.mjs`, `check-page-shell-lint.mjs`, `check-contrast.cjs`, `check-ui-copy.mjs`, etc.). | Tests, CI Gates, Maintenance |
| `.github/workflows/ci.yml` | Verified GitHub Actions CI pipeline executing all 10 verification gates. | CI / GitHub Actions |
| `electron/` | Native desktop shell entrypoints (`main.cjs`, `preload.cjs`). | Desktop (Electron) |
| `src-tauri/` | Tauri desktop shell wrapper (`Cargo.toml`, `tauri.conf.json`, `src/main.rs`). | Desktop (Tauri) |
| `android/` | Capacitor Android native project configuration (`build.gradle`, manifests). | Mobile (Android) |
| `docs/` | Authoritative documentation: `00_READ_FIRST.md`, `PERMISSIONS.md`, `PRODUCT_RULES.md`, `CURRENT_STATE.md`, `pages/` (55 screen specs), and `release/2026-10-13/`. | Documentation, Governance |
| `index.html` | Primary single-page application entrypoint for staff ops app. | Web, Desktop, Mobile |
| `marketing.html` | Public-facing site entrypoint with isolated styling. | Web |
| `package.json` | Dependencies, npm scripts, and project metadata (`babin-rentals-os`). | All Environments |
| `package-lock.json` | Deterministic dependency lockfile for `npm ci`. | All Environments |
| `tsconfig.json` & `tsconfig.node.json` | Strict TypeScript 5.7 compiler configurations. | All Environments |
| `vite.config.ts` | Multi-page Vite 5 bundler configuration with PWA plugin. | Web, Desktop, Mobile, Build |
| `vitest.config.ts` | Vitest test runner configuration for offline node/jsdom test suites. | Tests |
| `eslint.config.js` | ESLint 9 flat configuration scoped to `src/`. | Linting |
| `capacitor.config.ts` | Mobile Capacitor runtime configuration. | Mobile |
| `.gitignore` & `.gitattributes` | Git configuration enforcing branch hygiene and line endings. | Version Control |
| `.env.example` & `.env.mock.example` | Sanitized environment variable templates with placeholder values. | Development Setup |
| `vercel.json` | Vercel deployment routing rules (deep-link fallback). | Web Deployment |
| `nginx.conf` | Nginx production reverse proxy and caching configuration. | Production Hosting |
| `Dockerfile` & `.dockerignore` | Containerized production build specification. | Production Hosting |
| `AGENTS.md` & `CLAUDE.md` | Authoritative agent rules, architectural laws, and verification commands. | Development Governance |
| `README.md` & `DEPLOYMENT.md` | Project overview and production staging deployment runbook. | Operations |
| `BACKUP_PROTOCOL.md` | Backup, verify, and restore protocol for database operations. | Operations / Safety |

---

## 2. Explicit Exclusions (Default Ban List)

| Excluded Path / Category | Reason for Exclusion |
|---|---|
| `.git/` | Original commit history must not be imported; fresh Git repository history starts in new repo. |
| Any file from old `Brv2/main`, old `Br`, old `codex/*`, or old `claude/*` | Explicitly prohibited by Owner instruction (Section 0). |
| `node_modules/`, `dist/`, `coverage/`, `.next/` | Build artifacts and installed dependencies generated fresh via `npm ci` / `npm run build`. |
| `.env`, `.env.local`, `.env.*.local` | Local secrets, API tokens, and credentials must never be committed. |
| `backups/` (including `backups/live-2026-09-08/`) | Past database dumps and mapping files; kept securely in offline local storage. |
| `artifacts/` | Historical test run screenshots, visual checks, and execution traces; preserved in external backups. |
| `*.log`, `*.txt`, `.intel-*.log`, `.ux-*.log` | Temporary build, test, and lint logs. |
| `*.rar`, `*.zip` (`babin-rentals-os.rar`, etc.) | Compressed binary backup snapshots; kept in separate local storage. |
| `supabase_cutover_batch_*.sql` | Pre-computed migration batches superseded by canonical `supabase/migrations/`. |
| `src/archive/` | Historical unreferenced screens ruled out of the live application. |
| Old scratchpads (`PLAN.md`, `CONVENTIONS.md`, `.windsurfrules`, `next-improvements.xlsx`) | Replaced by canonical `AGENTS.md`, `PRODUCT_RULES.md`, and `docs/pages/`. |
| Customer PII, real contact records, or production dumps | Zero customer data in source repositories. |
