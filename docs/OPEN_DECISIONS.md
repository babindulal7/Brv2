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

## 7. Who may read the staff roster (`staff_directory_v`) — RESOLVED
- **Decision:** Option (b) (All staff) — keep `auth_is_staff()` on `staff_directory_v`. All authenticated internal staff roles (Warehouse, Technician, Driver, Coordinator, Accounts, Manager, Admin, Owner) may view colleagues on shift and operational rosters. External clients and unauthenticated public/anon remain strictly blocked.
- **Implementation:** Migration `0148_view_anon_leak_closure.sql` (enforces `where auth_is_staff()` inline and revokes `anon` SELECT).
- **Status:** Resolved (3 October 2026, Babin ruling).

---

## 8. Payment Document Numbering Sequence — RESOLVED
- **Decision:** Option 2: Switch payment document sequence to short sequential format `PAY-94` (`padding: 1, include_year: false`), aligning new payment numbers with booking (`BK-1`) and invoice (`INV-1`) bare sequence conventions. Historical payments 1..93 remain immutable under Law 3 and Law 4 as `PAY-2026-0001` .. `PAY-2026-0093` (`trg_payments_reject_update`).
- **Implementation:** Migration `0151_payment_numbering_short_format.sql` (updates `number_sequences` for `payment` to `padding = 1, include_year = false`).
- **Status:** Resolved (3 October 2026, Babin ruling, Migration 0151).

---

## 9. Security Deposit Release and Settlement Authority (D1) — RESOLVED
- **Decision:** Authority is scoped strictly to `Owner · Admin · Manager · Accounts` (`M+ · Accounts`), matching capability `deposit.release` in `docs/PERMISSIONS.md` §4.6. Operations staff (`Warehouse`, `Technician`) and `Coordinator` inspect physical gear and flag missing/damaged items, but liability release and movement recording require management or financial authority.
- **Implementation:** Capability `deposit.release` enforced in `src/actions/core.ts`, `src/lib/rbac.ts` (`canReleaseDeposit`), and `src/actions/finance/settleDeposit.ts`.
- **Status:** Resolved (4 October 2026, Babin ruling).

---

## 10. Audit Reason for Security Deposit Penalty Application / Forfeiture (D2) — RESOLVED
- **Decision:** When any portion of a client's security deposit is applied to damages, late fees, or missing equipment penalties (`Applied` movement), an explicit audit reason of at least 10 characters is mandatory, matching the zero-value close override standard.
- **Implementation:** Validation in `src/actions/finance/settleDeposit.ts` (`appliedReason.trim().length >= 10`) and tested in `src/actions/finance/__tests__/settleDeposit.test.ts`.
- **Status:** Resolved (4 October 2026, Babin ruling).


