# AGENTS.md — Babin Rentals OS

React 18 · TS 5.7 strict · Vite 5 · Tailwind v4 · Supabase Postgres + RLS · Dexie (IndexedDB outbox) · PGlite (in-process Postgres for DB gates).

## Start here (authority order)

`docs/00_READ_FIRST.md` → `CLAUDE.md` → `docs/PERMISSIONS.md` (§3/§4/§6 matrix) → `RULINGS-*.md` (newest first) → `docs/PRODUCT_RULES.md` → `docs/CURRENT_STATE.md` → `PROGRESS.md` → `PLAN.md` → Foundation Spec. Where specs conflict, Foundation wins; where permissions conflict, `PERMISSIONS.md` wins and **stricter wins** (B-1). Never read `src/archive/` or dated `docs/audits/` as current truth.

- Never invent a product decision. Mark `TODO(decision)`, log in `PLAN.md §4` / `docs/OPEN_DECISIONS.md`, work on something unblocked.
- Session end: update `PROGRESS.md` (newest first, Did / Ruled / Verified) with `## Completion` + `## Remaining` blocks. Run `npm run completion` — never hand-type a percentage. `npm run lint:progress` enforces the blocks (CI runs it).

## Commands

```bash
cp .env.example .env.local   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, then restart Vite
npm run dev                  # live Supabase, :3000
npm run dev:mock             # vite --mode mock, VITE_DATA_SOURCE=mock local corpus
npm run dev:local            # vite --mode localdb
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint src --max-warnings 0 (src only; archive/scripts/supabase excluded)
npm test                     # vitest run (full suite)
npx vitest run <path>        # single file, e.g. npx vitest run src/__tests__/e2e/tier1-features.test.tsx
npm run build                # tsc --noEmit && vite build → dist/
```

Verification order for any change: `typecheck → test → check:pglite + check:lifecycle → build`. CI (`Node 24`, `.github/workflows/ci.yml`) runs exactly: typecheck, test, `check:pglite`, `check:lifecycle`, `lint:progress`, `check:contrast`, build, coverage.

DB / lifecycle gates (allowed in `opencode.jsonc`, never prompt-blocked):
```bash
npm run check:pglite        # rebuild all migrations from scratch in PGlite, no Docker/network
npm run check:lifecycle     # 18-step booking lifecycle through real Postgres + RLS
npm run check:contrast      # WCAG AA on shipped theme.css, light + dark
npm run check:db / check:rebuild / check:dump
npm run db:start | db:stop
npm run db:apply            # LOCAL stack only (scripts/apply-migrations-local.mjs)
npm run db:rebuild          # supabase db reset --no-seed + local apply
npm run db:types            # regen src/types/database.ts
```

## Hard prohibitions

- **N-5: never push a migration to live Supabase.** `supabase db push` (any spelling) and `npm run db:apply --remote` are denied in `opencode.jsonc`. Write it, number it (`supabase/migrations/`), verify locally (`check:pglite` + `check:lifecycle` both green = `Verified` per R-35) — Babin applies after `BACKUP_PROTOCOL.md`. Never `supabase db reset` against production. `PROGRESS.md` must say WRITTEN vs VERIFIED vs APPLIED vs PRODUCTION-VERIFIED.
- **Anon key only in the client.** Every `VITE_*` var is inlined into the bundle at build time and is public (View Source). Never a service key, JWT secret, or credential in code, logs, or commits (N-8). `docker run -e` on a built image does nothing — values must exist at `npm run build`.
- Env changes require a Vite restart. `VITE_DEV_AUTH_BYPASS=true` skips login as seeded Owner but is double-gated on `import.meta.env.DEV` (dead code in prod).
- No `any` in `src/` (`@typescript-eslint/no-explicit-any: error`); relaxed only in `*.test.*`. `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` are on — index access needs guards.

## Architecture (what filenames don't tell you)

- `@/` → `src/`. Entrypoints: `src/main.tsx` → `src/App.tsx` (route table: `Shell` + `BookingShell`; `/today`+`/dashboard` both mount Today; `/rentals/new` redirects to `/rentals?action=new`).
- **Law 1: pages never implement business logic.** Engines own it: `src/lib/` (money, pricingPipeline, rentalDays/operationalDay, bs, rbac, workflow, gates). Writes go through `src/actions/` (per-domain folders + `core.ts`; a stub refuses rather than faking). Components present/collect only.
- **Custody transitions are fail-closed online RPCs, never queued offline** (R-40): `apply_booking_stage_transition()` validates gates, mints reservations (GiST exclusion), transitions stage, audits — caller reads `bookings.stage` back with `queueOnFailure: false`. Only non-custodial events (scans, notes, queue stamps) use the Dexie outbox (`src/lib/offlineQueue.ts`, `dataAccess.ts`) with `client_uuid` idempotency keys on every write.
- Atomic RPCs: `create_booking(jsonb)` (booking + lines + crew + transport, no partials, R-43), `next_document_number()` (BK-/INV-/PAY-, monotonic Law 7).
- `src/archive/` is Law 3 (nothing is deleted): kept but excluded from tsconfig, eslint, and vitest. Restoring = move back into `src/modules` + re-add route.
- Build has **two entry documents** (`index.html` ops app, `marketing.html` public site) with isolated CSS. Host must rewrite unknown paths to `/index.html` (`vercel.json` / `nginx.conf` `try_files`); without it deep links 404 in prod while working in dev. `vite.config.ts`: `sourcemap: false` pinned (do not flip — leaks source paths), PWA `globPatterns` must keep `woff,woff2` or offline Nepali fonts break.
- `packages/design-tokens/` is the token source; `src/styles/theme.css` is the runtime layer. Breakpoints `768 / 1280` live in `src/lib/breakpoints.ts`, mirrored by `styles/responsive.css` + `index.html` pre-paint script — a test asserts all three agree, so change all three together.

## Money, dates, roles (will fail review if wrong)

- **Integer paisa only** (`src/lib/money.ts`): `rupees()` / `price()` / `formatMoney()` (lakh grouping `1,85,000`, half-up rounded at each displayed step). Never `float`/`numeric`/`parseFloat` for amounts; never recompute pricing in a component. §2.8 reference case is asserted at module load (`REFERENCE_CASE_ERROR` → error screen, not throw).
- Deposits are liabilities: never in Rental Total, never reduce Outstanding (Law 5). Payments immutable: corrections are reversal rows (Law 4). Discount gate is removed (D3) — only arithmetic validity remains (0–100%).
- Store AD in UTC (`timestamptz`); BS rendered via `src/lib/bs.ts` only. Operational day 06:00→06:00 NPT (`rentalDaysBetween`, `KATHMANDU_SHIFT_OFFSET_MS`).
- Money-blind roles (`Warehouse`, `Technician`, `Driver`, `Client`): enforced by RLS/`auth_can_view_money()`, mirrored in UI via `canViewMoney`/`useRoleMoney`/`isMoneySurface`. Never leak figures in HTML or payloads. Word "customer" appears nowhere — always "clients". Status = icon + label + colour, never colour alone. Errors inline; toasts for successes only. Touch targets ≥44px (56px primary floor verbs). Icons Tabler outline 2px. Fonts self-hosted `.woff2`: Outfit (display), Source Sans 3 (body), JetBrains Mono (every number), Asar/Hind (Nepali).

## Tests

- `vitest.config.ts` is deliberately separate from `vite.config.ts` (no PWA/Tailwind in test runs). Default env `node`; UI suites opt into jsdom per-file via `// @vitest-environment jsdom`. `testTimeout/hookTimeout 20s` is contention headroom, not a slow-test budget — `src/lib` engine suites run in ms.
- Coverage (`npm run test:coverage`) only measures `src/lib/**/*.ts`. E2E tiers in `src/__tests__/e2e/` (`tier1-features`, `tier2-boundaries`, `tier3-cross-feature`, `tier4-scenarios`) are opaque-box: roles/labels/text/user events, never internals. Green unit tests alone never certify a migration — R-35 requires `check:pglite` + `check:lifecycle` green together.
