> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY (20-21 Sep 2026)
>
> This document is a point-in-time audit snapshot. Its findings, blockers, test failure counts, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../CLAUDE.md)

---

# Dead Code and Technical Debt

## Important boundary

No code was deleted. `src/archive` is a cleanup candidate, not proof that every contained component is unreachable. A complete import/router graph was unavailable because the required Codebase Memory MCP was not exposed.

## Confirmed debt

| Target | Evidence | Risk | Cleanup prerequisite |
| --- | --- | --- | --- |
| Explicit `any` | 33 ESLint errors | unsafe query/component contracts | type query/action boundaries; keep behavior tests |
| Hook dependency warnings | four floor workspaces | stale closures/repeated effects | reproduce workflow, correct dependencies, rerun tests |
| Large modules | multi-thousand-line rental/calendar/operations/document screens | difficult review and inconsistent state | characterization + route E2E before extraction |
| Runtime seed fallbacks | sub-rentals/documents/cases | false business data | explicit demo mode and empty/error UI |
| Obsolete scanner schema | `equipment_items` in ScannerFab | false-success operations | canonical scanner service/tests |
| Archived implementations | `src/archive/*` | duplicated concepts and stale vocabulary | confirm zero imports/routes before deletion |
| Unavailable feature scaffolding | many buttons/routes with “not built” explanations | product confusion and maintenance cost | production feature manifest/scope decision |
| Generated/parallel data models | `src/data/*`, `src/lib/mock/*`, live queries | drift between demo/tests/production | factories that implement the same contracts |
| Duplicated rental-day logic | `rentalDays.ts` notes remaining Packing/Return copies | financial/display divergence | settle pricing policy, centralise and test |
| Test warnings | repeated React `act`/navigation messages | real regressions hidden in noise | fix harness and fail on unexpected console output |

## Potential dead/obsolete targets requiring proof

- Archived settings/operations pages and tests.
- Old seeded activity/audit representations versus live query-backed modules.
- Legacy route redirects and prototype UI data helpers.
- Duplicate inventory/booking view models that differ only for seeded/demo consumers.
- Unused feature flags and unavailable action constants after product-scope decisions.

Use an import graph plus `tsc`/bundler trace before removal. Database functions are even higher risk: query `pg_depend`, API/RPC usage, scheduled jobs and audit logs before dropping anything. Migration history must remain immutable; retire objects with new forward migrations.

## Maintainability plan

1. Green lint/tests/build without behavior changes.
2. Remove production seed fallback behavior.
3. Establish feature manifest and canonical service contracts.
4. Split large screens along query/state/action/view boundaries.
5. Consolidate rental-day, status, availability and pricing logic only after their business rules are approved.
6. Prove reachability before archive deletion; record an ADR for removals.

