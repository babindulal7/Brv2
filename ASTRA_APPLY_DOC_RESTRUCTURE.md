# Task — Apply the Babin Rentals OS Documentation Restructure

You are modifying documentation governance, not product behavior. **Do not change application code, migrations, RLS, data, or product rules as part of this task.**

## Goal

Make it impossible for a future AI agent to treat a historical audit, completed fix plan, old screenshot, or superseded bug count as the current state of Babin Rentals OS.

## Inputs

Use the cleanup-pack files as the proposed consolidated structure:

- `00_READ_FIRST.md`
- `CURRENT_STATE.md`
- `PRODUCT_RULES.md`
- `ARCHITECTURE.md`
- `PERMISSIONS_SUMMARY.md`
- `UI_UX_RULES.md`
- `WORKFLOWS.md`
- `OPEN_DECISIONS.md`
- `DOC_MIGRATION_MAP.md`
- `AUDIT_BANNER_TEMPLATE.md`

## Mandatory reconciliation before editing

Read, in this order:

1. current `CLAUDE.md`
2. current `PLAN.md`
3. current `PROGRESS.md` — newest entries first
4. Foundation Specification
5. current `docs/PERMISSIONS.md`
6. current Git HEAD / working-tree state

If the cleanup pack conflicts with a newer ruling or verified `PROGRESS.md` entry, **update the cleanup pack content to the newer truth**. Do not overwrite newer facts with this snapshot.

## Phase A — establish the new front door

Create `docs/00_READ_FIRST.md` and make it the documentation entry point.

It must state clearly:

- Foundation/CLAUDE/current product rules outrank historical audits.
- `PROGRESS.md` is the implementation-state ledger.
- dated audits are historical measurements.
- no old P0/P1 count or readiness score may be repeated as current without re-verification.
- product decisions must not be invented.

Update repo-root contributor/agent instructions to read this file first, but do not delete the existing read order until the migration is complete.

## Phase B — build the current truth documents

Create/reconcile:

- `docs/CURRENT_STATE.md`
- `docs/PRODUCT_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/UI_UX_RULES.md`
- `docs/WORKFLOWS.md`
- `docs/OPEN_DECISIONS.md`

### CURRENT_STATE rule

`CURRENT_STATE.md` must be **short**. It contains only:

- current phase
- current production-readiness statement
- last verified commit/date/environment
- current merge/release gates
- open P0/P1 blockers
- next 5 implementation priorities
- explicit external blockers

Do not put months of historical reasoning there. Link to the dated audit/ruling when history is needed.

### PRODUCT_RULES rule

Keep stable laws and current rulings only. Historical arguments belong in derivation/ruling files.

### OPEN_DECISIONS rule

Before carrying any decision forward, grep current `PROGRESS.md`, current rulings files, and current `PLAN.md` for a later answer. Remove already-ruled questions from the open list.

## Phase C — permissions

Do **not** replace `docs/PERMISSIONS.md` with `PERMISSIONS_SUMMARY.md`.

Use the summary only to cross-check the real file. The real permission document and live RLS must remain aligned. If a mismatch is discovered, report it; do not silently change a role set during this documentation task.

## Phase D — classify old documents without destroying them

Create directories as needed:

```text
docs/audits/2026-08/
docs/audits/2026-09/
docs/derivations/
docs/archive/completed-plans/
docs/reference/
```

Use `DOC_MIGRATION_MAP.md` as the starting classification.

Move files with Git history preserved where possible. Do not delete historical audits.

Add the historical-audit banner to dated audits and the completed-plan banner to completed plans. Do not rewrite their original findings merely to make them look current.

## Phase E — resolve documentation contradictions only

Search for contradictory present-tense statements such as:

- an old audit saying a blocker exists after a later plan says it was fixed;
- `SCREENS.md` requesting an AI card while Law 16 forbids unvalidated AI panels;
- Booqable integration instructions after the 9 Sep standalone-app ruling;
- an old phase marker presented as current despite newer work;
- an older capability count after later inspection-capability work;
- old discount approval gates after the ungated-discount ruling.

Do not “fix” the product while doing this. Instead:

- current rule → put in the current truth document;
- old claim → keep in historical file with banner/context;
- still uncertain → put in `OPEN_DECISIONS.md` or mark `UNKNOWN`.

## Phase F — verify documentation integrity

Before finishing:

1. run link/reference checks available in the repo;
2. grep all MD files for references to moved paths and update them;
3. grep for `NOT READY`, `PRODUCTION READY`, readiness scores, `P0 blockers`, and `P1 issues`; ensure dated audit claims cannot be mistaken for current status;
4. grep for `Booqable`; ensure active docs reflect the standalone-app ruling unless a newer ruling reintroduced it;
5. grep for `AI Assistant` / `AI panel`; ensure active docs preserve Law 16;
6. grep for old `1180` desktop breakpoint; active docs must use 1280;
7. grep for discount approval/15% gate language; active docs must reflect the current ungated-discount law;
8. ensure `CURRENT_STATE.md` agrees with the newest `PROGRESS.md` evidence.

## Output

At completion, report:

- files created
- files moved
- files bannered
- contradictions resolved in documentation
- unresolved contradictions requiring Babin
- exact source used for the current readiness statement
- whether `CURRENT_STATE.md` is now verified or still provisional

## Hard stop

If you cannot determine current implementation truth from `PROGRESS.md` + current code/gates, do **not** manufacture it. Leave `CURRENT_STATE.md` as provisional/unknown and report exactly what evidence is missing.
