# Babin Rentals OS — Open Decisions Register

**Status:** Authoritative Active Decision Register  
**Last Reconciled:** 23 September 2026

*Note: All decisions resolved by rulings R-00 through R-43 or verified in `PROGRESS.md` (e.g. damage resolution, fail-closed transitions, atomic booking creation, same-day rentals, 13% VAT) have been removed from this register.*

---

## 1. Bundle Component Removal / Deactivation (§4.52)
- **Question:** How should an individual equipment component be removed from an existing active bundle?
- **Context:** Law 3 prohibits physical `DELETE` operations on operational tables, and bundle line quantity cannot be zero.
- **Proposed Options:**
  - Option A: Add an `is_active boolean DEFAULT true` column to `bundle_items` and filter active components in booking views.
  - Option B: Add a `deactivated_at timestamptz` soft-delete column.
- **Current Status:** Open product/schema ruling.

---

## 2. Closing Zero-Value Rentals Without Billing (§4.51)
- **Question:** Can a genuine zero-value rental (e.g., internal test, sponsored production, goodwill replacement) be closed without issuing an invoice?
- **Context:** The database close gate currently requires all issued invoices to be settled. An uninvoiced rental cannot reach `Closed` unless a Rs 0 invoice is generated.
- **Proposed Options:**
  - Option A: Require a standard Rs 0 invoice with 100% discount.
  - Option B: Introduce an explicit Owner/Admin override action `closeWithoutBilling(reason)` that audits the exemption.
- **Current Status:** Open business ruling.

---

## 3. Purchase Request Approval Scope (§4.29)
- **Question:** Should the capability to approve equipment purchase requests be restricted from general staff?
- **Context:** The current mirrored RLS policy admits staff broadly to `purchase.approve`.
- **Proposed Options:**
  - Option A: Narrow `purchase.approve` strictly to `Owner · Admin · Manager`.
  - Option B: Retain broad staff approval with threshold limits (e.g., Coordinator up to Rs 10,000; Admin above).
- **Current Status:** Open security/finance ruling.

---

## 4. Consumable Inventory Tracking Semantics (§4.49)
- **Question:** How should consumable items (tape, gels, batteries) be handled across the Return and Reset workspaces?
- **Context:** Serialized assets require physical check-in and damage evaluation. Consumables are consumed during the rental.
- **Proposed Options:**
  - Option A: Treat consumables as non-returnable expense lines that auto-resolve upon Handover.
  - Option B: Track returned unused bulk quantity and credit the difference.
- **Current Status:** Open operations ruling.

---

## 5. Official Bikram Sambat Calendar Expansion (§4.34)
- **Question:** Provision of official month lengths for BS 2084 and beyond.
- **Context:** `src/lib/bs.ts` currently anchors BS 2083. Expanding to 2084+ requires the official publication of the Nepal Calendar Determination Committee to prevent date calculation errors on VAT invoices.
- **Current Status:** Blocked externally on official committee data.
