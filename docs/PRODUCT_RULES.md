# Babin Rentals OS — Product Rules & Durable Laws

**Authority:** Binding. Supersedes all historical specifications, wireframe notes, and audits.

---

## 1. The Core Architectural Laws

| # | Law | Invariant & Enforcement |
|---|---|---|
| **Law 1** | **Pages never implement business logic** | Engines (`src/lib/`) and server actions (`src/actions/`) own calculations and state transitions. Components only present and collect input. |
| **Law 2** | **Store AD in UTC; BS is rendered, never stored** | All database timestamps and interval ranges are Gregorian UTC (`timestamptz`). Bikram Sambat is a presentation layer rendered via `src/lib/bs.ts`. |
| **Law 3** | **Nothing is deleted; every entity has a terminal action** | Soft-deletes or terminal states (`Archived`, `Voided`, `Deactivated`, `Cancelled`) apply to every record. Postgres grants no `DELETE` on operational tables. |
| **Law 4** | **Payments are immutable** | Once inserted, a payment cannot be edited or deleted. Corrections are made via matching reversal rows (`Refund` or `Adjustment`). |
| **Law 5** | **Deposits are liabilities** | Deposits never reduce Rental Total or Outstanding balance. They are held in trust and resolved independently through `Released` or `Applied` movements. |
| **Law 6** | **Warehouse sees no money** | `Warehouse`, `Technician`, `Driver`, and `Client` roles are strictly money-blind. Enforced by Postgres column-level permissions and RLS views (`auth_can_view_money()`), not CSS. |
| **Law 7** | **Monotonic document numbering** | Numbers are minted by database sequence generators (`next_document_number()`) and cannot be reused or reset by clients. |
| **Law 8** | **Idempotent writes with `client_uuid`** | Every mutating action carries a client-generated UUID. Duplicate submissions return the existing row and create no duplicate side effects. |
| **Law 9** | **Rental duration ≥ 1 day with half-open intervals** | Rental schedules use `[start_date, end_date)`. Same-day turnaround is accepted when the end time does not overlap the subsequent pickup. |
| **Law 10** | **Ungated discounts** | Discounts are entered as business inputs without artificial approval ceilings, obeying the R-39 fewest-clicks mandate. |
| **Law 11** | **Never color alone** | Status indicators must pair color with explicit text labels, icons, and accessible aria attributes. |
| **Law 12** | **Errors inline, toasts for successes only** | Refusals and validation errors render inline beside the affected controls. Toast notifications dwell for successes with optional link actions. |
| **Law 13** | **Touch target floor** | Interactive controls carry a minimum 56px touch target for primary floor verbs (44px min for secondary desktop actions). Minimum supported viewport is 360px. |
| **Law 14** | **Desktop breakpoint is 1280px** | Breakpoints: Mobile (360–767px), Tablet (768–1279px), Desktop (1280px+). The legacy 1180px threshold is superseded. Layout components contain no platform branches. |
| **Law 15** | **Clients, never customers** | The word "customer" appears nowhere in the UI or client-facing terminology; they are "clients". |
| **Law 16** | **No unvalidated AI panels** | No fabricated AI assistants, mock intelligence panels, or unbacked compliance flags. Every action must represent an authentic operation. |

---

## 2. Permission Laws (P1–P10)

1. **P1 — Deny by default:** Any capability not explicitly granted is denied. Unauthenticated sessions resolve to `Client`.
2. **P2 — Enforce in Postgres, mirror in UI:** RLS and triggers are authoritative; UI gating mirrors database rules to prevent dead ends.
3. **P3 — UI ⊆ DB:** A UI must never permit what the database policy refuses.
4. **P4 — Money-blindness is a role invariant:** Money fields are stripped at the database layer for money-blind roles.
5. **P5 — No Delete capabilities:** Verbs are `Archive`, `Void`, `Reverse`, or `Deactivate`.
6. **P6 — Audited overrides:** All overrides carry actor, role, timestamp, and audit reason (≥10 chars).
7. **P7 — Approval ladder:** `Owner > Admin > Manager > Coordinator = Accounts > Warehouse = Technician = Driver > Client`. Self-approval is barred.
8. **P8 — Client Portal data isolation:** Portal accounts access strictly their own client records via verified JWT claims.
9. **P9 — System roles immutable:** The 9 system roles are fixed in the database enum and cannot be altered at runtime.
10. **P10 — Reversible operational errors:** Operational mistakes provide audited correction paths rather than destructive resets.

---

## 3. Active Binding Rulings

- **R-39 (19 Sep 2026):** Fewest clicks is #1 product priority. Every workflow carries a strict tap budget. Prefilled defaults are doctrine.
- **R-40 (21 Sep 2026):** Stage transitions are fail-closed (`queueOnFailure: false`). Floor verbs read `bookings.stage` back before completing. Design tokens protected against drift.
- **R-41 (21 Sep 2026):** Unresolved pending damage findings block rental closure in the database transition trigger (`GATE:gate.close.damage_pending`).
- **R-42 (21 Sep 2026):** Alternate auto-checkout (`completePickup`) retired. Exactly one checkout path: Handover Workspace → `runFloorVerb('Handover')`.
- **R-43 (21 Sep 2026):** Atomic booking creation: `create_booking` inserts booking, crew lines, and transport in a single transaction.
- **R-36 (9 Sep 2026):** Booqable synchronization removed; Babin Rentals OS is an independent standalone system.
- **R-35 (8 Sep 2026):** `check:lifecycle` is a mandatory merge gate.
- **R-26 (8 Sep 2026):** Inventory reservations are created authoritatively by database triggers with GiST exclusion constraints.
