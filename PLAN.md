# Babin Rentals OS — Build Plan

**Read this before writing any code. Every session.**
Then update [`PROGRESS.md`](PROGRESS.md) with what you actually did.

**Specs:** [`../mds and photos/Babin Rentals OS/`](../mds%20and%20photos/Babin%20Rentals%20OS/)
Canonical: `00 Getting Started/Foundation Specification.md`. Where anything disagrees with
Foundation, **Foundation wins**.

---

# 0. The laws — non-negotiable

Break any of these and the work gets reverted, however good it looks.

| # | Law | Where it bites |
|---|---|---|
| 1 | **Pages never implement business logic.** Ten engines own it | Every screen |
| 2 | **Single Query Rule** — one booking query serves every surface. *Hard acceptance gate* | Data layer |
| 3 | **Nothing is deleted** — Cancel · Void · Reverse · Retire · Archive · Deactivate · Close | Schema + UI |
| 4 | **Payments immutable** — corrections are reversal rows referencing the original | Schema |
| 5 | **Deposits are liabilities** — never in Rental Total, never reduce Outstanding, never a payment | Schema + finance |
| 6 | **Warehouse sees no money** — including inside gate checklists. **RLS, not the UI** | Schema + RLS |
| 7 | **Store AD in UTC.** BS is rendered, never stored. All logic on AD | Schema + localization |
| 8 | **Every write carries a client UUID.** Duplicates rejected | Data layer + offline |
| 9 | **Days mandatory on every priced line** — explicitly `1`, never by omission | Schema |
| 10 | **Discount > 10%** needs reason ≥10 chars **and** a named approver; 25% hard cap; **no role bypass, including Owner** → DB constraint, not app check | Schema |
| 11 | **Never colour alone** — every status is icon + label + colour | Components |
| 12 | **Errors inline and persistent.** Toasts carry successes only | Components |
| 13 | **No platform branch in a layout component.** Branch on capability | Everywhere |
| 14 | **Width decides** — 768 / 1180. Never orientation | Layout |
| 15 | **44×44 touch targets** on every device, desktop included | Components |
| 16 | **No AI panel renders** until backed by a validated computation | Screens |
| 17 | **The word "customer" appears nowhere in the UI.** They are clients | Copy |

**Gate accessibility failures are release blockers**, not backlog items.

---

# 1. Where things live

```
babin-rentals-os/
├── PLAN.md              ← this file. Read first, every session
├── PROGRESS.md          ← what has been done. Update at the end, every session
├── README.md            ← setup + the token drift decision
├── supabase/migrations/ ← schema
└── src/
    ├── lib/             ← engines + supabase client
    ├── types/           ← generated DB types
    ├── components/      ← design system primitives
    └── modules/         ← screens, one folder per module
```

**Reference build:** `../../Rental_workspace_backup/babin-rentals-os` — 76 JS files, screens
matching the approved capsule render. Port from it; do not import it wholesale. It has no
data layer, which is the thing being replaced.

---

# 2. Build order

Each phase has a gate. **Do not start a phase until the one before it passes its gate** —
the ordering is dependency-driven, not preference.

## Phase 0 — Scaffold ✅ COMPLETE

TS + Vite + Tailwind v4 + Supabase + router, self-hosted fonts, token layer ported.
**Gate:** `npm run build` passes, renders, zero external requests. ✅

---

## Phase 1 — Schema ⬅ CURRENT

The critical path. 60+ specs assume tables that have never been written down.

- [ ] Postgres DDL — tables, enums in **lifecycle order**, FKs, CHECKs
- [ ] Constraints that enforce laws 3, 4, 5, 9, 10 **at the database**
- [ ] Exclusion constraint so double-booking is impossible, not merely unlikely
- [ ] Triggers: payment immutability, audit append-only, forward-only stages, causal order
- [ ] RLS on every table — role **and** branch **and** warehouse/zone **and** approval limit
- [ ] Column-level money hiding for Warehouse (law 6)
- [ ] Indexes: lifecycle-order status sort, AD date sort, GIST range overlap, serial lookup, `client_uuid` unique
- [ ] Seed data **generated through the engines**, never hand-typed

**Gate:** an adversarial reviewer cannot construct a legal write sequence that produces a
wrong business outcome. Specifically: no path makes a deposit reduce Outstanding; no path
updates a payment; no path lets Warehouse read a money column.

**No longer blocked.** As of 5 Aug 2026 the decisions §4 listed are ruled or dissolved, and
the spec library has had all 117 corrections applied — so the sections the schema reads from
(04–12, 16, Appendix) are safe to build from. The DDL can be written.

Five product questions remain open (§4.4). **None of them blocks a table.** Where one is
touched, mark `TODO(decision)` at the column and keep going — do not invent an answer.

---

## Phase 2 — Types + data access

- [ ] `npm run db:types` → `src/types/database.ts`
- [ ] **One booking query** module. Every surface consumes it (law 2)
- [ ] Write helper that attaches `client_uuid` to every mutation (law 8)

**Gate:** two different screens rendering the same booking cannot disagree.

---

## Phase 3 — The engines

**Before any screen.** Law 1 is unenforceable if screens are built first — the logic ends
up in components and never comes out.

- [ ] **Status** — 12 stages, transitions, flags, sessions, item quantity states
- [ ] **Financial** — the calculation order, rounding half-up per displayed step, reconciliation assertion
- [ ] **Localization** — BS/AD render, locked month spellings, Latin digits, lakh grouping, fiscal year
- [ ] **RBAC** — capability checks; forbidden things are *absent*, not disabled
- [ ] **Discount** — thresholds, stacking, the approval gate
- [ ] **Validation** — return after pickup, quantities within stock, causal order
- [ ] **Audit** — append-only writes

**Gate:** the reference booking `BK-2026-0715` computes to exactly the figures in
`Appendix/Sample Data.md`. Any deviation is a defect in the engine, not the screen.

---

## Phase 4 — Design system in code

- [ ] **Settle the token drift** (§4.1) — one decision, not seventy-six
- [ ] Primitives: Button, Input, Select, Table, Card, Modal/Sheet, Badge, Toast
- [ ] **The seven missing components** — gate checklist · money field (capability-gated) · BS/AD date · scanner input · quantity chip · evidence thumbnail · reconciliation assertion
- [ ] Five states drawn for each: empty (both kinds) · loading (skeleton + text) · error · offline · restricted

**Gate:** remove colour from a screenshot — every status is still distinguishable.

---

## Phase 5 — Shell + navigation

- [ ] Sidebar, header, right rail (collapsible, persisted), status bar
- [ ] Breadcrumbs, **no Back buttons**
- [ ] ⌘K palette · scanner FAB at every width
- [ ] Responsive: 390 / 834 / 1180 / 1920

**Gate:** identical layout at identical widths; no platform branch anywhere.

---

## Phase 6 — Screens, module by module

Port in dependency order. **Each module is done when its five states are drawn.**

`Today` → `Rentals` → `Booking` → `Inventory` → `Clients` → `Calendar` → `Finance` →
operational workspaces (Packing → Handover → Return → Reset → Cleaning) → `Reports` →
`Settings`

Per screen: name its page type (Work/List/Record/Report/Settings), delete every panel the
type disallows, ≤4 KPI cards, ≤1 chart, no AI panels, one primary per row.

**Gate:** every screen classifiable as exactly one page type.

---

## Phase 7 — Auth + shift handover

- [ ] Login, session, **shift handover**, timesheet
- [ ] Biometric unlocks a stored refresh token — **never stores a password**
- [ ] RBAC live: forbidden modules removed from nav; forbidden routes show the permission state

---

## Phase 8 — Scanner

Six workspaces depend on it.

- [ ] Camera (tablet/mobile), keyboard-wedge ⌘+B (desktop)
- [ ] **Under 2s per item**, continuous mode
- [ ] Haptic + green frame + sound on success; **audibly distinct** failure; torch
- [ ] **Manual entry always beside it**

---

## Phase 9 — Offline

- [ ] Dexie write queue, `client_uuid` idempotency
- [ ] Precache shell; stale-while-revalidate reference data; network-first operational reads **with an age badge**
- [ ] Conflict UI naming both sides — never silent
- [ ] Offline **banner**, never full-screen
- [ ] Money and approvals blocked, **with the reason stated**

**Gate:** proven on a real phone, in a real warehouse, in airplane mode. Non-negotiable —
do not start Phase 10 before this passes.

---

## Phase 10 — Shells

PWA → install flows → Capacitor Android → Capacitor iOS → Tauri → store submission.

---

# 3. Every session

1. Read this file.
2. Read [`PROGRESS.md`](PROGRESS.md) — what state is the build actually in?
3. Do the work. Stay inside the current phase.
4. **Verify** — typecheck, build, and drive the running app; do not claim it works from reading code.
5. **Update `PROGRESS.md`** — what changed, what was verified, what is now blocked.

---

# 4. Decisions that block work

**Do not invent answers.** Mark `TODO(decision)` and keep moving on what is unblocked.

## 4.0 ✅ RESOLVED — the design source

**Ruled 4 Aug 2026.** The module specs and the 113 renders in
`../mds and photos/Babin Rentals OS/Appendix/Screenshots/` **are the same design**.

**Build from the module spec, checked against its render.** The spec carries what a
screenshot cannot — lakh grouping, risk lines that only appear above zero, hover formulas,
click targets.

**Superseded:** Page Standard v1.0's correction pass (4-KPI cap, no tiles on Work pages,
7-item sidebar) and Design Tokens v2.0 §1.3's purple ban. Both contradict the module specs
*and* the renders. Purple is legitimate — `Dashboard.md` §5.5 says "Accent purple" in prose.

**Theme is per screen.** The corpus is 107 dark / 6 light by design. Both themes work; each
screen defaults to its render's theme. Today is light.

---

## 4.0b ✅ RULED — the UI typeface is Outfit

**5 Aug 2026.** Outfit, weights **400 / 500 / 600 / 700**, locally bundled `.woff2`,
fallback **`-apple-system, sans-serif`**.

Inter is **dropped** — Design Tokens v2.0 §2.2 named it; the ruling overrides that. Removing
it also cut five unused subsets (greek, cyrillic, latin-ext…) from the bundle.

**JetBrains Mono stays locked for every number** — currency, IDs, serials, dates, quantities,
percentages.

⭐ **Still open:** neither face ships **Devanagari**, so Nepali month names (`साउन`) would
render as tofu. See §4.2.

---

## 4.1 Token drift — blocks Phase 4

Capsule render vs Design Tokens v2.0. Full table in [README](README.md#-token-drift--needs-a-decision-before-the-ui-port).

`--radius-card` 14 vs **8** · `--radius-sheet` 20 vs **14** · `--radius-field` 10 vs **6** ·
`--rail-w` 264 vs **240** · `--head-h` 56 vs **64/56** · motion 200/260 vs **180/240/320** ·
**Outfit vs Inter** · Material Symbols vs **Tabler**

Colours need no decision — all six already match the spec exactly.

## 4.2 Devanagari font — blocks the Nepali toggle

Foundation §3.3: under Nepali, month names render in Devanagari (`साउन`). **Neither Outfit
nor Inter as installed ships Devanagari** — those glyphs would render as tofu. A
Devanagari-capable face is needed.

## 4.3 ✅ RESOLVED — roles: **six**

**Foundation §08 wins on role vocabulary**, per the 4 Aug audit. The six are:

```
Owner · Manager · Warehouse · Billing · Accounts · Viewer
```

The Permissions Matrix screen's twelve are **screen labels, not engine roles** — Foundation
is explicit that modules may never redefine permissions, so where the matrix names a
thirteenth actor it is naming a job title, not a capability set. RLS is written against the
six. Unblocks Phase 1 RLS and Phase 7.

## 4.4 ✅ MOSTLY RESOLVED — schema decisions

**All 11 ⛔ schema-blocking conflicts were ruled 4 Aug 2026**
([Spec Conflicts](../mds%20and%20photos/Babin%20Rentals%20OS/00%20Getting%20Started/Spec%20Conflicts.md)),
and the Corrections Backlog — applied in full 5 Aug — showed most of the rest were already
specified and had been wrongly logged as gaps.

| Was listed as blocking | Actually |
|---|---|
| Transfers have no in-transit state | **7-state flow, In Transit among them** (Warehouse v3.0) |
| Consumables aren't modelled | **Tracking mode on every record** — serialised · quantity · consumable (Add Equipment §5.1) |
| Credit-limit engine undefined | **Derived from membership level**, read-only, gated override; breach is Critical and blocks Confirm |
| Depreciation method + acquisition cost | **Straight line**, per-category lives, 10% residual; purchase price + date captured (Add Equipment §10.1) |
| No chart of accounts | **Correct, and deliberate** — no general ledger in v1 (ruling A) |
| Serialisation policy | **Per-record declaration**, not a category rule |
| Sub-rental markup fixed or per line | **Per line** — and it is gross margin on revenue, never markup on cost |
| Retention vs "nothing is deleted" | **Parent record permanent; only detail ages out** |

**Genuinely still open — and none of these blocks the DDL:**

- ⚠ **`Dashboard.md` §5.7's throughput figure does not reconcile with its own §5.2/§5.3.**
  The strip reads *"12 of 25 movements completed today"*. The **25** is exactly §5.2's 14
  pickups + §5.3's 11 returns and is reproduced in the build. The **12** cannot be derived:
  §5.2 gives 6 completed pickups, and §5.3's 11 returns are all still open (4 overdue +
  7 expected), so the completed count can only be **6**. §5.8 requires one query and card
  counts that equal the panel counts, so the strip derives its figure and currently reads
  "6 of 25". **Confirm 6, or say which movements the 12 counts.** `data/today.ts`.
- ⚠ **`Dashboard.md` §17 says card radius 14px**; Theme Design System v1.0 says 16px, and
  the whole app is 16. Neither is Foundation, so neither wins automatically. Kept at 16 —
  a one-page radius would break shell consistency. **Amend §17 to 16, or say Today is the
  exception.** `theme.css` `--r-card`.
- ⚠ **`Dashboard.md` §3 shows the date pill as `2083/04/17`** (numeric, no suffix).
  Foundation §3.2/§3.3 require BS to lead *with a "BS" suffix* and the locked month
  romanization, which gives `16 Shrawan 2083 BS`. Foundation wins per CLAUDE.md and that is
  what ships. **Confirm, or say the pill is a deliberate numeric exception.**
- ⚠ **`Calendar.md` — the mini-month cannot show BS on every cell.** `lib/bs.ts` vouches for
  Shrawan 2083 only (16 Jul – 16 Aug), so 1–15 July render their AD day where the BS day
  belongs. Fixing it needs the neighbouring BS month lengths (Ashadh and Bhadra 2083), which
  is real calendar data — **not something to infer**. Same blocker keeps `CAL_EVENT_DAYS`
  beyond today on seed values: a movement carries a time, not a date.
- ⚠ **`Dashboard.md` §16 — one booking ID format.** `BK-2026-0715` (Rentals, Today) or
  `BR-2613` (the workspaces). The build uses `BK-YYYY-NNNN` throughout; the render's
  workspaces still show `BK-2026-2613`, which is the BK form with the BR number. Pick one.
- ⚠ **`Dashboard.md` §19 — three the spec itself flags.** Are §5.4's three at-risk buckets
  the right three? Where does "6 crew available today" come from — a roster, or headcount
  minus leave? And is Utilization the top 10 assets by value or the whole fleet? The card
  says top 10; §19 suspects it should be the fleet.
- **Cases and Weight in the item master** — are they there today, or to be added?
- **Insurance** — percentage or flat, and is it taxable?
- **Deposit per item or per category** — the percentage exists; where it is configured does not
- **When `Missing` becomes `Lost`** (Inventory §13)
- **Profit per booking** — the one profitability dimension no spec owns

## 4.5 Carried from the specs

Deposit Pending blocks Confirm or only Handover? · Warehouse handover with payment
outstanding? · mandatory evidence minimums · the green Verified tick (raised five times) ·
Crew Assist's home · Executive Dashboard deleted (confirm) · auto-lock timeout ·
screenshot blocking on financial screens · Client Portal as an app?

---

# 5. Conventions

**TypeScript strict**, incl. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
`@/` → `src/`. Icons **Tabler** outline 2px. **JetBrains Mono for every number.**
Money `numeric(14,2)` — never float. snake_case in the DB, camelCase in TS.

**Never**: a `DELETE`; an `UPDATE` on payments or audit; a hardcoded VAT rate; a hex value
in a component; a per-screen seed array; a second dashboard; a second codebase.

---

# 6. External audit reconciliation — 8 Aug 2026

The user pasted a 44-section "Full Product Audit & Development Blueprint" (external, source
unstated) proposing a from-scratch IA and a 40-page build list. Reconciled against this file
and the current build rather than actioned wholesale — most of it either restates a law
already here or repeats a fight already settled. Two genuine, previously-unknown bugs came
out of doing this properly; those are the real yield.

## 6.1 Settled, not reopened — "Customer" naming and sidebar width

The audit's §4/§39 propose renaming Clients → Customers and a 13-section sidebar. This is
the **third** time this exact shape has surfaced:

1. The original Generation C renders carried a 15-item numbered sidebar — `data/nav.ts`'s own
   header comment documents rejecting it ("the renders were the defect").
2. Earlier this session, a design pack (2 screenshots + 2 spec `.md`s) proposed the same
   13-item "Customers" nav from Global spec §6. Asked the user directly; they chose **Client**
   — keep law 17 and the existing 8-item nav.
3. This audit proposes it again.

**Ruling: closed.** Law 17 and the 8-item nav (§5.1 in `data/nav.ts`) stand. Do not re-ask
this question from a fourth source without new information — cite this entry instead.

One thing the audit's §39 gets right without realizing it already happened: Operations
Queues → "Operations" with Packing/Handover/Return/Reset/Cases as **children**, not flat
top-level items, is exactly what `data/nav.ts` already does. Same for Crew Assist (kept,
because `CrewBooking.tsx` is a real workflow, not a stub) and Calendar (top-level). The
8-item nesting nav already satisfies most of §39's actual complaint (flat-list sprawl)
without adopting its 13-item structure.

## 6.2 Two real bugs this audit corroborated

**1. Dark theme's primary button is still gold, not blue.** Measured live in this session
(`getComputedStyle` on the Save button, dark theme): `background: rgb(216,169,58)`,
`color: rgb(0,0,0)` — i.e. `--btn-primary-bg`/`--btn-primary-fg` in `theme.css`'s dark block
are still `#d8a93a`/`#000`. This audit's §30 ("avoid yellow as the primary action color")
and the earlier design pack's Global spec §2.2 ("blue replaces yellow/gold... never the
default CTA color") both say the same thing independently — and the 5 Aug PROGRESS.md entry
claims *"the gold-as-primary problem in the older design system was already fixed in the
capsule build."* That claim is about the **reference render**, not this codebase:
`theme.css`'s dark tokens were never actually migrated. `NewRental.tsx` §13 already worked
around this locally ("the workspace primary is blue in *both* themes... where the app
primary is gold") rather than fixing the token — so every other screen using
`<Button variant="primary">` in dark mode ships gold. TODO(decision): settle this as part of
§4.1 (token drift, already blocks Phase 4) rather than patching it screen by screen again.

**2. §4.3 ("roles: six") is stale.** `lib/rbac.ts`'s own header comment: *"the business 8
(ruled 8 Aug 2026)"* — Owner · Admin · Coordinator · Warehouse · Technician · Accounts ·
Driver · Client. That is eight, live in code, dated **today**, and it does not match this
file's §4.3 ruling of six (Owner · Manager · Warehouse · Billing · Accounts · Viewer). One of
these two rulings is the one actually in force; §4.3 needs a re-ruling entry pointing at
whichever is current, not two documents disagreeing about how many roles the RBAC engine has.

## 6.3 Already covered — no new decision needed

Payment immutability (§13/§25/§27 ↔ laws 4/5/10, already enforced and verified —
"§10.8 discount hard-block verified in four states"), single source of truth (§2 ↔ law 2,
Phase 3's ten engines), rental lifecycle (§10 ↔ the 12-stage status engine in
`lib/workflow.ts`), return/inspection flow (§12 ↔ `ReturnWorkspace.tsx`, already built and
verified), responsive/capability rules (§29/§30 ↔ laws 13/14, `lib/device.ts`), five-states
gate (§32 ↔ Phase 4's own gate), offline conflict handling (§35 ↔ all of Phase 9), AI
restraint (§37 ↔ law 16), command palette (§16 — `CommandPalette.tsx` already exists),
audit log (§18 — `lib/audit.ts` + `/admin/audit` already exist, though nothing calls
`logAuditEvent` yet), notification triage (§17 — `BroadcastCenter.tsx`/`SmsCenter.tsx`/
`UnifiedInbox.tsx` already exist).

## 6.4 Genuinely missing — confirmed by reading the code, not assumed

- **Client/Customer Detail page.** No `/clients/:id` route exists — `ClientsDirectory.tsx`
  only ever shows a right-rail summary panel, never a full profile page. Audit §7/§38#8.
- **Import Center.** `ClientsDirectory.tsx`'s Import button is `disabled`, reason on file:
  *"no CSV mapping or duplicate-merge step exists."* Audit §21/§38#15.
- **Duplicate/Merge Center.** Same disabled-button reason names this directly. This session's
  Add Client page added a first, narrow instance (phone-match warning on one form) — not a
  merge workflow. Audit §22/§38#16.
- **Bulk Actions.** `ClientsDirectory.tsx` has row-selection checkboxes and a "N selected"
  counter with nothing wired to them yet. Audit §20/§38#27.

Everything else in the audit's §38 "must build" list needs a one-by-one check against
`src/modules/*` before being trusted as missing — several (Rental Detail, Equipment Unit
Detail, Damage/Missing workflow, System Health, Audit Log, Notification Center) already exist
under the names this codebase settled on, just not the audit's names.

## 6.5 Likely not applicable to this product

§3 P0.6 and §37 both carry an oddly specific "no charging functionality/workflows/statuses"
exclusion. Nothing in this product's domain (camera, grip, lighting, audio rental) has a
charging concept — reads like a carried-over constraint from a different template the audit
was built from. Not adopted as a law; flag to the user if it turns out to mean something
domain-specific.

## 6.6 Process note — Phase 1 is still open while Phase 4–6 work continues

This file's own rule (§2): *"Do not start a phase until the one before it passes its gate."*
Phase 1 (schema) is marked current and its checklist is unchecked, yet PROGRESS.md shows
extensive Phase 4 (design system), Phase 5 (shell/nav) and Phase 6 (screens — Today, Rentals,
Booking, Inventory, Calendar, Operations, Finance, Clients all substantially built) already
done on mock/seed data. The audit's own §41 phase order would have the schema finished before
more screens — which is just this file's rule, restated by an outside reader. Not re-litigating
the sequencing choice here, only naming it: it is a live divergence from this file's own gate,
not a hidden one.
