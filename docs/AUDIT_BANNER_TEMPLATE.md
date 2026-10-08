# Audit & Plan Banner Templates

This document provides standardized governance banners to prepend to historical audits, completed plans, and superseded specifications. These banners ensure that no reader or automated AI agent mistakes a historical snapshot for the live state of Babin Rentals OS.

---

## 1. Historical Audit Banner

Prepend this banner to all dated audits and inspection sweeps:

```markdown
> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Evidence Date:** YYYY-MM-DD
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY
>
> This document is a point-in-time measurement. Its findings, blockers, and readiness scores represent the system state on the date above and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../CLAUDE.md)
```

---

## 2. Completed / Superseded Plan Banner

Prepend this banner to completed fix plans, sprint schedules, and retired work streams:

```markdown
> [!NOTE] COMPLETED / ARCHIVED PLAN — HISTORICAL WORK RECORD
> **Original Target Date:** YYYY-MM-DD
> **Status:** COMPLETED / SUPERSEDED
>
> The tasks, checklists, and implementation phases described in this document have been executed, superseded by later rulings, or incorporated into the core application.
>
> Current active tasks and implementation status are tracked exclusively in:
> 1. [`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
> 2. [`PROGRESS.md`](../../../PROGRESS.md)
> 3. [`PLAN.md`](../../../PLAN.md)
```

---

## 3. Derivation & Reference Banner

Prepend this banner to wireframe analyses, UI interaction inventories, and exploratory specs:

```markdown
> [!NOTE] HISTORICAL DERIVATION & REFERENCE ONLY
> **Origin Date:** YYYY-MM-DD
> **Status:** ARCHIVAL REFERENCE
>
> This document records background design reasoning, wireframe rulings, or interaction mappings. Where any statement here conflicts with [`docs/PRODUCT_RULES.md`](../PRODUCT_RULES.md), [`docs/UI_UX_RULES.md`](../UI_UX_RULES.md), or [`docs/WORKFLOWS.md`](../WORKFLOWS.md), the canonical truth documents prevail.
```
