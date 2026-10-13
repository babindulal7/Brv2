# Babin Rentals OS — PERMISSIONS
**v1.0 · 22 Bhadra 2083 BS · 7 Sep 2026**
Location: `docs/PERMISSIONS.md` (beside Foundation v3.0 and UI_UX.md)

> ## ⛔ VERIFIED 7 Sep 2026 — read §16 before building from §4, §5, §9 or §12
>
> Filed and then checked against the code, the repo migrations and the live database the same
> day. **The rulings are sound and are not in question** — Admin ⊇ Manager, the payment soft
> gate, client create/block, the Owner-only list, the ⭐ defaults. What did not survive is the
> repo-side layer:
>
> - **§4's ✓ column is 26% accurate.** Of 31 rows marked "already declared in the repo", 7 name
>   a string that exists nowhere and 16 more name a real string with a different role set.
>   **14 capability strings that live in the code appear nowhere in §4** — including
>   `operations.perform`, which four implemented floor actions declare.
> - **Two rows grant Admin what the live database refuses** (§4.3 `purchase.approve`, and damage
>   approval in §4.3/§6.1/T-9). Per §0 the stricter side wins, so both are corrected below —
>   the one place the schema implements an approval ladder, it is Owner · Manager, not M+.
> - **§5's enforcement is described in the present tense but is not live.** The live ledger runs
>   …0077, 0078, then jumps to **0089**; 0079–0088 and 0090–0096 are unapplied, including 0092,
>   the money-column write trigger §5 item 3 cites. All 26 `_v` views are INSERT-able by `anon`,
>   so the column masking of item 2 is writable-through today.
> - **One live defect this document would have shipped:** `case.resolve` resolves to
>   `isStaff()`, so Warehouse, Technician and Driver can set a damage disposition **and cost**
>   right now. That is a money write by a money-blind role — P4 and N-1, not a gap.
>
> Full table with evidence in **§16**. Corrected rows below carry ⛔ inline. Version is **v1.2**;
> the header's v1.0 and §14's v1.1 entry both predate this pass.

> One document owns who may do what. Every module spec, every RLS policy, every `rbac.ts` check reads from here. Where code disagrees with this document, the **code is the defect** — unless the disagreement is a DB policy that is *stricter*, in which case this document is amended to match (a UI gate more permissive than RLS is the dangerous direction).

---

## 0. Precedence and scope

| Rule | Statement |
|---|---|
| Authority | This file supersedes every role/permission table inside module specs: Foundation v1.x §08, Administration v3.1 §1/§7, the 22 Jul RBAC grid, Automation/Communication v3.1 permission tables, Crew v3.2 §permissions, Handover v1.1 §13, Finance v2.1 §RBAC. Those sections become one line: *"Permissions: see PERMISSIONS.md §4."* ⛔ **Scoped 8 Sep:** every spec named here (Foundation, Administration v3.1, Crew v3.2, Handover v1.1, Finance v2.1, the 22 Jul grid) lives in `ARCHIVE/mds and photos/` **outside this repo** and is already retired by being there — there is nothing in the repo to rewrite. The one in-repo set that *looks* like a target, `docs/pages/*.md`, is **not** one: it records what the code gates on with a `file:line` per predicate, and §16 measured this document's own catalogue at 26% against it. Replacing those Gates tables with a pointer would delete the better source. They carry a cross-reference instead. |
| Newest wins | Per RULINGS-2026-09-04 — this is the newest ruling on permissions. Silence elsewhere is not supersession. |
| Role set | **9 roles as in code**: `Owner · Admin · Manager · Coordinator · Warehouse · Technician · Accounts · Driver · Client`. Values stay Capitalised in the `system_role` enum; nothing is renamed. |
| Scope | Every module — built, light-v1 and parked (Crew Assist full, Communication Center, Automation Center, AI Assistant, Client Portal). Parked modules inherit their cells when built; nobody re-decides them. |
| Fixed in v1 | The matrix is **code + RLS**, not data. Settings ▸ People & Access *shows* it read-only. Changing a cell is a migration + `rbac.ts` edit + test update, exactly like a numbering format. (An editable matrix UI would be the Numbering editor again — a saved-looking screen that changes nothing or breaks a policy.) |
| Vocabulary | "Client", never "customer". Money renders `Rs 1,23,456`. Booking numbers `#<n>`. |
| Build-time authority | **Claude may resolve any conflict, gap or ambiguity it meets while building — in this document, a spec, code or a migration — without stopping to ask**, under the conditions in §15. Every such decision is logged as a ruling Babin can flip. |

---

## 1. Ten permission laws

These sit beside PLAN.md's 17. Numbered P1–P10 so they can be cited.

| # | Law | Why |
|---|---|---|
| **P1** | **Deny by default.** A capability not mapped in `checkCapability` denies every role including Owner. An unidentified session resolves to `Client` and reads nothing staff-side. | Already the code's behaviour since 11 Aug; this makes it a law so nobody "fixes" it. |
| **P2** | **Enforce in Postgres, mirror in UI.** RLS + write triggers are the enforcement. `rbac.ts` exists so screens can hide and disable *before* the DB refuses — never as the only check. | Law 6 lesson: three Handover revisions hid money in the UI and the role still saw it. |
| **P3** | **UI ⊆ DB.** For every capability, the roles `rbac.ts` allows must be a subset of the roles the RLS policy admits. Test-asserted (§12). | A UI that offers what the DB refuses produces a "saved" toast on a failed write. |
| **P4** | **Money-blind is a role property, not a screen property.** `Warehouse · Technician · Driver · Client` never receive an amount — not in a row, a gate checklist, a hover card, a CSV, a WhatsApp template or the DOM. Omit, never blank. | Foundation v1.3, Law 6, `auth_can_view_money()`. |
| **P5** | **Nothing is deleted, so nothing has a Delete permission.** Archive / Void / Reverse / Deactivate are the verbs. The only true deletes: an unused template, an unstarted draft. | Law 3. |
| **P6** | **Every override writes audit.** Overbooking override, gate override, block, merge, reversal, counter reset, restore — each carries actor, role, reason (≥10 chars where stated) and the record. Audit is append-only for everyone including Owner. | 21 Jul, Admin v3.3 §26. |
| **P7** | **Approval follows the ladder.** `Owner > Admin > Manager > (Coordinator = Accounts) > (Warehouse = Technician = Driver) > Client`. A role can approve only what this document names; nobody approves their own submission. | His ruling 7 Sep: Admin is the boss; Manager runs daily operations and reports. |
| **P8** | **Floor identity is a PIN, not a role.** On shared floor devices `staff_auth_pins` identifies *who* performed the verb; it never widens *what* the device's role may do. | `staff_auth_pins` exists; audit needs a person per row (Cleaning v3.1). |
| **P9** | **Client is external.** `auth_is_staff()` is false for `Client`. Client reads only rows joined to its own `client_id`. Client has exactly four write actions (§7). Staff directory (`staff_directory_v`) is readable by all internal staff roles via `auth_is_staff()`, strictly closed to Client and anon (Babin ruling 3 Oct 2026, 0148). | 22 Jul portal upgrade, 4 Aug one-page portal, 3 Oct ruling. |
| **P10** | **A denial is quiet unless the user is acting.** Hidden from nav (✕), rendered without the gated part (◐), or a disabled primary naming the gate. Never a toast, never "permission denied" for money — the figure simply is not there. | Ease of use wins conflicts (29 Aug). `PageBody` order: restricted → error → loading → empty → children. |

---

## 2. The nine roles

| Role | Who this is at Babin | One-line grant | Money |
|---|---|---|---|
| **Owner** | Babin | Everything, plus the Owner-only list (§6.2). | All |
| **Admin** | The boss / deputy owner | Everything **Manager** can do **plus** system: users (up to Manager), Settings writes, branches, integrations, backups (run), Automation. Not the Owner-only list. | All |
| **Manager** | Runs daily operations and reports | All floor verbs, all approvals under threshold, block/merge clients, overbooking override, payment reversals, cancel after Packed, Reports in full. **Settings view only.** No users, no integrations, no backups. | All |
| **Coordinator** | Rental coordinator / front desk (Sales folded in) | Bookings end to end (create · confirm · edit · extend · cancel before Packed), Clients create/edit, **Payments full** (records advance and more — 22 Jul), Quotes/Invoices/Agreements generation, comms drafts, Sub-rental + Suppliers. Floor verbs allowed. | **Booking money + client balance/deposit only.** No purchase cost, ROI, utilisation %, P&L, payout rates. |
| **Warehouse** | Floor staff, equipment caretaker | Pack · Handover · Return · Reset; scan; stock check; equipment identity/units/location/labels; raise damage/missing/maintenance; create a booking (no discount line); walk-in client (commercial section not rendered); submit own expenses. | **None.** Gate checklist reads "Payment required" with no amount. |
| **Technician** | AC / prep technician | Return triage (shared with Warehouse), Reset, Maintenance jobs and Cases (write), equipment condition at intake. **View-only on Packing Queue and Scan** (22 Jul). | None |
| **Accounts** | Accountant | Finance in full: record payments, issue/void invoices with credit note, expenses entry + approval under threshold, deposit refund confirmation, VAT/registers, all Reports. Suppliers (with Coordinator). Crew payouts + TDS. **No payment reversals** (⭐ §13). No floor verbs, no booking edits. | All |
| **Driver** | Delivery / logistics | Own assigned trips: read booking header, items, destination, receiver phone/address **inside the trip only**. Submit own fuel/transport expenses. Nothing else. | None |
| **Client** | External — a production house's people | Portal only (§7). | Own invoices/payments/deposit only |

**Staff** = every role except Client.

### 2.1 What separates Admin from Manager (his 7 Sep ruling)

```
Admin   = boss         → Manager's grant + system configuration
Manager = daily ops    → floor, approvals under threshold, reports; reads Settings, cannot write them
```

If a future rule needs "the boss but not the owner", it goes to Admin. If it needs "whoever is running the floor today", it goes to Manager. Owner-only items never move down (§6.2).

---

## 3. Module × role grid

Legend: **✅** Full · **👁** View · **◐** Limited (explained in §3.1 by code) · **✕** None — hidden from nav and unroutable (direct URL → `RestrictedState`).

| Module / surface | Owner | Admin | Manager | Coord. | Ware-house | Tech. | Accounts | Driver | Client |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Dashboard** (jobs only, no money KPIs) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 | ◐ D1 | ✕ |
| **New Rental** (full page) | ✅ | ✅ | ✅ | ✅ | ◐ W1 | ✕ | ✕ | ✕ | ✕ |
| **Operations — Pack** | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 | ✕ | ✕ | ✕ |
| **Operations — Handover** | ✅ | ✅ | ✅ | ✅ | ◐ W2 | 👁 | ✕ | ◐ D2 | ✕ |
| **Operations — Return & triage** | ✅ | ✅ | ✅ | ✅ | ◐ W3 | ◐ W3 | ✕ | ◐ D2 | ✕ |
| **Operations — Reset** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ |
| **Operations — Cases** (damage/missing) | ✅ | ✅ | ✅ | ◐ C1 | ◐ W4 | ◐ W4 | ◐ A1 | ✕ | ◐ P1 |
| **Rentals — Bookings** | ✅ | ✅ | ✅ | ✅ | ◐ W5 | 👁 | ◐ A2 | ◐ D3 | ◐ P2 |
| **Rentals — Productions** | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 | 👁 | ✕ | ✕ |
| **Rentals — Sub-Rental + Suppliers** | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 | ✅ | ✕ | ✕ |
| **Calendar** | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 | 👁 | ◐ D1 | ✕ |
| **Crew Assist** (light v1 → full, parked) | ✅ | ✅ | ✅ | ◐ C2 | ✕ | ✕ | ◐ A3 | ✕ | ✕ |
| **Inventory — Equipment** | ✅ | ✅ | ✅ | ◐ C3 | ◐ W6 | ◐ T1 | ◐ A4 | ✕ | ✕ |
| **Inventory — Bundles** | ✅ | ✅ | ✅ | ◐ C3 | ◐ W7 | 👁 | 👁 | ✕ | ✕ |
| **Inventory — Stock Check** | ✅ | ✅ | ✅ | 👁 | ✅ | ✅ | 👁 | ✕ | ✕ |
| **Inventory — Maintenance** | ✅ | ✅ | ✅ | 👁 | ◐ W8 | ✅ | ◐ A4 | ✕ | ✕ |
| **Inventory — Purchase Requests** | ✅ | ✅ | ◐ M1 | ◐ C4 | ◐ W9 | ◐ W9 | 👁 | ✕ | ✕ |
| **Clients** | ✅ | ✅ | ✅ | ◐ C5 | ◐ W10 | ◐ T2 | ◐ A5 | ◐ D4 | ◐ P3 |
| **Finance — Dashboard** | ✅ | ✅ | ✅ | ✕ | ✕ | ✕ | ✅ | ✕ | ✕ |
| **Finance — Invoices** | ✅ | ✅ | ✅ | ◐ C6 | ✕ | ✕ | ✅ | ✕ | ◐ P4 |
| **Finance — Payments** | ✅ | ✅ | ✅ | ✅ | ✕ | ✕ | ◐ A6 | ✕ | ◐ P4 |
| **Finance — Expenses** | ✅ | ✅ | ✅ | ◐ E1 | ◐ E2 | ◐ E2 | ✅ | ◐ E2 | ✕ |
| **Finance — Documents** | ✅ | ✅ | ✅ | ✅ | ◐ W11 | 👁 | ✅ | ✕ | ◐ P5 |
| **Reports** | ✅ | ✅ | ✅ | ◐ C7 | ◐ W12 | ◐ W12 | ✅ | ✕ | ✕ |
| **Tools — calculators** | ✅ | ✅ | ✅ | ✅ | ◐ W13 | ◐ W13 | ✅ | ✕ | ✕ |
| **Tools — Admin: Audit Log** | 👁 | 👁 | 👁 | ✕ | ✕ | ✕ | 👁 | ✕ | ✕ |
| **Tools — Admin: Backup & Restore** | ✅ | ◐ AD1 | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Tools — Admin: Numbering** | ✅ | 👁 | 👁 | ✕ | ✕ | ✕ | 👁 | ✕ | ✕ |
| **Settings — General** | ✅ | ✅ | 👁 | 👁 | ✕ | ✕ | 👁 | ✕ | ✕ |
| **Settings — Financial** (money-gated tab) | ✅ | ✅ | 👁 | ✕ | ✕ | ✕ | 👁 | ✕ | ✕ |
| **Settings — People & Access** | ✅ | ◐ AD2 | 👁 | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Settings — Branches** | ✅ | ✅ | 👁 | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Own profile** (theme, text size, language, PIN) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Communication Center** (parked) | ✅ | ✅ | ✅ | ◐ C8 | ◐ W14 | ✕ | ◐ A7 | ✕ | ✕ |
| **Automation Center** (parked) | ✅ | ✅ | 👁 | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **Notifications** (own inbox) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **AI Assistant** (roadmap) | ◐ AI | ◐ AI | ◐ AI | ◐ AI | ◐ AI | ✕ | ◐ AI | ✕ | ✕ |
| **Client Portal** | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✅ |

Staff never see the Client Portal as themselves; a Coordinator opening it uses "View as client" from the client record (read-only, audited).

### 3.1 Limited cells explained

| Code | Role | What "Limited" means |
|---|---|---|
| **W1** | Warehouse | May create and confirm a booking (matches applied RLS `bookings_insert`, `booking_stage_transitions_insert`). Cannot add a discount line (`booking_discounts_money_blind`) — the whole RPC is rejected, never silently dropped. Pricing rail, totals and advance figures not rendered. |
| **W2** | Warehouse | Completes handover sessions: scan, checklist, signatures, evidence. Payment/deposit gates render **pass/fail with no amount**. May release with payment outstanding **after the warning, logged** (his ruling; 21 Jul soft gate). Cannot override receiver-verification. |
| **W3** | Warehouse · Technician | Full return triage (scan-in, OK/Flag, Damage photo, Missing note, condition). Enters damage description/evidence/severity — **no cost field**. Deductions and refund figures not rendered. |
| **W4** | Warehouse · Technician | Raise a case, add evidence and notes. Cannot set disposition, cost or close. |
| **W5** | Warehouse | List and detail without money; row action = the next floor verb only. No cancel, extend, edit dates. |
| **W6** | Warehouse | Add equipment (Quick Add name + serial), edit identity/units/location/condition-at-intake, print labels, move rack/shelf/case. **Purchase and Pricing sections not rendered.** No retire or bulk stock adjustment. |
| **W7** | Warehouse | Sees bundle contents and per-model availability; rates and savings hidden; cannot edit bundles. |
| **W8** | Warehouse | Create a maintenance job (item → Maintenance, blocks availability). Cannot approve cost or clear. |
| **W9** | Warehouse · Technician | Draft a purchase request; cannot approve. |
| **W10** | Warehouse | Directory names/phones for the walk-in and floor; **create walk-in client with §3 Commercial not rendered** (membership None, credit Rs 0). No balances, deposits, credit, PAN/ID documents. |
| **W11** | Warehouse | Operational documents (packing list, delivery note, agreement for signature) with **prices suppressed**. No invoices, receipts, quotes. |
| **W12** | Warehouse · Technician | Operational reports only (pickups, returns, overdue counts, packing, inspections, maintenance/downtime). **No Rs, no utilisation %, no ROI.** |
| **W13** | Warehouse · Technician | Camera/lens/production calculators and depreciation *tool* for own use; finance calculators (rental price, VAT, profit, depreciation values) not rendered. |
| **W14** | Warehouse | Read conversations attached to a booking they are working; send **lifecycle** WhatsApp/SMS drafts (ready/pickup-tomorrow/return-reminder). Money templates (receipt, balance due) not offered. |
| **T1** | Technician | Equipment view + edit condition/meter counters/service notes; create maintenance job; no purchase, pricing, retire, location changes beyond Workshop. |
| **T2** | Technician | Client name and booking reference only (for cases). No contact details, no money. |
| **D1** | Driver | Own assigned trips for the day/period only. |
| **D2** | Driver | **Read-only** on trips/transport (migration 0014). Sees items, destination, receiver name; receiver phone/address **only while the trip is assigned and open**. Completing a delivery handover at the client site is ⭐ (§13 D-a). |
| **D3** | Driver | Booking header and item list of assigned trips. No money, no edits. |
| **D4** | Driver | Contact fields inside the trip only; no directory access. |
| **C1** | Coordinator | Raise and follow cases, attach evidence, propose disposition; cannot approve cost (Manager+). |
| **C2** | Coordinator | Add caretaker/crew as a priced line, book crew, see **billed** rate. Payout rate hidden (⭐ §13 K-a). Cannot override a crew conflict or approve timesheets. |
| **C3** | Coordinator | Full equipment/bundle view with **rental rates, deposit, replacement value** (booking money). Purchase cost, book value, ROI, utilisation hidden. No create/edit of equipment or bundles (⭐ §13 I-a). |
| **C4** | Coordinator | Draft purchase requests (from unmet demand / sub-rent events). No approval. |
| **C5** | Coordinator | Create and edit clients incl. membership; sees outstanding, deposit held, credit limit. **Credit-limit override and payment-terms beyond Immediate need Manager+ approval.** Cannot block or merge. |
| **C6** | Coordinator | Create Draft invoice from a booking, issue it, generate receipt. Cannot void (Manager+ / Accounts). |
| **C7** | Coordinator | Rentals, Clients, Operations, Fulfillment, Discounts reports with **booking money**. No P&L, cash flow, working capital, expenses, VAT, equipment ROI/utilisation, staff reports. |
| **C8** | Coordinator | Inbox two-way conversations; all templates incl. money ones (booking money); Broadcasts drafts only; no channel settings. |
| **A1** | Accounts | View cases; record recovery/absorbed amounts once disposition is approved. No disposition. |
| **A2** | Accounts | Booking read with full money; create/issue/void invoice; no booking edits, no floor verbs. |
| **A3** | Accounts | Payouts, TDS, crew PAN/ID documents (with Owner). No booking of crew. |
| **A4** | Accounts | Equipment/maintenance view **with purchase cost, book value, depreciation, maintenance cost**. No edits. |
| **A5** | Accounts | Client view with full financials; edit **payment terms and VAT profile**; no block/merge, no membership edits. |
| **A6** | Accounts | Record payments, refunds, deposit refund confirmation, credit/debit notes. **No reversal entries** (Owner/Admin/Manager). |
| **A7** | Accounts | Send payment receipt / balance-due drafts; read finance-related conversations. |
| **E1** | Coordinator | Submit expenses; view all; no approval. |
| **E2** | Warehouse · Technician · Driver | **Submit-only**: own fuel/supplies/transport claims; sees own submissions with the amount entered and nothing else. |
| **M1** | Manager | Approve purchase requests **under Rs 50,000**; above → Owner (⭐ threshold §13). |
| **AD1** | Admin | Run and schedule backups, view backup health. **Restore is Owner-only** (§6.2). |
| **AD2** | Admin | Create/deactivate users and assign roles **up to Manager**. Granting or revoking Admin is Owner-only. Sees the read-only matrix. |
| **AI** | money-blind roles get the money-blind agent | Four role-gated agents (Rental · Warehouse · Maintenance · Finance). No panel ships until backed by real computation (Law 16). AI is never Tier 1 (§8.3). |
| **P1–P5** | Client | See §7. |

---

## 4. Capability catalogue

Module specs name **capabilities**, never roles (Administration v3.1 rule). Every action in `src/actions/**` declares exactly **one** capability from this table; `checkCapability` in `core.ts` maps each to the role list below. **Code** column: ✓ = string already declared in the repo (16 Aug mapping) · ○ = verify name or add.

Ladder shorthand: `M+` = Owner · Admin · Manager. `C+` = M+ · Coordinator. `Floor` = Warehouse · Technician. `Money` = Owner · Admin · Manager · Accounts.

### 4.1 Rentals

| Capability | Roles | DB enforcement | Code |
|---|---|---|---|
| `rental.draft` | C+ · Warehouse | `bookings_insert` | ✓ |
| `rental.create` | C+ · Warehouse | `bookings_insert`, `booking_lines_all`, `booking_line_units_all`, `create_booking()` security INVOKER | ✓ |
| `rental.confirm` | C+ · Warehouse | `booking_stage_transitions_insert` — and, since R-26, that same INSERT writes the booking's `inventory_reservations` rows (`0100`, trigger, SECURITY INVOKER). The five roles this policy admits are exactly the five `inventory_reservations_all` admits, so confirming and holding are one permission and one transaction. | ✓ |
| `rental.discount` | C+ (Coordinator included) | `booking_discounts_money_blind` refuses Floor. **Ungated in amount** (31 Aug): no cap, no reason, no approver. | ○ split from `rental.create` |
| `rental.extend` | C+ | invoice update in place; blocked on collision with next booking (system, not role) | ✓ |
| `rental.update_project` | C+ · Warehouse (UI offers edit to C+; floor views) | narrow `project_type`/`project_type_other` text edit via `updateBookingProject`; audited old→new; 0102 money trigger untouched | ○ |
| `rental.cancel` (before Packed) | C+ | stage-transition policy; cancellation fee tiers from Settings | ✓ |
| `rental.cancel` (Packed or later) | M+ | reason ≥10 chars, audited | ✓ (same string; stage checked in engine) |
| `rental.override_overbooking` | M+ | releases the **losing** reservation (`released_at` + `override_records` row + reason ≥10 chars) and re-runs the transition; the GiST constraint is never disabled and never `deferrable` (R-26, 8 Sep) | ○ |
| `rental.reopen` (stage-only, invoice untouched) | M+ | `apply_booking_stage_transition` fix per SPEC-P0-2 | ○ |
| `rental.close` (auto-suggest, manual confirm) | C+ · Accounts | close gates: outstanding 0 + deposit resolved + no open case + no pending damage | ○ |
| `subrental.create` | C+ | — | ✓ |
| `supplier.manage` | C+ · Accounts | 22 Jul lock (c) | ○ |
| `production.manage` | C+ | light record | ○ |

### 4.2 Floor (Operations)

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `rental.pack` | C+ · Warehouse | Technician **view-only** (22 Jul) | ○ (packRental) |
| `rental.pickup` (= Handover session) | C+ · Warehouse | soft gate: any of these may release with payment outstanding **after warning, logged** | ✓ |
| `rental.pickup.override_receiver` | M+ | receiver-verification gate, reason ≥10 | ○ |
| `rental.return` (triage) | C+ · Floor | shared triage (21 Jul) | ✓ |
| `rental.reset` | C+ · Floor | non-blocking stage | ○ (completeReset) |
| `inspection.record` | C+ · Floor | condition, evidence, severity — **no cost** for Floor | ✓ (`inspection.*`) |
| `evidence.capture` | all staff on the job | mandatory on Damaged/Lost lines | ○ |
| `evidence.review` (accept/reject match, archive with reason) | M+ | soft-delete only | ✓ |
| `scan` | all staff | identity by PIN (P8) | ○ |

### 4.3 Cases, Maintenance, Purchase

**Preventive maintenance — R-28 (8 Sep 2026).** A unit is due for service when
either its elapsed-time interval or its usage interval since the last completed
`Preventive Service` job is reached, whichever comes first. Due-ness **warns
only** — the unit stays bookable — and the intervals live on the **product
model**. Nothing is stored: `product_units_service_v` derives it at read time.

| Capability | Roles | DB enforcement | Code |
|---|---|---|---|
| `inventory.edit_service_plan` | Owner · Admin · Manager | the three intervals + grace on `products`; `products_update` policy | ○ |
| `inventory.record_meter` | M+ · Warehouse · Technician | `product_units.meter_hours` / `meter_hours_recorded_at`, written at intake and at Return only | ○ |
| view `product_units_service_v` | all staff | carries no money column, so no Law 6 mask is needed — the view is money-free by construction | ○ |


| Capability | Roles | Notes | Code |
|---|---|---|---|
| `case.create` | C+ · Floor | Damage needs 1 photo; Missing needs a note | ○ |
| `case.resolve` (disposition, cost) | ✅ **FIXED 8 Sep (R-25) — Owner · Manager under Rs 25,000; Owner at or above.** Admin is refused by `auth_can_approve_damage()` on live and by 0057 in the repo. `core.ts` now returns `canApproveDamage(role, 'Manager')` — its first caller. The role band is the widest legal set; the Rs 25,000 threshold stays in `lib/damage`'s `approverFor()` and in the DB function, so UI ⊆ DB (P3) holds. Eight tests lock the roles; 6 of them fail if the old mapping returns. | `auth_can_approve_damage(charge)` | ✅ string and roles both correct |
| `case.record_recovery` | Money | recovered / absorbed / insurance | ○ |
| `writeoff.approve` | M+ under threshold · Owner above | ⭐ threshold §13 | ○ |
| `maintenance.create` | C+ · Floor | item → Maintenance, blocks availability | ✓ (`maintenance.*`) |
| `maintenance.work` (job updates, parts) | M+ · Technician | 21 Jul shared-triage lock, 0014 | ✓ |
| `maintenance.approve_cost` | M+ (⭐ Rs 25,000 proposed) | | ○ |
| `maintenance.clear` (back to In Stock) | M+ · Technician | | ○ |
| `purchase.draft` | C+ · Floor | | ○ |
| `purchase.approve` | ⛔ **CORRECTED — Owner · Manager.** Admin is refused by both `canApprovePurchase` (`rbac.ts`) and live `auth_can_approve_purchase()`. No Rs 50,000 branch exists anywhere in the capability path; the threshold is aspirational. | `auth_can_approve_purchase()` | ✓ string · ⛔ roles |

### 4.4 Inventory

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `inventory.view` | all staff | money columns per §5 | ✓ |
| `inventory.create` (Quick Add) | M+ · Warehouse | ⭐ Coordinator I-a | ✓ |
| `inventory.edit_identity` (name, serial, tag, location, condition-at-intake, labels) | M+ · Warehouse · Technician (condition/meters only) | | ✓ |
| `inventory.edit_pricing` (rates, deposit, min days) | M+ | Coordinator view | ✓ |
| `inventory.edit_purchase` (purchase price, replacement value, supplier, warranty, depreciation) | M+ · Accounts | | ✓ |
| `inventory.retire` / `inventory.dispose` | M+ (Owner above write-off threshold) | never delete | ✓ |
| `bundle.manage` | M+ | ⭐ Coordinator I-a | ○ (createBundle) |
| `stockcheck.run` | M+ · Floor | Unverified never auto-Missing; "Confirm missing" opens a case | ○ |
| `stockcheck.confirm_missing` | M+ · Warehouse | | ○ |
| `inventory.stock_adjust` | Owner · Admin · Manager | `adjust_stock()` enforces role, actor, non-zero signed delta, reason ≥10, non-negative result, idempotent `client_uuid`; `stock_adjustments` is append-only | ✓ |

### 4.5 Clients

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `client.create` | C+ · **Warehouse (walk-in, Commercial section not rendered)** | his ruling 7 Sep; CSV imports require C+ (creation ∩ full client-contact access, §4.5); Warehouse keeps walk-in intake only | ✓ |
| `client.update` | C+ · Accounts (payment terms, VAT profile only) | | ✓ |
| `client.block` / `client.unblock` | **Owner · Admin · Manager** | reason from list, audited; existing bookings continue | ✓ |
| `client.merge` | M+ | redirect record, sums balances, reversible 30 days, blocked with open booking/case | ✓ |
| `credit.override` (limit above membership default, terms beyond Immediate) | M+ | reason ≥10 | ✓ |
| `client.view_pii` (phone, email, address, PAN/ID docs) | C+ · Accounts always · **Driver inside assigned trip only** | HIS v2.1 gate | ○ |
| `client.view_as` (open portal as this client, read-only) | C+ | audited | ○ |

### 4.6 Finance

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `money.view` | Owner · Admin · Manager · Accounts (all) · Coordinator (booking money + client balance/deposit) | `auth_can_view_money()`; Coordinator scoping is column-level (§5) | ✓ |
| `payment.record` | C+ · Accounts | immutable row | ○ (recordPayment) |
| `payment.refund` | M+ · Accounts | capped at paid amount; deposit refund only when outstanding = 0 | ○ |
| `payment.reverse` | **Owner · Admin · Manager** | reversal row referencing original + reason; Accounts ⭐ F-a | ○ |
| `invoice.create` / `invoice.issue` | C+ · Accounts | Draft until return; issued once (4 Sep rulings) | ○ |
| `invoice.void` (+ credit note) | M+ · Accounts | issued invoices immutable; ⭐ S1-a default: Owner · Admin · Manager · Accounts (R-05). Coordinator excluded. | ✓ |
| `deposit.confirm_refund` | M+ · Accounts | accountant confirms auto-calculated refund (21 Jul) | ○ |
| `deposit.release` | M+ · Accounts | never automated (Tier 3) | ○ |
| `expense.submit` | all staff | own claims for Floor/Driver | ○ |
| `expense.approve` | M+ · Accounts (⭐ Rs 25,000 threshold; above → Owner) | never own submission | ○ |
| `expense.reverse` | M+ · Accounts | posted expenses reverse, drafts discard | ○ |
| `document.create` (quote, invoice, receipt, agreement, packing list, delivery note) | C+ · Accounts · Warehouse (packing list, delivery note, agreement only) | prices suppressed for Warehouse | ✓ |
| `document.void` | M+ · Accounts | | ○ |
| `report.view_operational` | all staff except Driver | | ○ |
| `report.view_money` | Money · Coordinator (booking-money reports only, §3.1 C7) | Reports read, never compute | ○ |
| `report.export` | roles that can view the report | export carries no column the role cannot see on screen | ○ |

### 4.7 Crew (light v1; full module parked)

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `crew.view` | C+ · Accounts | | ○ |
| `crew.assign` / `crew.book` | C+ | caretaker as priced line | ✓ |
| `crew.override_conflict` | M+ | hard block otherwise, reason logged | ○ |
| `crew.approve_timesheet` | M+ | payout gated on approved timesheet | ○ |
| `finance.view_cost` (crew payout rates) | Money | Coordinator sees billed only ⭐ K-a | ○ |
| `finance.pay` (payouts, TDS) | M+ · Accounts | | ○ |
| `admin.view_pii` (crew citizenship/passport/licence/medical) | **Owner · Accounts** | never exported, never on a call sheet; every access audited | ○ |

### 4.8 Communication (parked; wa.me deep links live now)

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `comms.read` | C+ · Accounts · Warehouse (own booking threads) | | ○ |
| `comms.draft_lifecycle` | all staff except Driver | confirmed / ready / pickup-tomorrow / return-reminder / overdue — **never auto-sent** | ○ |
| `comms.draft_money` (receipt, balance due, reminder) | Money · Coordinator | Law 6 — a message asserting money owed is always human-sent | ○ |
| `comms.broadcast` (marketing) | drafts C+; **publish M+** | consent model; auto-pause thresholds | ○ |
| `comms.templates` | Owner · Admin (edit) · Manager (view) | version-pinned; unregistered variable blocks publish | ○ |
| `comms.settings` (channels, credentials, quiet hours) | Owner · Admin | credentials write-once, masked | ○ |
| OTP bodies | **nobody** — masked for every role incl. Owner | | ○ |

### 4.9 Automation (parked)

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `automation.view` (logs, queue, versions) | M+ | | ○ |
| `automation.edit` / `automation.publish` | Owner · Admin | Tier 2 node without downstream approval fails validation | ○ |
| `automation.replay_live` | Owner | sandbox replay Admin | ○ |
| Tier 3 — never automated | — | delete/restore, change permissions, alter audit, close fiscal period, approve own output, send promotions without consent, **release a deposit**, restore a backup | — |

### 4.10 Settings and Administration

| Capability | Roles | Notes | Code |
|---|---|---|---|
| `settings.view` | M+ · Coordinator · Accounts (money-gated tab follows §5) | | ○ |
| `settings.manage` (General, Financial, Branches) | ⛔ **Code is `Owner` only** (`canManageSettings`), not Owner · Admin. **Since 0158 (7 Oct 2026, written, not yet applied to live) the `settings` table exists:** read = staff, money keys (`settings_is_money_key`) need `auth_can_view_money()`; write = `set_setting()` RPC, Owner only; `settings_history` append-only. Until 0158 is applied on live, settings are still `localStorage` there and D-9 is untestable on live (it runs under PGlite: `npm run test:settings`). | `settings`, `settings_history`, `set_setting()` — 0158 | ✓ string · ⛔ roles |
| `settings.rules` class 1–2 | Owner · Admin | BLOCK/WARN/OFF states | ○ |
| `settings.rules` class 3 | **Owner** + PIN + typed confirmation (2FA when built) | | ○ |
| `admin.users` (create, deactivate, assign ≤ Manager) | Owner · Admin | build gap: today only read/reset/revoke | ○ |
| `admin.grant_admin` | **Owner** | | ○ |
| `admin.audit_view` | M+ · Accounts | append-only; **no edit capability exists for anyone** | ○ |
| `admin.audit_config` (levels, retention, legal hold) | **Owner**, reason required; global logging cannot be disabled | | ○ |
| `admin.backup_run` | Owner · Admin | | ○ |
| `admin.restore` | **Owner** — PIN/2FA re-entry, type RESTORE, recovery checkpoint, sandbox default, maintenance mode | | ○ |
| `admin.numbering_view` | M+ · Accounts | formats are DB CHECK constraints — read-only by design | ○ |
| `admin.counter_reset` | **Owner**, reason ≥10, audited, blocked if any existing identifier ≥ new value | | ○ |
| `admin.date_table` (BS month-length table) | **Owner** | CSV import/export, validation, audit | ○ |
| `admin.integrations` / AI data-leaving policy | Owner (enable) · Admin (configure) | | ○ |

---

## 5. Money visibility (Law 6) — exactly what each role receives

| Data | Owner · Admin · Manager · Accounts | Coordinator | Warehouse · Technician · Driver | Client |
|---|---|---|---|---|
| Booking totals, discount, VAT, advance due, outstanding | ✅ | ✅ | ✕ (gate = "Payment required", no figure) | own only |
| Client balance, deposit held, credit limit, pay-later | ✅ | ✅ | ✕ | own only |
| Payments, invoices, receipts, security deposits | ✅ | ✅ (booking-scoped) | ✕ — **RLS filters rows** (`payments`, `invoices`, `security_deposits`) | own only |
| Rental rates, replacement value, deposit % | ✅ | ✅ | ✕ | on request/quote only |
| Purchase price, book value, depreciation, maintenance cost | ✅ | ✕ | ✕ | ✕ |
| Utilisation %, ROI, payback, idle revenue | ✅ | ✕ | ✕ | ✕ |
| Supplier cost / sub-rental margin | ✅ | cost ✅ · margin ✕ | ✕ | ✕ |
| Crew payout rates, TDS | ✅ | ✕ (billed only) | ✕ | ✕ |
| Expenses | ✅ | view all, no approval | own submissions only | ✕ |
| P&L, cash flow, working capital, VAT return | ✅ | ✕ | ✕ | ✕ |

Mechanics, in order of strength:
1. **Row filter** — RLS on `payments`, `payment_reversals`, `invoices`, `security_deposits`, `expenses` via `auth_can_view_money()`. A refused SELECT returns zero rows, not an error: the app must never read "0 rows" as "no data" for a money-blind role (`check-db.mjs` v2 lesson).
2. **Column masking** ⛔ **— writable-through on live: all 26 `_v` views are INSERT-able by
   `anon` (checked 7 Sep). Masking a column in a view does not protect the base table until
   0095 is applied.** — views (`v_booking_floor` pattern): `payment_outstanding` as boolean, never an amount. Coordinator's "booking money only" is a **column** rule (no `purchase_price`, `book_value`, `roi_*`, `payout_rate` in the views Coordinator reads), not a row rule.
3. **Write trigger** — money-blind roles cannot write a money column (0092). ⛔ **Repo only —
   0092 is NOT applied to live** (the ledger jumps 0078 → 0089), so no Law 6 write trigger exists
   on production today.
4. **DOM omission** — `useCanViewMoney()` removes the element; KPI arrays exclude Revenue/Utilisation so nothing is in the DOM to unhide.
5. **Exports and messages** — CSV, print, PDF and comms templates are built from the same gated query. A Warehouse export of Settings must not contain VAT rates (kept: Financial is a money-gated **tab**, `exportConfig` walks the filtered tab list).

Known hole to keep closed: **`security_deposits` was readable by money-blind sessions on 16 Aug** (Rs 13,65,000 across 89 rows) while payments/invoices filtered correctly. §12 test D-3 asserts it stays closed.

---

## 6. Approval and override gates

### 6.1 The gate table

| id | Gate | Who may pass it | Reason | Audit | Source |
|---|---|---|---|---|---|
| `gate.handover.payment_outstanding` | Release gear with **payment outstanding** (advance tier not met) | **Any staff** — warning shown, release allowed | none | yes, per session | his ruling 7 Sep; 21 Jul soft gate |
| `gate.handover.payment_outstanding` | Release gear with **deposit outstanding** | same as above | none | yes | same rule — the gate is one gate |
| `gate.handover.receiver_unverified` | Receiver not verified at handover | M+ override | ≥10 chars | yes | Handover v1.1 |
| `gate.conflict.overbooking` | Overbooking (GiST conflict) | M+ | mandatory | yes; losing reservation deactivated | 21 Jul |
| `gate.conflict.crew` | Crew double-booking | M+ | mandatory | yes | Crew v3.1 |
| `gate.discount.general` | Discount — any % | C+ | **none** | line audited like any booking write | 31 Aug: ungated |
| `gate.case.charge_tier1` | Damage / case charge **< Rs 25,000** | Owner · Admin · Manager | yes | yes | 21 Jul |
| `gate.case.charge_tier2` | Damage / case charge **≥ Rs 25,000** | **Owner** | yes | yes | 21 Jul |
| `gate.case.write_off` | Write-off (Missing → Lost) | M+ under threshold · Owner above | yes | yes | ⭐ threshold |
| `gate.maintenance.cost` | Maintenance cost | M+ (⭐ Rs 25,000) | yes | yes | Settings ▸ Finance |
| `gate.purchase.request` | Purchase request | Manager < Rs 50,000 · Admin · Owner | — | yes | Admin v3.0 limits ⭐ |
| `gate.expense.approve` | Expense | M+ · Accounts (⭐ Rs 25,000; above → Owner); never own | — | yes | Expenses v2.2 |
| `gate.client.terms_override` | Credit limit / payment terms override | M+ | ≥10 chars | yes | Add Client v2.1 |
| `gate.client.block` | Block client | Owner · Admin · Manager | from list | yes | his ruling 7 Sep |
| `gate.client.merge` | Merge clients | M+ | yes | yes, reversible 30 d | Clients v2.0 |
| `gate.cancel.stage_too_late` | Cancel after Packed | M+ | ≥10 chars | yes | this doc |
| `gate.cancel.reason_missing` | Cancellation without valid reason | nobody | ≥10 chars | yes | Stage 1 (0115) |
| `gate.payment.reverse` | Payment reversal | Owner · Admin · Manager | yes | yes | Booking Workspace v2.3 |
| `gate.payment.over_invoice` | Payment exceeds invoice outstanding | nobody | — | yes | Stage 1 (0118) |
| `gate.payment.over_booking` | Advance payment exceeds booking estimate | nobody | — | yes | Stage 1 (0118) |
| `gate.invoice.void_role` | Void issued invoice (+ credit note) | M+ · Accounts (R-05) | yes | yes | 4 Sep rulings; Stage 1 (0117) |
| `gate.invoice.void_reason` | Void invoice without valid reason | nobody | ≥10 chars | yes | Stage 1 (0117) |
| `gate.invoice.void_paid` | Void paid invoice without credit note | nobody | credit note required | yes | Stage 1 (0117) |
| `gate.deposit.refund` | Deposit refund | Accounts confirms (M+ may) | — | yes | 21 Jul |
| `gate.reopen.role` | Reopen a Closed booking (stage only) | M+ | yes | yes | 4 Sep rulings; Stage 1 (0115) |
| `gate.pack.session_missing` | Booked → Packed with no pack session | nobody | — | yes | Stage 1 (0115) |
| `gate.pack.units_unassigned` | Serial line with unassigned units at pack | nobody | — | yes | Stage 1 (0115) |
| `gate.pack.units_unpacked` | Unit unpacked in pack session | nobody | — | yes | Stage 1 (0115) |
| `gate.handover.session_missing` | Packed → On Rent with no handover session | nobody | — | yes | Stage 1 (0115) |
| `gate.handover.units_unhanded` | Packed unit without handover line | nobody | — | yes | Stage 1 (0115) |
| `gate.handover.agreement_unsigned` | Agreement unsigned at handover | nobody | — | yes | Stage 1 (0115) |
| `gate.return.session_missing` | On Rent → Returned with no return session | nobody | — | yes | Stage 1 (0115) |
| `gate.return.units_unaccounted` | On-rent unit with no return line | nobody | — | yes | Stage 1 (0115; non-physical exempt 0139, Consumable exempt 0141) |
| `gate.handover.consumable_product_missing` | Consumable line whose product row is missing at Handover | nobody | — | no (movement refused, handover held) | 0142 |
| `gate.stock_adjust.role` | Bulk stock adjustment by lower role | Owner · Admin · Manager | ≥10 chars | append-only `stock_adjustments` row | 0140; RULINGS-2026-09-29 |
| `gate.stock_adjust.negative_result` | Adjustment would make product quantity negative | nobody | — | refused | 0140 |
| `gate.close.no_invoice` | Returned → Closed with no invoice | nobody | — | yes | Stage 1 (0116) |
| `gate.close.invoice_unsettled` | Returned → Closed with unsettled invoice | nobody | — | yes | Stage 1 (0116) |
| `gate.close.deposit_unresolved` | Returned → Closed with unresolved deposit | **M+ may pass it with a written reason** (0155); nobody otherwise. Offered only while Settings ▸ Financial ▸ Deposit rules is On; the database enforces role and reason regardless | ≥10 chars (`booking_stage_transitions.deposit_skip_reason`) | yes — `audit_events` gate `close_deposit_skipped` with deposit held/pending; **no money moves**, the deposit stays a liability | Stage 1 (0116); RULINGS-2026-10-06 (0155) |
| `gate.close.deposit_skip_role` | Deposit skip attempted below Manager | nobody | — | refused | 0155 |
| `gate.close.open_case` | Returned → Closed with open case | nobody | — | yes | Stage 1 (0116) |
| `gate.close.reservation_live` | Returned → Closed with live reservation | nobody | — | yes | Stage 1 (0116) |
| `gate.unit_status.direct_write` | Direct write to product_units.status | nobody (engine-owned) | — | yes | Stage 1 (0114) |
| `gate.users.role_ceiling` | Role assignment exceeds caller ceiling | Owner only | — | yes | Stage 1 (0120) |
| `gate.users.immutable` | Deleting row from users | nobody (immutable) | — | yes | Stage 1 (0120) |
| `gate.booking_lines.money_blind_insert` | Direct line insert with money by money-blind | nobody (use create_booking) | — | yes | Stage 1 (0119) |
| `gate.discount.money_blind` | Money-blind caller attempting discount | nobody | — | yes | Stage 1 (0119) |
| `gate.counter.reset` | Counter reset | **Owner** | ≥10 chars | yes | 15 Aug ⭐ closed here |
| `gate.rule.class3` | Rule class 3 change | **Owner** + PIN + typed confirm | consequence note | forensic level regardless of setting | Rules Registry v1.0 |
| `gate.backup.restore` | Restore backup | **Owner** | typed `RESTORE` | yes + maintenance mode | Admin v3.3 |
| `gate.date.bs_edit` | BS date table edit | **Owner** | validation | yes | Date Engine v1.0 |
| `gate.audit.config` | Audit configuration | **Owner** | yes | forensic | Admin v3.3 |

WARN-class rules (Rules Registry) are passed by **any staff** with the warning logged — the same shape as the payment soft gate, because a driver at 6 AM cannot reach a manager. BLOCK-class rules are passed only by the role this table names.

### 6.2 Owner-only list (never delegated, not even to Admin)

1. Restore a backup.
2. Edit the Bikram Sambat month-length table.
3. Change audit configuration (level, retention, legal hold).
4. Reset a numbering counter.
5. Approve a damage charge or write-off **≥ Rs 25,000**.
6. Grant or revoke the Admin role; deactivate an Admin.
7. Change a class-3 rule (money calculation order, deposit-as-liability, immutable payments, audit existence).
8. Enable an integration that sends client data outside Nepal (AI providers), and set its ceiling.
9. Live replay of an automation execution.
10. Retire a branch.

Everything else Admin can do. Admin ⊇ Manager ⊇ Coordinator for approvals (a higher rung can always act where a lower one may). The exception is the **approve-your-own-submission** rule: nobody approves what they submitted, at any rung.

---

## 7. Client Portal (role `Client`)

One page, no routes, sheets only. `auth_is_staff()` = false. Every read is joined to the session's `client_id`; **multi-user under one client record** (4 Aug). OTP login, no passwords; staff-enabled, no public signup.

| Code | Client may |
|---|---|
| **P1** | See own damage/missing cases **with evidence photos**; **no amount** until the Rs 25,000 approval gate clears; "Under review" is orange, never red. |
| **P2** | See own bookings (6-step client timeline, Inspection folded into Returned), items, dates, agreement status. |
| **P3** | See own client record: membership level and benefits, credit, documents. Cannot edit identity fields. |
| **P4** | See own invoices, payments, deposit held/refunded. |
| **P5** | See and download own documents (quote, agreement, invoice, receipt, delivery note). |

**Exactly four writes**, all going to a staff queue — the portal never changes a booking, invoice or stock directly:

| Write | Result staff-side |
|---|---|
| Request gear (free text, no catalogue in v1) | Draft quote task for Coordinator |
| Request extension (collision check runs before submit) | Extension request on the booking; Coordinator confirms |
| Upload payment proof | Attached to invoice; **never changes invoice status** until Accounts/Coordinator records the payment |
| Sign agreement | Signature stored with device/IP/time; agreement → Signed |

`portal_users`, `portal_sessions`, `portal_auth_challenges` are **deny-all today**. They stay deny-all until the session → `client_id` binding is written and tested (§12 D-5). Guessing it wrong exposes one client's data to another.

---

## 8. Parked modules — cells pre-ruled

### 8.1 Crew Assist (light v1 now: caretaker as priced line; full module later)
Grid row and §4.7 apply unchanged when the module returns. Payouts live in Finance (Accounts), booking lives in Rentals (Coordinator). Crew ID documents: Owner · Accounts only, never exported.

### 8.2 Communication Center
Draft-only law stands for every channel: **nothing is ever auto-sent**, and nothing is ever logged as "sent" from a wa.me link. Money-asserting messages are human-sent by money roles. Broadcasts are marketing only and publish at M+. OTP is masked for everyone. Chat windows are launchers — Create Booking / Receive Payment / Extend open the owning workspace with its own gates.

### 8.3 Automation Center
Owner · Admin edit and publish; Manager reads logs and queue. **Autonomy tiers are permissions**: Tier 1 completes alone (notifications, reminders, non-financial transitions, reports, backups, labels); Tier 2 prepares and a named role completes (draft invoice → `invoice.issue`; calculate damage → `case.resolve`; propose refund → `payment.refund`); Tier 3 never (see §4.9). Publishing a Tier 2 node without a downstream approval step fails validation. AI nodes are never Tier 1.

### 8.4 AI Assistant (roadmap)
Four agents inherit the caller's role — the Warehouse agent can never see or say a figure. No panel ships without real computation behind it (Law 16). Every call logged with record touched.

### 8.5 Notifications
Everyone has an inbox. Role defaults: Coordinator → bookings; Warehouse/Technician → queues; Accounts → payments; Owner/Admin/Manager → morning digest + exceptions. Content obeys §5 — a Warehouse notification never carries an amount.

---

## 9. Database contract

| Helper | Returns | Used by |
|---|---|---|
| `auth_user_role()` | the session's `system_role`; resolves deactivated users to `Client`, fallback `Client` when no `users` row | every policy |
| `auth_is_staff()` | role ≠ Client | all staff tables |
| `auth_can_view_money()` | role ∈ {Owner, Admin, Manager, Coordinator, Accounts} | money tables + views |
| `auth_is_finance_or_admin()` | role ∈ {Owner, Admin, Manager, Accounts} (R-05 / S1-a default; Coordinator excluded) | invoice void, credit notes, refunds |
| `auth_is_manager_or_above()` | role ∈ {Owner, Admin, Manager} | stage gates (cancel late, reopen), M+ rows |
| `auth_is_owner()` | role = Owner | §6.2 |
| `auth_user_branch_id()` | session's `branch_id` from `users` | branch scoping in RLS and views |
| `recompute_unit_status(p_asset_id uuid)` | `product_unit_status` | unit status engine (0114) |
| `booking_estimate_total(p_booking_id uuid)` | `numeric` | payment ceiling (0118) |
| `get_model_daily_rate(product_id, bundle_id)` | `numeric` | server-side prices (0119) |

Rules:
- `create_booking()` and every future RPC stay **SECURITY INVOKER** so each insert faces its own policy (a Warehouse call that includes a discount is rejected whole).
- Every write carries `client_uuid` (Law 8) and the acting `user_id` — on shared floor devices the PIN resolves the person (P8).
- `branch_id` scopes rows; a role's grant applies within its branch unless Owner/Admin.
- Audit tables have **no UPDATE/DELETE policy for any role** — immutable by omission.
- Coordinator's money scope is delivered by **views without the excluded columns**, not by RLS on rows (RLS cannot mask a column).

---

## 10. PII

| Data | Who | Rule |
|---|---|---|
| Client phone, email, address | C+ · Accounts always; Warehouse phone only (walk-in/floor contact); Driver **inside assigned open trip only** | HIS v2.1 |
| Client PAN, citizenship/passport documents | C+ · Accounts | hidden from Floor and Driver; Evidence engine keeps them out of Marketing category |
| Staff DOB, citizenship, salary grade, contract, reviews | **Owner** + own record (`admin.view_hr`, `admin.view_pii`) | every access audited; no HR role exists yet |
| Crew ID documents | Owner · Accounts | never exported, never on a call sheet |
| Marketing consent flag | C+ | unchecked by default; gates Marketing photo category and broadcasts |

---

## 11. Settings ▸ People & Access (the surface)

- **Users tab** — list, create (Owner/Admin), assign role ≤ Manager (Admin) or any (Owner), deactivate (never delete), reset PIN, revoke sessions. *Build gap today: only read / reset / revoke exist.*
- **Permission matrix** — renders §3 **read-only** from the same constant `rbac.ts` uses, with a footer: *"Permissions are code and database policy. Changing a cell is a release, not a setting."* A test asserts the rendered matrix equals the constant.
- **Security** — session timeout, PIN policy, password policy (12 chars, 5 attempts, 30-min lockout), 2FA (not built — until then Owner-only actions use PIN re-entry + typed confirmation).
- **Money-gated tab rule** — Financial stays a gated tab so `exportConfig` covers the CSV for free (15 Aug wave 3). Do not fold it into General.

---

## 12. Reconciliation with code and acceptance tests

Doing this section is what makes the document "bug-free". None of it is optional.

### 12.1 Code changes required

| # | Change | Where |
|---|---|---|
| R-1 | Every capability string in §4 has a `case` in `checkCapability`; every `capability:` declared by an action appears in §4. Unmapped = deny stays. | `src/actions/core.ts`, `src/lib/rbac.ts` |
| R-2 | Rename/add the ○ strings (e.g. `payment.record`, `rental.pack`, `rental.reset`, `rental.discount`) to match §4 exactly. One capability per action. | `src/actions/**` |
| R-3 | `rbac.ts` exports ONE `MATRIX` constant (role → capability set). Screens, `PageBody` restricted state, nav visibility and the Settings matrix all read it. No role literal anywhere else (grep `'Owner'`/`'Warehouse'` outside `rbac.ts` and tests = defect). | `src/lib/rbac.ts` |
| R-4 | Add `auth_is_manager_or_above()`, `auth_is_owner()`; confirm `auth_is_finance_or_admin()` membership; add policies for every M+ / Owner-only row in §4 that has none. | new migration — ⛔ **next free number is 0097.** There is exactly one `0074`; the duplicated prefixes are **0056** and **0076**, and both halves of each are already applied to live, so renumbering them would desynchronise `schema_migrations`. Record the collision, do not renumber. |
| R-5 | Money-blind policy on `security_deposits` (row filter) — verify 0092 covers SELECT, not only writes. | migration |
| R-6 | Coordinator column views: `v_equipment_coordinator` (no purchase/book/ROI), `v_crew_coordinator` (billed not payout). | migration |
| R-7 | Driver: trip-scoped PII view; policies read-only on `booking_transport` / trips (0014 stands). | migration |
| R-8 | `client.create` mapped to C+ · Warehouse with the Commercial section behind `money.view`; `client.block` mapped to Owner · Admin · Manager. (Both were "genuinely unruled" — now ruled.) | `core.ts`, Add Client form |
| R-9 | Handover: remove any Manager-override requirement on the payment/deposit gate; keep warning + audit row per session. | `handoverRental.ts`, Handover workspace |
| R-10 | Settings ▸ People & Access renders the matrix from `MATRIX`; remove any editable matrix UI. | `modules/settings` |
| R-11 | Client portal tables: write the session → `client_id` binding + policies **before** turning any portal screen on. | migration + `portal/*` |

### 12.2 Tests that must exist and pass

**App (vitest)**
- **T-1 Matrix round-trip** — for every role × every capability in `MATRIX`, `checkCapability` returns exactly the table's value. Generated from the constant, so a cell change fails until both move.
- **T-2 Fail closed** — an unknown capability string denies Owner.
- **T-3 UI ⊆ DB** — a fixture lists, per capability, the roles its RLS policy admits (kept in `rbac.policies.json`, updated with each migration). Test asserts `MATRIX[role] ⊆ policyRoles` for all.
- **T-4 Money DOM** — render Booking Detail, Handover checklist, Inventory row, Client drawer, Report page as Warehouse/Technician/Driver: no element matches `/Rs\s?\d/`; gate reads "Payment required".
- **T-5 Coordinator scope** — same render as Coordinator: booking totals present; purchase price, ROI, utilisation, payout absent.
- **T-6 Settings export** — `exportConfig` as Warehouse contains no Financial keys.
- **T-7 Nav** — every ✕ cell's route renders `RestrictedState` for that role, and the nav item is absent.
- **T-8 Handover soft gate** — Warehouse completes a session with payment outstanding; result: session Completed, audit row `payment_outstanding_release` with actor, no approval prompt.
- **T-9 Approval ladder** — `case.resolve` at Rs 24,999 by Manager passes; at Rs 25,000 by Manager fails, by Owner passes; Admin behaves as Manager here.
- **T-10 No self-approval** — expense submitted by X cannot be approved by X at any role.

**Database (pgTAP or `check-db.mjs` v2 per role)**
- **D-1** As Warehouse: `payments`, `invoices`, `security_deposits`, `payment_reversals`, `expenses` (others') → 0 rows, no error; `bookings` → all rows in branch.
- **D-2** As Warehouse: `create_booking()` with a discount line → rejected whole; without → succeeds.
- **D-3** As Technician and Driver: same as D-1; Driver `booking_transport` UPDATE → refused.
- **D-4** As Coordinator: money rows readable; `products` purchase columns absent from the view Coordinator reads.
- **D-5** As Client A: rows of Client B → 0 across bookings, invoices, payments, cases, documents; portal writes limited to the four queues.
- **D-6** As anon / no `users` row: everything staff-side → 0 rows, role resolves `Client`.
- **D-7** As Owner: `UPDATE audit_events` and `DELETE FROM audit_events` → refused.
- **D-8** ⛔ **CORRECTED 8 Sep (R-27) — an Admin grants nothing.** As written this row read *"As Admin: grant Admin role → refused; grant Manager → succeeds"*, which disagrees with the rest of this document and with the code: `canManageSettings` is Owner-only, `staff_directory_v` returns an Admin **zero rows** to act on, and §16 V-3/V-4 already caught the same over-crediting of Admin on the damage and purchase ladders. §15.1 B-1 (stricter wins) settles it. **The row now reads:** as Admin, Manager, or any other non-Owner role, `set_staff_role` and `set_staff_active` → refused at every target and every value. As Owner: both succeed, except that the **last active Owner** can be neither demoted nor deactivated (migration `0101`). Executed under PGlite, 12/12.
- **D-9** As Manager: `settings` UPDATE → refused; SELECT → succeeds.

### 12.3 Definition of done

`PERMISSIONS.md` v1.0 is implemented when T-1…T-10 and D-1…D-9 are green in CI, `check-db.mjs --role <each of 9>` prints Law 6 PASS for the four money-blind roles, and PROGRESS.md logs it as **Verified**, not written.

---

## 13. Open ⭐ — defaults taken, flip in review

| ID | Question | Default in this document |
|---|---|---|
| **F-a** | May Accounts write payment reversals? | No — Owner · Admin · Manager only. Accounts records refunds and credit notes. |
| **F-b** | Expense approval threshold and Owner escalation figure | Rs 25,000 to M+/Accounts; above → Owner. |
| **F-c** | Maintenance cost approval threshold | Rs 25,000 (M+). |
| **F-d** | Purchase approval threshold (Manager vs Owner) | Rs 50,000. |
| **F-e** | Write-off threshold escalating to Owner | Rs 25,000 (same as damage). |
| **I-a** | May Coordinator create equipment / edit bundles? | No — view with booking money. Warehouse Quick-Adds; Manager+ publishes pricing. |
| **K-a** | Does Coordinator see crew payout rates? | No — billed rate only. |
| **D-a** | Can Driver complete a delivery handover at the client site (signature + photo)? | Not yet — Driver stays read-only on trips (0014). If yes → `rental.pickup` gains Driver *for assigned trip only*, and the payment gate warning must reach the Driver's phone. |
| **S-a** | May Accounts edit Settings ▸ Financial values (VAT rate, payment terms defaults)? | No — view. Owner/Admin write. |
| **S-b** | Manager Settings write anywhere? | No. Manager reads. |
| **W-a** | Warehouse override of WARN-class rules at 6 AM | Yes — any staff, logged (same shape as the payment gate). |
| **P-a** | Client "Request gear" catalogue in v1 | No — free text. |
| **A-a** | Who reads archived audit logs? | Owner · Admin · Accounts. |
| **N-a** | Numbering counter reset needs a written reason like the old >10% discount? | Yes, ≥10 chars. |

---

## 14. Supersession

- Replaces: 22 Jul RBAC grid (8 roles) · Foundation v1.1–v2.0 §08 · Administration v3.1 §1 role reconciliation and §7 matrix (12 roles) · Automation/Communication v3.1 permission tables (6 roles) · Crew v3.2 permission lines · Handover v1.1 §13 Manager-override-for-payment · Add Client v2.1 "should Warehouse create clients" ⭐ · Clients v2.0 "who may block" ⭐ · 15 Aug "who may reset a counter" ⭐.
- Keeps: Law 6 mechanics, `SystemRole` enum values, 0013/0014/0017 role migrations, `canCreateBooking` five roles (Owner · Admin · Manager · Coordinator · Warehouse), discounts ungated (31 Aug), 4 Sep invoice/close/reopen rulings, portal decisions (4 Aug), autonomy tiers (Automation v1.0).
- Changelog: **v1.0 — 7 Sep 2026** — first standalone permissions document; 9 roles; Admin ⊇ Manager ruling; payment soft gate confirmed for all staff; client create/block ruled. **v1.1 — 7 Sep 2026** — §15 build-time authority: Claude resolves conflicts during the build, within named limits, logged as rulings.

---

## 15. Build-time authority — Claude resolves conflicts

**Ruled 7 Sep 2026.** While building the app, Claude (Claude Code or a chat session working on the repo) **may make any change needed to resolve a conflict, gap or ambiguity without stopping to ask** — in this document, in any spec, in code, in a migration file. The build does not wait for a ruling round. Babin reviews by flipping logged rows, not by being asked mid-task.

**End every session with the R-29 blocks.** A session ends with `## Completion` and
`## Remaining`. Run `npm run completion`; **never type a percentage by hand.** Overall is the mean
of the same five dimensions every time — Backend, Real data, DB enforcement, Permissions,
Lifecycle — so two sessions can be compared. A dimension that cannot be counted this run is
written `not measured`, never guessed. `npm run lint:progress` fails an entry missing either
heading.

**A migration is `Verified` only when `check:pglite` AND `check:lifecycle` are both green in the
same run** (R-35, issued as R-27). Unit tests cannot see across the RPC boundary: 2,834 of them
were green over a database that accepted a double booking and refused every discounted booking.

### 15.1 Always

| # | Rule |
|---|---|
| **B-1** | **Stricter wins.** When two sources disagree on a permission: deny over allow, DB over UI, fewer roles over more. A conflict is never resolved by widening. |
| **B-2** | **Three-place log, same commit.** Every decision goes to (1) `RULINGS-<date>.md` in the repo, (2) PROGRESS.md under *Ruled* (house format Did / Ruled / Verified), (3) a `// RULING <date>: <one line>` comment at the code or migration site. |
| **B-3** | **This document moves with the code.** A ruling that changes a cell, a capability or a gate edits §3/§4/§6 and the T-1 fixture in the same commit. The doc never lags. |
| **B-4** | **Gates stay green.** tsc 0, vitest green, build exit 0 after the change — a ruling that breaks a gate is not a ruling, it is a bug. |
| **B-5** | **Business figures are ⭐.** Thresholds, fees, percentages, retention periods: take the §13 default (or the most conservative figure in any source), mark ⭐, move on. |
| **B-6** | **Reversible by design.** Prefer the change that can be undone with one edit. Write the revert in the ruling ("revert = remove Warehouse from line 42"). |
| **B-7** | **Silence is not supersession.** A newer document that does not mention a rule has not cancelled it (RULINGS-2026-09-04). |

### 15.2 Never — even to resolve a conflict (Babin's explicit word required)

| # | Boundary | Why it is fixed |
|---|---|---|
| **N-1** | Add a role to the money-visible set, or remove one from `Warehouse · Technician · Driver · Client`. | Law 6 is the product's spine; a "small" widening leaks every figure. |
| **N-2** | Move any item off the Owner-only list (§6.2). | These are the irreversible actions. |
| **N-3** | Make `rbac.ts` more permissive than RLS for any capability (P3). | Produces "saved" toasts on refused writes. |
| **N-4** | Add a delete permission, an audit UPDATE/DELETE path, or a payment edit (P5, P6, Law 5). | Immutability is not configurable. |
| **N-5** | **Apply a migration to the live Supabase project.** Write it, number it, test it locally — do not run it. Babin applies after the backup step. | Live DB has 246 bookings and a Booqable bridge; PHASE-0-PLAN backup-first rule. |
| **N-6** | Rename or drop a `system_role` enum value, or a capability string already in a released build. | 63 files carry the literals; renames invalidate every policy expression. |
| **N-7** | Turn on any Client Portal write path before test D-5 passes. | Cross-client data exposure. |
| **N-8** | Rotate, print, log or commit a credential or API token. | The 5 Sep audit found one in the working tree — the fix is rotate + Edge Function secret, and that is Babin's action. |

Anything not in this table is Claude's to decide.

### 15.3 Resolution order

When sources conflict, read in this order and stop at the first that answers:

```
1  PERMISSIONS.md (this file)            — for anything about who may do what
2  RULINGS-*.md, newest first            — dated rulings
3  MASTER.md                             — implementation detail
4  Foundation v3.0 · UI_UX.md            — engines, look
5  The module spec                       — page behaviour
6  The code as found                     — what actually runs today
```

If none answers: choose the option that is **(a)** stricter, **(b)** least code, **(c)** reversible — in that order. Record which of the six sources were consulted and why they did not settle it.

### 15.4 Session report

Each build session ends with one table Babin can scan on a phone:

| Conflict | Sources that disagreed | Decision | Why | Changed where | Revert |
|---|---|---|---|---|---|
| e.g. Handover required Manager override for unpaid release | Handover v1.1 §gates vs 21 Jul soft gate vs 7 Sep ruling | Any staff, warning + audit | §6.1 row 1; stricter reading would block the floor at 6 AM, which is the one case the soft gate exists for | `handoverRental.ts:88`, Handover checklist, §3.1 W2 | restore the override branch, one `if` |

A row Babin disagrees with is flipped by replying with the row number. That reply becomes the next `RULINGS-<date>.md` entry.

**The table is followed by the two R-29 blocks** — `## Completion` (five counted dimensions, the
mean of them the Overall) and `## Remaining` (features to build · bugs to fix · rulings open, each
with a count in its heading, plus one line naming what the next session starts with). A session
that logs Did / Ruled / Verified and no Completion / Remaining is logged as unfinished.

### 15.5 Where this clause lives

Copy §15 verbatim into `CLAUDE.md` under a heading **"Authority to resolve conflicts"**, so every Claude Code session reads it at start. `CLAUDE.md` points back here for the full matrix; it does not restate §3–§6.

---

## 16. Verification pass — 7 Sep 2026

Method: four independent read-only lenses over code, repo migrations and the live database,
then a refuter per blocker/major, then a hand re-count of every load-bearing number. Where the
automated pass and the hand check disagreed, the hand check is recorded here and the automated
claim is marked withdrawn. Positive controls were run in the same shell as every "does not
exist" claim.

**One finding was withdrawn.** The pass reported `settings` and `expenses` carrying an
`allow_anon` policy (`USING true WITH CHECK true`) as a live anon read/write hole. Those
policies are real but live in the **`bakery_archive`** schema — an unrelated project sharing the
Supabase instance — not in `public`. `public.expenses` carries only its three restrictive
policies and `public.settings` does not exist. Every anon-permit-all policy on the project is in
`bakery_archive`. Recorded because the first query had no schema filter and the wrong version
was nearly published; the hygiene question (an unrelated schema with anon-open tables on the
same instance) is real but is not this application's.

### 16.1 Findings

| # | § | Claim as written | Verified reality | Severity |
|---|---|---|---|---|
| **V-1** | §4 preamble | "✓ = string already declared in the repo" | 31 ✓ rows: **7 name a string that exists nowhere**, 16 name a real string with a different role set, 8 are accurate on both. Actions declare `permissions: ['x']`, **not** `capability:` — the field name in the preamble and in R-1/R-2 is wrong. | blocker |
| **V-2** | §4.3 `case.resolve` | M+ under Rs 25,000, Owner above | Resolved to `canWriteSharedTriage` → `isStaff()`, admitting the three money-blind roles. **✅ FIXED 8 Sep — R-25.** ⛔ **Severity corrected: LATENT, not live.** `resolveCase.ts:19` is `implemented: false` and `core.ts:281` throws `ActionNotImplementedError` **before** the permission loop at `:294`, so the check was never reached and nothing could write; the only caller is archived (`src/archive/operations/CasesQueue.tsx`). Real, worth fixing, but not exploitable — so §16.3's ordering, which ranks it first *because* it is live, is wrong. **V-5 and V-14 are live; this was not.** | ~~blocker~~ → latent, fixed |
| **V-3** | §4.3, §6.1, T-9 | Damage approval is `M+` (includes Admin) | `auth_can_approve_damage(charge)`: `>= 25000` → Owner; else **Owner · Manager**. Admin is refused at every amount, identically in 0057 and on live. The Rs 25,000 boundary itself is correct. | major |
| **V-4** | §4.3, §6.1 | `purchase.approve` — Manager < Rs 50,000 · Admin · Owner | `canApprovePurchase` and live `auth_can_approve_purchase()` are both **Owner · Manager**. Admin refused; no Rs 50,000 branch exists. | major |
| **V-5** | §5 items 2–3 | Present-tense enforcement | Live ledger: …0077, 0078, **0089**. 0079–0088 and 0090–0096 unapplied — including **0092** (the write trigger item 3 cites). All **26 of 26** `_v` views are INSERT-able by `anon`, so item 2's masking is writable-through. | major |
| **V-6** | §9 | `auth_is_finance_or_admin()` = {Owner, Admin, Manager, Accounts} | Live: **{Owner, Admin, Manager, Coordinator, Accounts}** — set-identical to `auth_can_view_money()`. Manager included; **Coordinator omitted by the doc**. | major |
| **V-7** | §4, R-1 | "every capability declared by an action appears in §4" | **14 do not**: `operations.perform`, `payment.create`, `inventory.reserve/pack/ready/audit/transfer`, `maintenance.complete`, `note.create`, `unit.release`, `closing.approve`, `inspection.create/pass/fail`. | major |
| **V-8** | §4.2, §3 grid | `rental.pack` C+ · Warehouse; Technician view-only | The four floor actions declare `operations.perform` → `canPerformOperations` = Owner · Admin · Manager · Warehouse · **Technician**. Technician can complete Pack and Handover; **Coordinator cannot**. Exactly inverted. | major |
| **V-9** | §4.2 `inspection.record` | ✓, C+ · Floor | The string does not exist. The three real ones — `inspection.create/pass/fail`, declared by implemented actions — are **deliberately unmapped** and therefore denied to every role including Owner (`core.ts` TODO(decision), PLAN §4.29). The document's one job on the only three capabilities actually open, and it names a fourth that never existed. | major |
| **V-10** | §4.4 | Five ✓ rows: `inventory.view`, `.edit_identity`, `.edit_pricing`, `.edit_purchase`, `.retire` | None exists. The real inventory vocabulary is `inventory.create/reserve/pack/ready/audit/transfer`. | major |
| **V-11** | §4.4, §3.1 W6 | Warehouse may Quick Add equipment | `inventory.create` maps to `canCreateBundle` = Owner · Admin · Manager; **Warehouse is refused**, and `createEquipment.ts` and `createBundle.ts` both declare that one string. W6's Quick Add raises `ActionPermissionError` today. | major |
| **V-12** | §7 | `portal_users`, `portal_sessions`, `portal_auth_challenges` are deny-all | Only **`portal_auth_challenges`** is deny-all. `portal_users` and `portal_sessions` already carry `auth.uid()` self-read bindings and staff write paths from 0072. R-11 should be re-scoped from "write the binding" to "verify it". | major |
| **V-13** | §3.1 E2, §4.6 | Floor and Driver submit own expenses | Live `public.expenses` INSERT is gated on `auth_is_finance_or_admin()` and the only SELECT is `auth_can_view_money()` — those three roles can neither insert their own claim nor read it back. E2 is impossible until own-row policies exist. | major |
| **V-14** | §12.2 D-8 | Owner grants Manager → succeeds | `public.users` had exactly **one** policy (`users_select_own`, SELECT). With RLS on there was no INSERT/UPDATE path, so **no role assignment was possible for anyone**, Owner included. **✅ FIXED 8 Sep — R-27, migration `0101`.** Fixed *without* opening a write policy: `authenticated` already holds `UPDATE` on `users.primary_role` at the grant level, so an UPDATE policy would have made `email`, `branch_id` and `employee_code` writable by the same `PATCH`. Two SECURITY DEFINER RPCs instead — `set_staff_role`, `set_staff_active` — each writing one column, Owner-gated, refusing the portal role and refusing to empty the Owner set. `users` still carries **no** write policy, which POST-CONDITION 3 asserts. **N-5: written and proven under PGlite, NOT applied to live.** | ~~major~~ → fixed in tree |
| **V-15** | §12.2 D-suite | Nine per-role database tests | Live `auth.users` = 1. There is no Manager, Accounts, Technician, Driver or Client seat to sign in as, so D-3/D-5/D-8/D-9 have no subject. Either provision the identities or document the `app.current_user_id` impersonation harness — `auth_user_role()` supports it. | major |
| **V-16** | §12.1 R-4 | "two 0074s exist; renumber first" | One `0074`. Duplicated prefixes are **0056** and **0076**, both applied to live. Next free is **0097**. Following R-4 literally would renumber applied migrations. | minor |
| **V-17** | §14 Keeps | "`canCreateBooking` five roles" | No such symbol. The five-role set is real, named `BOOKING_DESK`, exposed as `canWriteBookingDesk`, and shared by three predicates. | minor |
| **V-18** | §4.6 | `payment.record` ○ | The live string is **`payment.create`**, mapped to `canRecordPayment` = Owner · Coordinator · Accounts (Admin and Manager refused, contradicting §2's "Money: All"). Note R-2 instructs renaming it to `payment.record`, which **§15.2 N-6 forbids** — the document contradicts itself. | minor |
| **V-19** | header vs §14 | Header "v1.0"; changelog lists v1.1 | Both predate this pass. This document is **v1.2**. | note |
| **V-20** | location line, §15.3 | "beside Foundation v3.0 and UI_UX.md"; resolution order names MASTER.md | **None of the three exists** anywhere in the repo or workspace. `rbac.policies.json` (T-3) does not exist either, but that one is expected — T-3 creates it. §15.3's order needs rewriting against files that are real. | note |

### 16.2 What this does not touch

Verified true and left alone: P1 fail-closed (an unknown capability denies Owner — there is a
test sentinel for it); one capability per action across all 43 action files; `create_booking()`
is SECURITY INVOKER; `booking_discounts_money_blind` refuses Floor with a `WITH CHECK`;
discounts ungated on both sides; W1's `bookings_insert` / `booking_stage_transitions_insert`;
`auth_user_role()`'s `Client` fallback; `auth_can_view_money()` excluding exactly Warehouse,
Technician, Driver and Client; and the Rs 25,000 damage boundary.

### 16.3 Order of work

⛔ **Re-ordered 8 Sep (R-25).** V-2 was listed here as live; it is not — its action is
`implemented: false` and the dispatcher refuses before the permission check, so nothing could reach
the write. It is **fixed anyway** (one line, R-25), which leaves:

**V-5** (Law 6's write trigger and the view masking are not on production) and **V-14** (no role can
be assigned at all — `public.users` has one SELECT policy and no INSERT/UPDATE path). Those two are
the live defects, and both need a migration, so both are **N-5: written, not applied**. Everything
else in §16.1 is a correction to this document.

⛔ **Updated 8 Sep (R-27).** V-14 is now written too — `0101_staff_roles_are_assignable.sql`, proven
on the full chain under PGlite with a 12-check behavioural probe. So both remaining live defects are
in the same state: **written, tested locally, unapplied.** Neither is closed until Babin runs the
backup step and applies them; the gap between the repo and production is the risk now, not the
absence of a fix. `0101` is the sixteenth unapplied migration.
