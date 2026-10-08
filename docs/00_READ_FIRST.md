# Babin Rentals OS — Documentation Governance & Entry Point

**Read this document before reading any audit, specification, or plan in this repository.**

---

## 1. Non-Negotiable Hierarchy of Authority

When any two documents in this repository conflict or disagree, read in this exact order and stop at the first document that answers:

```text
1. docs/00_READ_FIRST.md          — Universal documentation entry point & rules of engagement
2. CLAUDE.md                       — Repository contributor laws & operational constraints
3. docs/PERMISSIONS.md             — Authoritative capability & role security matrix
4. RULINGS-*.md (newest first)     — Binding architectural & product rulings (R-00 to R-43)
5. docs/PRODUCT_RULES.md           — Canonical business laws & durability invariants
6. docs/CURRENT_STATE.md           — Current verified runtime & release gate status
7. PROGRESS.md                     — Chronological implementation ledger (what is actually built)
8. PLAN.md                         — Dependency-ordered build roadmap
9. Foundation Specification        — Canonical domain model & business concepts
10. Historical Audits & Plans      — Point-in-time measurements (never current status)
```

---

## 2. Core Governance Rules

### Rule 1: Foundation, CLAUDE.md, and Product Rules Outrank Audits
Historical audits, bug sweeps, and review documents are **dated snapshots**, not living specifications. A dated audit describes the codebase on the day it was run. It cannot supersede a core architectural law, a newer binding ruling, or verified code in the repository.

### Rule 2: `PROGRESS.md` Is the Sole Implementation Ledger
The state of what has been built, tested, and verified lives exclusively in [`PROGRESS.md`](../PROGRESS.md) (newest entries at top). Do not assume a feature or migration is complete because a plan proposed it. Verify in `PROGRESS.md` and through live gate checks.

### Rule 3: Dated Audits Are Historical Measurements
Never repeat a dated audit's findings, readiness score, or blocker counts as present-tense fact. A score of "42% ready" or "18 blockers" from August or early September 2026 is an archival artifact. The current state is defined by fresh execution of the repository's runtime gates.

### Rule 4: No Old P0/P1 Count May Be Repeated Without Verification
If a document mentions a P0 or P1 blocker, check `docs/OPEN_DECISIONS.md`, `PROGRESS.md`, and the codebase to determine whether it has already been resolved, codified into a database trigger, or superseded. Repeating unverified blocker counts is prohibited.

### Rule 5: Product Decisions Must Never Be Invented
When an agent or developer encounters an ambiguity, missing requirement, or edge-case conflict:
- **Never invent a product decision** or fabricate mock data/compliance flags.
- Check `docs/OPEN_DECISIONS.md` and binding rulings `RULINGS-*.md`.
- If unruled, record a `TODO(decision)`, log the question in `PLAN.md §4` / `docs/OPEN_DECISIONS.md`, and proceed with unblocked work.

---

## 3. Directory Guide

| Path | Purpose | Authority Level |
|---|---|---|
| [`docs/CURRENT_STATE.md`](CURRENT_STATE.md) | Current phase, runtime gate verification, release readiness | **Active Truth** |
| [`docs/PRODUCT_RULES.md`](PRODUCT_RULES.md) | Non-negotiable domain laws (Laws 1–16) and active rulings | **Active Truth** |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Technical stack, data boundaries, offline queue architecture | **Active Truth** |
| [`docs/UI_UX_RULES.md`](UI_UX_RULES.md) | Tap budget doctrine (R-39), responsive breakpoints, tokens | **Active Truth** |
| [`docs/WORKFLOWS.md`](WORKFLOWS.md) | Custody stages, operations workspaces, transition contracts | **Active Truth** |
| [`docs/OPEN_DECISIONS.md`](OPEN_DECISIONS.md) | Actively open product and architecture decisions | **Active Truth** |
| [`docs/PERMISSIONS.md`](PERMISSIONS.md) | Full 39-capability security matrix and role definitions | **Active Truth** |
| [`docs/PERMISSIONS_SUMMARY.md`](PERMISSIONS_SUMMARY.md) | Fast reference card for permission lookups | Reference |
| `docs/audits/` | Point-in-time audits from Aug/Sep 2026 | Historical Only |
| `docs/archive/completed-plans/` | Executed fix plans and sprint designs | Historical Only |
| `docs/derivations/` | Background design reasoning & wireframe logs | Historical Only |
| `docs/reference/` | Screen catalogues and historical bug indexes | Reference Only |
