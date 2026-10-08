# Booqable Research — Bulk Action System & Batch Processing

**Document Type:** Empirical Interaction Analysis & Technical Deconstruction  
**Subject:** Booqable Admin Backend UI (Bulk Actions & Multi-Select Mechanics)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Selection Architecture & Toolbar State Transitions

Booqable implements a **progressive selection pipeline** that transitions the table header toolbar from a dormant state into an active batch execution bar:

```
State 0: Zero Items Selected (Default Table Toolbar)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ]  Search [               ]   Filters (2)   Actions ▾ (Disabled)   Columns ▾   Export│
└────────────────────────────────────────────────────────────────────────────────────────┘

State 1: 1 or More Items Selected (Bulk Mode Engaged)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [-]  3 bookings selected   [ Select all 14 matching this filter ]   Actions ▾ [Blue]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                                                            │
                                                                            ▼ (Dropdown)
                                                              ┌──────────────────────────┐
                                                              │ 🏷️  Add tags...          │
                                                              │ 📄  Print packing slips  │
                                                              │ 🖨️  Print contracts      │
                                                              │ 📦  Mark as Picked up    │
                                                              │ ─────────                │
                                                              │ 📁  Archive bookings     │
                                                              │ ❌  Cancel bookings      │
                                                              └──────────────────────────┘
```

### 1.1 Selection Mechanics & Visual States

| Selection Level | Master Checkbox Visual | Toolbar Text | Action Dropdown State |
|---|---|---|---|
| **0 Selected** | Unchecked `[ ]` | Standard table controls | Disabled / Muted Gray (`opacity: 0.5`) |
| **1 to (N-1) on Page** | Indeterminate `[-]` | `"{count} {entity} selected"` | Enabled / Primary Blue (`#1b68b3`) |
| **All on Current Page** | Checked `[✓]` | `"{pageSize} selected"` + link: *"Select all {queryTotal} across all pages"* | Enabled / Primary Blue |
| **All Matching Query** | Checked `[✓]` (Active Glow) | `"All {queryTotal} bookings selected"` | Enabled / Global Scope Flagged |

---

## 2. Bulk Actions Catalog by Entity

### 2.1 Orders / Bookings (`/orders`)

| Bulk Action | Scope / Preconditions | Confirmation Required? | Consequence / Database Write |
|---|---|---|---|
| **Add / Remove Tags** | Any selected bookings | Modal with searchable tag input | Appends or removes tags from `orders_tags` |
| **Print Packing Slips** | Stage: `Reserved` or `Started` | None (Direct PDF generation) | Merges PDF slips into a single continuous print stream |
| **Batch Pick Up** | Stage: `Reserved` only | Confirmation modal listing shortages | Advances valid bookings to `Started`; skips shortage lines |
| **Batch Return** | Stage: `Started` only | Modal warning for missing gear | Advances bookings to `Returned` |
| **Archive Bookings** | Stage: `Returned` or `Cancelled` only | Simple Confirmation Dialog | Sets `archived = true`, removes from primary list views |
| **Cancel Bookings** | Stage: `Concept` or `Reserved` only | Destructive Modal (Red CTA) | Frees inventory reservations; records cancellation reason |

### 2.2 Inventory & Products (`/product_groups`)

| Bulk Action | Scope / Preconditions | Confirmation Required? | Consequence / Database Write |
|---|---|---|---|
| **Edit Visibility** | Any products | Dropdown: `Online & Backoffice`, `Backoffice only`, `Hidden` | Updates storefront catalog visibility flags |
| **Assign Tax Profile** | Any products | Select Tax Rate (e.g. Standard 13%, Exempt) | Bulk updates `tax_profile_id` |
| **Assign Price Ruleset** | Any products | Select Pricing Template | Applies daily/weekly multipliers across selected groups |
| **Add / Remove Tags** | Any products | Multi-tag chip selector | Bulk updates taxonomy tags |
| **Export Selected** | Any products | Direct file download | Generates CSV with SKU, stock, and pricing data |
| **Delete Products** | Zero active rentals only | Destructive Dialog requiring typing product count | Soft-deletes or blocks if booking history exists |

### 2.3 Customers / Clients (`/customers`)

| Bulk Action | Scope / Preconditions | Confirmation Required? | Consequence / Database Write |
|---|---|---|---|
| **Assign Client Tags** | Any clients | Tag selector modal | Tags clients as `VIP`, `Student`, `Agency`, `High Risk` |
| **Send Marketing Email** | Opted-in clients only | Opens email composer drawer | Queues email via SendGrid/Postmark integration |
| **Archive Clients** | No active bookings | Simple Confirmation | Hides client from autocomplete search |
| **Export Client VCF/CSV**| Any clients | Direct download | Exports contact cards and billing details |

---

## 3. Destructive Action Safety & Error Interception

Booqable implements multi-layer defense against accidental bulk corruption:

### 3.1 Partial Execution & Skipping Rule
When performing an action like **Batch Pick Up** on 10 bookings where 2 have stock shortages:
1. Booqable does NOT fail the entire transaction.
2. It executes pickup for the 8 valid bookings.
3. It keeps the 2 failed bookings checked in the table and displays a floating warning toast:
   > *"8 bookings picked up successfully. 2 bookings (#841, #844) were skipped due to equipment shortages."*

### 3.2 Destructive Action Safeguards
For irreversible bulk operations (such as **Bulk Cancel** or **Bulk Delete**):
- Button styled with high-consequence Red (`--danger`).
- Dialog displays an explicit enumeration of items being affected:
  > *"Are you sure you want to cancel 5 bookings? This will immediately release all reserved equipment back into available inventory."*
- Requires explicit user confirmation click before payload dispatch.

---

## 4. Babin Rentals OS Architectural Synthesis

### What Babin Rentals OS Copies:
1. **Selection Query Escalation:** The pattern of selecting current page (`20 items`) and escalating to the entire database query (`Select all 120 matching bookings`) is essential for warehouse managers managing seasonal dispatch.
2. **Batch Document Merging:** Merging packing slips into one printable PDF stream saves floor staff hours during morning dispatch.

### What Babin Rentals OS Changes:
1. **Audit Trail Completeness (Law 3):** Booqable does not record which specific operator performed a bulk archive. Babin Rentals OS enforces that every bulk operation records an atomic `operation_sessions` or `audit_events` row with `actor_id`, `ip_address`, and the full list of `target_ids`.
2. **Shortage Prohibition on Bulk:** In Babin Rentals OS, bulk pickup is **strictly refused** if any flight case or serialized item has not completed optical QC or sensor cleaning.
