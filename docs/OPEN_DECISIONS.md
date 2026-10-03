# Babin Rentals OS — Open Decisions Register

**Status:** Authoritative Active Decision Register  
**Last Reconciled:** 3 October 2026

*Note: All decisions resolved by rulings R-00 through R-43 or verified in `PROGRESS.md` (e.g. damage resolution, fail-closed transitions, atomic booking creation, same-day rentals, 13% VAT) have been removed from this register.*

---

## 1. Bundle Component Removal / Deactivation (§4.52) — RESOLVED
- **Decision:** Implemented soft-deactivation obeying Law 3 (no physical `DELETE`).
- **Implementation:** Migration 0134 (`is_active`, `deactivated_at`, `deactivated_by`), `updateBundle` line deactivation action, query filtering in `bundles.ts`, and UI component removal with non-empty bundle validation in `EditBundle.tsx`.
- **Status:** Resolved (25 September 2026).

---

## 2. Closing Zero-Value Rentals Without Billing (§4.51) — RESOLVED
- **Decision:** Implemented explicit Owner/Admin override action with mandatory audit reason (minimum 10 characters).
- **Implementation:** Migration 0135 (updates `apply_booking_stage_transition()` to accept override and record `'CloseOverride'` in `audit_events`), `closeRental` action with permission checks, and `BookingDetail.tsx` zero-value close trigger modal.
- **Status:** Resolved (25 September 2026).

---

## 3. Purchase Request Approval Scope (§4.29) — RESOLVED
- **Decision:** Narrowed `purchase.approve` strictly to `Owner · Manager` in both database RLS and application RBAC.
- **Implementation:** Migration 0064 & 0069 (`auth_can_approve_purchase()`), `src/lib/rbac.ts` (`canApprovePurchase`), and `src/actions/inventory/approvePurchaseRequest.ts`.
- **Status:** Resolved (Migrations 0064, 0069).

---

## 4. Consumable Inventory Tracking Semantics (§4.49)
- **Question:** How should consumable items (tape, gels, batteries) be handled across the Return and Reset workspaces?
- **Context:** Serialized assets require physical check-in and damage evaluation. Consumables are consumed during the rental.
- **Proposed Options:**
  - Option A: Treat consumables as non-returnable expense lines that auto-resolve upon Handover.
  - Option B: Track returned unused bulk quantity and credit the difference.
- **Current Status:** Resolved as Option A (29 Sep 2026, spec addendum Trial 13 gaps #3/#5): Consumable-tracked lines are exempt from the Return receipt gate (0141, verb + workspace agree) and deplete `products.total_quantity` automatically at Handover into append-only `consumable_stock_movements` (0142). WRITTEN + VERIFIED locally, NOT APPLIED to production — Babin may still flip to Option B before the production apply, which would replace 0141/0142.

---

## 5. Official Bikram Sambat Calendar Expansion (§4.34)
- **Question:** Provision of official month lengths for BS 2084 and beyond.
- **Context:** `src/lib/bs.ts` currently anchors BS 2083. Expanding to 2084+ requires the official publication of the Nepal Calendar Determination Committee to prevent date calculation errors on VAT invoices.
- **Current Status:** Blocked externally on official committee data.

---

## 6. Non-physical floor transitions and completion (§4.59) — RESOLVED
- **Decision:** Non-physical lines (`Service`, `Sub-rental`, `Manual item`) are exempt from Pack and Handover physical gates (matching the 0139 Return gate). Services are displayed as informational lines without requiring barcode scans, fake movements, or checklist ticks. Service-only bookings advance via a dedicated `fulfillServiceRental` action (`Booked -> Packed -> On Rent -> Returned`) without opening empty warehouse Pack/Return sessions or fabricating equipment movements.
- **Implementation:** Migration 0149 (`apply_booking_stage_transition()` with `v_has_physical_lines` and non-physical line exemption in Handover gate), `src/actions/rentals/fulfillServiceRental.ts`, `src/actions/rentals/floorVerb.ts`, `src/lib/rentalActions.ts` (`isServiceOnly`), `src/modules/rentals/HandoverWorkspace.tsx`, and `src/modules/rentals/BookingDetail.tsx`.
- **Status:** Resolved (3 October 2026, Migration 0149).

## 7. Who may read the staff roster (`staff_directory_v`)
- **Question:** Is the staff directory Owner-only, or readable by every signed-in staff member?
- **Context:** `docs/PERMISSIONS.md` says both. P9 and AD2 scope the roster to the Owner; §4.3 says "all staff". The disagreement is not new — R-27 (8 Sep) refused §12.2 D-8's "Admin grants Manager" partly on the ground that "`staff_directory_v` carries `where auth_user_role() = 'Owner'` inline, so an Admin gets zero rows to act on."
- **What actually happened:** `0120_users_visibility_and_role_ceiling.sql` recreated the view and **dropped that row predicate entirely**. The view then had no row gate, and the only thing narrowing it was a grant `anon` did not hold — so every signed-in role, Client included, could list the roster. That is the state the 3 Oct 2026 third-party audit found, and it invalidated R-27's third ground.
- **Interim state:** `0148_view_anon_leak_closure.sql` (WRITTEN, locally verified, **not applied to live** — N-5) re-emits the view with `and auth_is_staff()` and revokes `anon` from every view in `public`. `auth_is_staff()` is `auth_user_role() <> 'Client'` (0014), so the roster is readable by all staff and by nobody unauthenticated. This was chosen because it **strictly narrows** (B-1) without answering the dispute — it closes the exposure either way.
- **Options:**
  - **(a) Owner-only** — restore `auth_user_role() = 'Owner'` inline. Requires `canManageSettings` and `StaffDirectory.tsx`'s render gate to move together, or the screen offers a list that returns nothing.
  - **(b) All staff** — keep `auth_is_staff()`, and correct P9/AD2 in `PERMISSIONS.md` so the document stops contradicting §4.3. This is what R-27's third ground assumed all along, and it is the status quo ante.
  - **(c) All staff, narrowed columns** — every staff member sees name, role, employee code, branch and active flag, but not `email`, mobile or PIN state. The roster stays useful for "who is on shift" without becoming a contact directory for roles that have no need of one.
- **Current Status:** `TODO(decision)` — Babin's call. Until it is ruled, do not move the predicate again: any change to `staff_directory_v` belongs in a **new** migration, never an edit to `0148`, whose predicate will have shipped by then.
- **Related:** R-27 (8 Sep, amended 3 Oct 2026), `docs/live/APPLY_PLAN_2026-10-03.md`.
