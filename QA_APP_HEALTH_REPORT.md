# QA — Application Health Report

**Date:** 4 September 2026
**Commit audited:** `a930db5` (branch `step1-foundation`)
**Audited from:** a detached git worktree pinned to `a930db5`, **not** the working tree.

## Why a worktree, and why it matters

The working tree was dirty at audit time — 27 modified files, and a parallel session was
editing `createRental.ts`, `floorVerb.ts`, `availability.ts`, `NewRental.tsx` and
`ReturnWorkspace.tsx` **three minutes** before this audit began. Those are precisely the
lifecycle files under test. Auditing them mid-edit would produce findings that are really
somebody's half-finished work, and would not reproduce.

Everything below therefore measures the **committed** state. Where the report says
"at HEAD", it means `a930db5`, verified with `git rev-parse`.

## Environment

| | |
|---|---|
| Frontend | React 19 + TypeScript + Vite **5.4.21** |
| Backend | Supabase (PostgREST + GoTrue), Postgres 17 |
| Production DB | `sxguwvgoserhdolewibb.supabase.co` — **read-only during this audit; never written** |
| Test DB | local Supabase stack, rebuilt from all 85 migrations |
| Dev server | `vite --mode localdb` on :5175 (local DB) |
| Prod preview | `vite preview` on :5176, built `--mode localdb` and **verified** not to point at production |
| Test identities | `owner@` (Owner), `warehouse@` (Warehouse), `billing@` (Coordinator), created on the LOCAL stack only |
| Backup | `pg_dump` of the local DB taken **before** any write (883 KB, clean exit) |

`.env.local` sets `VITE_DATA_SOURCE=live` against the production project, so a plain
`npm run dev` drives **real business data**. No destructive test was run there.

## Health checks at HEAD — all green

| Check | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | **exit 0** |
| Lint | `eslint src --max-warnings 0` | **clean** |
| Unit/integration tests | `vitest run` | **106/106 files, 2378 tests pass** |
| Production build | `vite build` | **exit 0**, 1m48s, PWA precache 218 entries |
| Migrations from scratch | `check:rebuild` | **86 applied, 0 failed** |

### One false alarm, recorded so it is not re-filed

The first test run reported **18 failed test files**. That was my worktree, not the code:
`.env.local` is gitignored, so the worktree had no env and every file constructing the
Supabase client failed to import. With the env copied in, **106/106 pass**. There is no
test failure at HEAD.

## Runtime health

- **Console:** no application errors on the production build after sign-in. The 401/403s
  seen initially were the grant problem below, not app faults.
- **Network:** no failed requests once grants were restored.
- **Hydration:** none observed.
- **Routes:** 73 distinct routes declared in `src/App.tsx`.

## Health finding: the migration set cannot produce a working database on its own

Severity **P1** (disaster recovery), found by driving the app rather than reading it.

After rebuilding the local database from all 85 migrations, sign-in succeeded (token 200)
but every table read failed:

```
42501 — permission denied for table users
hint: Grant the required privileges to the current role with: GRANT SELECT ON public.users TO authenticated;
```

Cause: 22 migrations contain `GRANT` statements, but **only on `_v` views**. **No migration
grants SELECT/INSERT/UPDATE/DELETE on any base table to `authenticated`**, and none sets
`ALTER DEFAULT PRIVILEGES`. The application's entire data access rests on the hosting
platform's default privileges, which are not part of the repo.

Measured on the rebuilt database: default privileges for role `postgres` grant
`anon`/`authenticated` only `Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) — **no SELECT,
INSERT, UPDATE or DELETE**.

Consequence: a disaster-recovery rebuild, a new environment, or any fresh stack produces a
database the application cannot read a single row from. `check:rebuild` cannot catch this —
its own header documents the risk, but its assertions do not test it.

**Fix:** state the grants in a migration, or add an `ALTER DEFAULT PRIVILEGES` migration, and
extend `check:rebuild` to assert that `authenticated` can SELECT a representative table.

## Repo hygiene (P4)

Four zero-byte files sit untracked in the repo root — `0`, `100`, `MAX_EVENTS_PER_SESSION)`
and `users` — artefacts of accidental shell redirects. They should be deleted and the
pattern added to `.gitignore`.

## Measurement caveat — read before trusting any timing

The Browser pane runs hidden, so `document.hidden === true` and **timers are throttled 5–23×**
(a requested 100 ms fired at 494–2290 ms, measured). An early reading of a "7-second
main-thread freeze at login" was **this artefact, not the app**, and is withdrawn. No timing
number appears in the findings unless it was measured by a throttle-independent means
(request counts, DB timestamps).
