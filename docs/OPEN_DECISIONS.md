# Babin Rentals OS — Open Decisions Register

**Status:** Authoritative Active Decision Register  
**Last Reconciled:** 29 September 2026

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

## 6. Non-physical floor transitions and completion (§4.59)
- **Question:** How should Service, Sub-rental and Manual item lines resolve during Pack/Handover, and how should a booking with no physical lines reach Returned?
- **Context:** Migration 0139 exempts those line types from Return receipts, while Pack/Handover still require line records in parts of the floor flow. The current Return action also requires a triaged row and a return session.
- **Current Status:** `TODO(decision)` — define non-physical Pack/Handover handling and choose automatic Handover completion or a named no-equipment completion action; never fabricate physical movement or a return receipt.
