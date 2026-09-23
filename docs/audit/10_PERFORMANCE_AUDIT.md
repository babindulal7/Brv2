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

# Performance Audit

## Verdict

No production trace, bundle artifact or representative database was available, so absolute performance is **UNABLE TO VERIFY**. Source shows generally sensible pagination and indexes, but four scale risks require measurement.

## Findings

### 1. Offline sync truncates at 300 (AUD-012)

`src/lib/syncEngine.ts:162,182` selects `products` and `clients` with `.limit(300)` and no complete pagination loop. A catalogue above that size gives an incomplete offline dataset; ordering/stale-deletion semantics are also not visible in that fetch.

Recommendation: cursor/range pagination with deterministic ordering, server change cursor, tombstones and a visible completeness watermark. Test 10k rows, interruption and resume.

### 2. Broad analytical reads (AUD-016)

Some query modules use `select('*')` and analytics such as equipment performance aggregate broad booking/product data client-side. This may transfer money or unused fields and becomes expensive at production scale.

Recommendation: purpose-built role-safe views/RPC aggregates, explicit columns, bounded date ranges and server pagination. Capture row counts, payload bytes and plans.

### 3. Multi-request screen refresh

Operations and rich detail screens refresh many resources together. Parallelism reduces latency but can produce request bursts, inconsistent snapshots and unnecessary refetches after small mutations.

Recommendation: query invalidation by affected resource, stable cache keys, server aggregate/read models where consistency matters, and request-budget instrumentation.

### 4. Frontend size/rendering unmeasured

Several screens are thousands of lines and import rich tables/modals. The production bundle was not generated from a clean install, so initial JS size, route splitting and service-worker precache size are unknown.

Recommendation: bundle visualisation in clean CI; route-level lazy loading; render profiler on 100/1,000 visible records; virtualise only after measuring; keep modal/workspace state local and memoise expensive derived datasets.

## Query/index assessment

Booking indexes cover branch/stage/pickup, branch/stage/return and client/stage. Reservation exclusions/indexes support conflict checks. Many lists use deterministic sort and range pagination. Missing-index claims require production-like `EXPLAIN`; none are asserted without that evidence.

Required plan suite: Today pickup/return windows, rental list filters/search, asset/serial lookup, client phone/name search, invoice/payment joins, open operation queues, reservation conflicts, utilisation/revenue reports. Test null/mixed sorts and deep pages; prefer keyset pagination where offset cost becomes material.

## Performance budgets

Suggested staging acceptance: route JS budget and LCP/INP thresholds agreed by the team; no list API returns unused money columns; no routine query returns an unbounded dataset; p95 search/list under an agreed floor-network target; offline sync reports completeness; scanner verdict within staff-usable latency and never converts timeout to success. Exact numbers should be set from measured devices/network, not invented in this audit.

