# Audit Log

**Status: Seed-only**

Route `/admin/audit-log` (`src/App.tsx:651-658`, lazy import `src/App.tsx:44`) · component `src/modules/admin/AuditLog.tsx` · 440 lines.

Also reachable as `/tools/audit-log`, which is a `replace` redirect to the same route (`src/App.tsx:132`). The in-app door is Settings ▸ System (`src/modules/settings/sections/System.tsx:42`); the page is not a `NAV` entry.

---

## 1. What it is

A read-only table of six seeded state-change records, each showing when, who, what action, which entity and a `before → after` diff, with a per-row disclosure that expands the full field list (`src/modules/admin/AuditLog.tsx:171-218`). Three `<select>` filters (entity kind, user, day) narrow the list client-side (`AuditLog.tsx:78-86`). The file carries no write of any kind: it imports nothing from `src/actions/` (`AuditLog.tsx:1-18`), and a test asserts the absence (`src/modules/admin/__tests__/auditLog.viewOnly.test.tsx:71-107`).

---

## 2. What renders

Top to bottom at desktop:

| # | Element | Where |
|---|---|---|
| 1 | `PageHeader` — lock icon, "Audit Log", one-line description | `AuditLog.tsx:99-103` → `src/components/ui/Page.tsx:66` |
| 2 | `KpiStrip`, `columns={4}` — Entries · Voided · Archived · Reversals | `AuditLog.tsx:88-93, 105` → `Page.tsx:203` |
| 3 | Filter row, `role="search"`, three `<select>`s (Entity / User / Date) | `AuditLog.tsx:108-120`; `Filter` at `AuditLog.tsx:377-403` |
| 4a | `EmptyState` when the filtered list is empty | `AuditLog.tsx:122-137` |
| 4b | Card-in-card table when rows exist: `thead` = When · Who · Action · Entity · Before → after · [Network / location] · a 44px disclosure column whose header text is off-screen (`srOnly`, `AuditLog.tsx:428`) | `AuditLog.tsx:152-222` |
| 4b′ | Row body: timestamp, user + role stacked, `ActionPill`, `entityLabel(...)`, first change as `Diff` plus a "+N more" counter, optional IP/location cell, `DiscloseButton` | `AuditLog.tsx:176-208` |
| 4b″ | Expanded row — a second `<tr>` spanning 6 or 7 columns holding `ChangeList` | `AuditLog.tsx:209-215`; `ChangeList` at `312-327` |
| 5 | Retention paragraph: "Append-only. View-only for every role including Owner…" + `RETENTION_NOTE` | `AuditLog.tsx:225-228` |
| 6 | `FooterNote` | `AuditLog.tsx:230` → `Page.tsx:443` |

The table sits in an `overflowX: 'auto'` wrapper with `minWidth` 940 when the network column shows, 780 when it does not (`AuditLog.tsx:153-154`).

**Responsive bands the file actually reads.** `useViewport()` from `src/lib/device.ts` (`AuditLog.tsx:7, 65`). `device.ts:43` defines `BREAKPOINT = { phone: 768, desktop: 1180 }` and `readViewport()` (`device.ts:45-51`) returns phone below 768, tablet below 1180, desktop above.

This file branches on **768 only** — every test is `viewport === 'phone'` (`AuditLog.tsx:113`, `AuditLog.tsx:138`). Tablet and desktop render identically here. What changes below 768:

- the filter grid collapses from `repeat(3, …)` to one column (`AuditLog.tsx:113`);
- the table is replaced by `AuditCard` articles (`AuditLog.tsx:140-150`, component at `237-277`), where the disclosure becomes a full-width "Show detail / Hide detail" button (`AuditLog.tsx:264`, `280-309`) and IP/location moves inside the expanded body (`AuditLog.tsx:268-272`).

The **1180** band does reach the page, but only through a shared component the page does not control: `KpiStrip` clamps to 2 columns on phone and 3 on tablet (`Page.tsx:210-212`). The page file itself never mentions 1180.

---

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| KPI strip (Entries / Voided / Archived / Reversals) | SEED | `AUDIT_METRICS`, counted from the seed rows at `src/data/auditLog.ts:174-179` (`countAction` at `163-165`) |
| Table rows / phone cards (timestamp, user, role, action, entity, changes) | SEED | `AUDIT_ROWS` — six literal objects, `src/data/auditLog.ts:83-159` |
| Entity identifiers ("Invoice INV-45", "Booking B-702") | SEED | `entityLabel` (`src/data/auditLog.ts:77-81`) → `issue()` (`src/data/numbering.ts:417-431`) over the `SEQUENCES` constant (`src/data/numbering.ts:132-220`) |
| Network / location cell | SEED | `ip` / `location` string fields on each row, e.g. `src/data/auditLog.ts:92-93` |
| Filter option lists | SEED | `AUDIT_ENTITY_KINDS` / `AUDIT_USERS` / `AUDIT_DAYS`, derived from the same rows, `src/data/auditLog.ts:191, 194, 197-199` |
| Retention sentence | SEED | `RETENTION_NOTE`, `src/data/auditLog.ts:182` |
| Footer bar text | SEED | `FOOTER_NOTE`, `src/data/nav.ts:428-432` |
| Session role (drives the network-column gate only) | DB | `useAuth()` (`AuditLog.tsx:8, 65`) → `supabase.from('users').select('id, full_name, primary_role')`, `src/lib/auth.tsx:76-80` |
| The real audit trail | DB — **not read by this page** | `audit_events` exists in the generated types with `ip_address`, `user_agent`, `old_values`, `new_values` (`src/types/database.ts:916-935`) and is written by `logAuditEvent` (`src/lib/audit.ts:70-98`) and seeded by `src/lib/seed.ts:1593`. No file under `src/lib/queries/` selects it, and this page issues no query |
| `audit_events` under the local store | LOCAL — **UNSERVED** | Not a key of the mock store (`src/lib/mock/corpus.ts:405-426`) and not listed in `UNSERVED` either (`src/lib/mock/corpus.ts:33-44`), so its absence is not even reported in the mock banner |

Invented on this page: all six trail entries and every field on them — the timestamps, the actor names and roles (Bishal Thapa / Riya Maharjan / Sushant Shrestha), the before→after values, the IP addresses `110.44.112.5` and `27.34.20.1` and the locations Kathmandu/Lalitpur (`src/data/auditLog.ts:83-159`); the four KPI counts 6 / 1 / 1 / 1, which are counts of those invented rows (`src/data/auditLog.ts:174-179`); the identifiers `INV-45`, `B-702`, `C-34`, `PAY-2026-006101` and the asset tags `CAM-001` / `LEN-012`; and the "Retention policy: 7 years" sentence (`src/data/auditLog.ts:182`).

---

## 4. Actions and writes

**Zero dispatches.** `AuditLog.tsx:1-18` imports only React, `Icon`, `Page`, `StateViews`, `device`, `auth` and `data/auditLog` — nothing from `src/actions/`, and `createAction` (`src/actions/core.ts:220`) is never invoked from this file. No capability string is named anywhere in the page or in `src/data/auditLog.ts`.

Every interactive control and what it does:

| Control | Handler | Effect |
|---|---|---|
| `DiscloseButton` (`▸` per row) | `onClick={onToggle}` → `setExpanded(...)` | `AuditLog.tsx:206`, `264`, `282-286` — local `useState` at `AuditLog.tsx:76`. `aria-expanded` is set; nothing is written |
| Three filter `<select>`s | `onChange={(e) => onChange(e.target.value)}` | `AuditLog.tsx:393` → `setEntityKind` / `setWho` / `setDay` (`AuditLog.tsx:73-75, 117-119`) |
| EmptyState "Clear filters" | `onAction` resets the three filter states | `AuditLog.tsx:129-135` |

No button on this page lacks a handler. `src/data/auditLog.ts` exports no mutation helper (asserted at `src/modules/admin/__tests__/auditLog.viewOnly.test.tsx:132-136`).

**For the record on `checkCapability`:** the switch in `src/actions/core.ts:128-217` contains no `audit.*` case. Anything this page ever dispatched under an audit capability would fall to `default: return undefined` (`core.ts:215-216`), and `createAction` refuses on `allowed !== true` (`core.ts:236-241`) — a denial for every role including Owner. Today that is hypothetical: the page dispatches nothing.

---

## 5. Gates

**Who reaches the route.** `Shell` requires a resolved session and otherwise redirects to `/login` (`src/App.tsx:964-975`). Then the Law 6 backstop runs: `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` contains the bare prefix `'/admin'` (`src/data/nav.ts:147-153`) and `isMoneySurface` matches `path === r || path.startsWith(r + '/')` (`src/data/nav.ts:156-159`), so `/admin/audit-log` **is** a money surface. `canViewMoney` is `!MONEY_BLIND.has(role)` with `MONEY_BLIND = Warehouse, Technician, Driver, Client` (`src/lib/rbac.ts:36-38, 45-50`).

- Reach the page: **Owner, Admin, Manager, Coordinator, Accounts**.
- Refused with `RestrictedState` before the component mounts: **Warehouse, Technician, Driver, Client** (`src/App.tsx:1020-1023`). The full role union is at `src/types/database.ts:116-125`.

**Money visibility.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) is **not imported or called** by this page. Nothing on the screen is a currency figure — the KPI values are integer counts (`AuditLog.tsx:88-93`) and no row field holds money (`src/data/auditLog.ts:52-66`). So nothing is hidden under Law 6 *inside* the page; the only Law 6 effect is the route refusal above, which blocks four roles from a screen that shows no money at all.

**The one in-page role branch.** `showNetwork = user?.role === 'Owner' || 'Manager' || 'Admin'` (`AuditLog.tsx:71`). It controls the Network / location column header (`AuditLog.tsx:162`), the cell (`200-204`), the expanded row's `colSpan` (`211`), the table `minWidth` (`154`) and the phone card's IP line (`268-272`). Coordinator and Accounts see every other column. The file states this is the only thing role decides here (`AuditLog.tsx:46-50, 68-70`), and no role unlocks a write because there is none.

---

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx:119`) is **not** used; the page wires `StateViews` directly.

- **Loading — none in this file.** There is no async read to wait on. A skeleton does appear once, drawn by the Shell's `Suspense` fallback while the lazy chunk loads (`src/App.tsx:1026`), not by the page.
- **Error — none.** No error path exists in `AuditLog.tsx`; a module-scope constant cannot fail.
- **Empty — hand-rolled**, `EmptyState` from `src/components/ui/StateViews.tsx:34` called at `AuditLog.tsx:122-137`, with the "Clear filters" action spread in only when at least one filter is set (`filtered` at `AuditLog.tsx:95`, spread at `127-136`).
- **Restricted — not in this file.** Drawn by the Shell for money-blind roles (`src/App.tsx:1020-1023` → `src/components/ui/StateViews.tsx:213`).

---

## 7. Known gaps

1. **The page ignores the real audit trail.** `audit_events` is a live table carrying exactly the columns this screen renders — `ip_address`, `old_values`, `new_values`, `actor_role` (`src/types/database.ts:916-935`) — and it is written on every covered verb by `logAuditEvent` (`src/lib/audit.ts:70-98`) and seeded by `src/lib/seed.ts:1593`. The screen reads six literal objects instead (`AuditLog.tsx:10-18` → `src/data/auditLog.ts:83-159`). No query file selects the table.
2. **The trail is unserved locally and silently so.** `audit_events` is absent from the mock store (`src/lib/mock/corpus.ts:405-426`) *and* from the `UNSERVED` list that populates the mock banner (`src/lib/mock/corpus.ts:33-44`), so in mock mode nothing would announce the gap.
3. **Money-blind roles are refused a page with no money on it.** `'/admin'` in `MONEY_ROUTES` (`src/data/nav.ts:150`) plus the Shell guard (`src/App.tsx:993`) means Warehouse, Technician, Driver and Client get "Access restricted" here. The same file argues the opposite intent in prose: *"Putting `/tools` here instead would hide Audit Log, Activity Log, Numbering and Backup & Restore from the floor, which no spec asks for"* (`src/data/nav.ts:143-145`) — but those four screens moved to `/admin/*` (`src/App.tsx:132-135`), which that list already covers, so the floor is hidden from them regardless.
4. **The test that guards point 3 tests a URL that no longer mounts anything.** `src/data/nav.test.ts:82` asserts `isMoneySurface('/tools/audit-log') === false`; `/tools/audit-log` is only a redirect now (`src/App.tsx:132`), and the destination `/admin/audit-log` returns `true`. The assertion passes and protects nothing.
5. **Stale comment, wrong direction.** `src/data/nav.ts:137` says "`/admin/*` now redirects into `/tools/*`". The redirects run the other way — `/tools/*` → `/admin/*` (`src/App.tsx:132-135`).
6. **The Owner/Admin/Manager set is hardcoded in the page.** `AuditLog.tsx:71` inlines the role test rather than calling `lib/rbac`, which already holds that exact set twice: `BACK_OFFICE` (`src/lib/rbac.ts:99`) and `canMergeClients` (`src/lib/rbac.ts:239-241`). The same three roles are the live `SELECT` grant on `audit_events` (`src/lib/dataAccess.ts:67-71`). Three copies of one rule; no drift today.
7. **The footer contradicts what the page renders.** `FooterNote` prints "All dates are shown in BS above AD" and "Timezone: Asia/Kathmandu (NPT)" (`src/data/nav.ts:428-432`, rendered at `AuditLog.tsx:230`), while `when()` formats the raw UTC instant with no BS line and no NPT offset (`AuditLog.tsx:406-409`). The shared `BsAdDate` component (`src/components/ui/BsAdDate.tsx`) is not imported here.
8. **`expanded` is not cleared when a filter changes** (`AuditLog.tsx:73-86`). A row hidden by a filter keeps its id in state, so clearing the filter brings it back already open. Cosmetic, but it is a state the row's own control did not put it in.
9. **The KPI strip counts the seed and labels it "In this trail"** (`AuditLog.tsx:89`, `src/data/auditLog.ts:174-179`) beside a retention sentence claiming a 7-year policy (`src/data/auditLog.ts:182`). The seed file is explicit that this is deliberate honesty rather than a wired figure (`src/data/auditLog.ts:167-173`); recorded here as the limitation it is.
10. **Two near-identical log screens.** `src/modules/admin/ActivityLog.tsx:1-18` imports the same component set and its own `RETENTION_NOTE` from `src/data/activityLog.ts`; both are linked side by side from Settings ▸ System (`src/modules/settings/sections/System.tsx:42-43`). Nothing in the code distinguishes their data contracts — both are seed arrays.
11. **No `TODO(decision)` markers** appear in `src/modules/admin/AuditLog.tsx` or `src/data/auditLog.ts` (grepped, none found).
