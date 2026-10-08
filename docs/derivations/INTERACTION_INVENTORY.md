> [!NOTE] HISTORICAL DERIVATION & REFERENCE ONLY
> **Status:** ARCHIVAL REFERENCE
>
> This document records background design reasoning, wireframe rulings, or interaction mappings. Where any statement here conflicts with canonical truth documents ([`docs/PRODUCT_RULES.md`](../PRODUCT_RULES.md), [`docs/UI_UX_RULES.md`](../UI_UX_RULES.md), or [`docs/WORKFLOWS.md`](../WORKFLOWS.md)), the canonical truth documents prevail.

---

# Babin Rentals OS — Interaction Inventory

Buttons, links and clickable controls. Audit of 1 Sep 2026 at `4696af8`.

**Method.** Two independent passes, deliberately, because each catches what the other
misses:

- **Static (Stage A):** a JSX-aware parser over `src/**/*.tsx` (comment-stripping, brace-
  and string-aware tag scanner — *not* grep, which mis-parses multi-line tags and prose
  inside comments). Sees every control in source, including in files that never render.
- **Runtime (Stage B):** Playwright + Chromium, logged in, reading **React fiber props**
  on every rendered `<button>` to determine whether an `onClick` is actually attached —
  including handlers delegated from up to 4 ancestor levels. Sees only what ships, but
  cannot be fooled by indirection.

Where the two disagree, the disagreement is itself a finding (see §4).

---

## 1. Totals

### Source (static)
| Kind | Count |
|---|---|
| Native `<button>` (excl. archive/tests) | 437 |
| Custom `<Button>` | 370 |
| **Total controls in source** | **807** |

### Rendered (runtime, 56 routes)
| Kind | Count |
|---|---|
| Buttons rendered | **1,693** |
| Properly `disabled` (documented pattern) | 294 |
| Live (handler attached) | 1,266 |
| **Dead (enabled, no handler)** | **133** |
| Internal links rendered on shell | 11 sidebar + in-page |
| Form inputs rendered | 412 |

> 1,693 rendered vs 807 in source is expected — list rows, table cells and repeated
> components instantiate the same source control many times.

---

## 2. Dead controls — runtime confirmed

### Global (every route)
| Control | Occurrences | File | Note |
|---|---|---|---|
| Notifications bell "12" | 56 | header | hardcoded unread badge, `cursor:pointer` |
| Help | 56 | `Header.tsx:353` | `cursor:pointer` |

**112 of the 133 dead buttons are these two controls repeated across 56 routes.**

### Screen-specific (21 remaining)
| Route | Control | File |
|---|---|---|
| `/reports/clients` | `«` `‹` `1` `2` `3` `4` `…` `209` `›` (9) + `View` (2) | `ClientReports.tsx:429` |
| `/rentals/new` | `Receive Payment`, `Receive Deposit`, `Share`, `More` | `NewRental.tsx:1944-45` |
| `/reports/expenses`, `/finance/expenses` | `Import`, `New Expense` | `ExpenseReports.tsx:322-23` |
| `/admin/backup`, `/tools/backup` | `Select backup or restore point` | `BackupRestore.tsx:557` |
| `/operations/sub-rental` | `View` | `SubRental.tsx` |

---

## 3. Dead controls — static only (not reachable in this pass)

Real in source, but either inside a sub-flow the crawl did not enter, or in a file with
no route.

| Control | File | Why runtime missed it |
|---|---|---|
| `Collapse All` | `InventoryTree.tsx:19` | inside bundle-builder sub-flow |
| `Preview` / `Duplicate` / `More` | `BundleSummaryRail.tsx:139-147` | ditto — explicit `cursor:pointer` |
| `View all blocked items` | `BundleSummaryRail.tsx:130` | ditto |
| `Accept` / `Change` / `Assign Product` | `EvidenceWorkspace.tsx:718` | `MiniBtn` — **no `onClick` in prop type** |
| Reports toolbars (~15) | `ProductReports.tsx`, `CasesReports.tsx` | **unrouted files — never render** |

---

## 4. Where the two passes disagreed

| Case | Static said | Runtime said | Truth |
|---|---|---|---|
| Reports toolbar buttons | 21 dead `<Button>` | never seen | **Files are unreachable** — BUG-005 |
| `NewRental.tsx:2824` | frozen input | fills fine | **Static was wrong** (comment broke the parser) |
| 294 disabled buttons | flagged in v1 | correctly excluded | **Static was wrong** (boolean attrs) |
| Header Help | dead | dead | agreed |

The lesson worth keeping: **static alone over-reports** (dead code, disabled controls),
**runtime alone under-reports** (unvisited sub-flows). Both were needed.

---

## 5. Link inventory

Sidebar, all verified to navigate and load:

| Link | Destination | Loads |
|---|---|---|
| New Rental | `/rentals/new` | ✅ |
| Dashboard | `/dashboard` | ✅ |
| Operation | `/operations` | ✅ |
| Rentals | `/rentals` | ✅ |
| Calendar | `/calendar` | ✅ |
| Crew Assist | `/crew` | ✅ |
| Inventory | `/inventory` | ✅ |
| Clients | `/clients` | ✅ |
| Finance | `/finance` | ✅ |
| Tools | `/tools` | ✅ |
| Settings | `/settings` | ✅ |

**Intentional aliases (10)** — all resolve correctly:
`/today`→`/dashboard`, `/admin`→`/settings?tab=system`, `/operations/cases`→`/inventory/cases`,
`/operations/crew`→`/crew`, `/settings/tools`→`/tools/cinematography`, `/reports`→`/reports/pulse`,
`/tools/{activity-log,audit-log,backup,numbering}`→`/admin/*`.

**404 handling:** unknown routes render a proper in-shell 404. Verified with
`/nonsense-route-xyz`.

**⚠ Not verified (§10):** that a link to `/clients/:id` carries the *correct* entity id —
i.e. clicking Customer A never opens Customer B. That is spec §44 and requires the CRUD
stage.

---

## 6. The healthy pattern, for reference

294 buttons use the correct convention for not-yet-built actions:

```jsx
<button type="button" disabled
        title={`${label} — ${why}`}
        aria-label={`${label} — unavailable`}>
```

Best examples: `RentalsList.tsx:1157`, `Documents.tsx:1450`, `Payments.tsx:745`,
`Calendar.tsx:405`. `/finance/payments` uses it for 94 of its 109 buttons.

**The 21 screen-specific dead controls are the exception, not the norm.** The codebase
already knows how to be honest about unbuilt functionality — these just don't do it.
