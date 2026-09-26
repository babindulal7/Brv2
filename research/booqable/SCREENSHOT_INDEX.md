# Booqable Research — Canonical Screenshot & Visual Evidence Index

**Document Type:** Empirical Interaction Analysis & Visual Evidence Index  
**Subject:** Booqable Admin Backend UI (Screen States & Interaction Snapshots)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Overview of Visual Evidence

This index documents the **20 canonical operational states** captured and analyzed across the Booqable administrative surface and its verified parity implementations in Babin Rentals OS. Each state is documented with its route, UI components, interaction triggers, and operational significance.

---

## 2. Canonical State Directory (States 01 – 20)

### 01 · Dashboard Default View (`01-dashboard-default`)
- **Route:** `https://babin-rentals.booqable.com/` (Booqable) / `http://localhost:3000/dashboard` (OS)
- **Visual Description:** Split two-panel dispatch console showing "Going out" (pickups scheduled for today) and "Coming back" (returns scheduled for today). Time-grouped at `06:00 AM`, `08:00 AM`, `02:00 PM`.
- **Key Elements:** Topbar breadcrumb `Today`, global `+ New booking` button, metric cards, order movement cards with client avatar, project title, and line item tally.
- **Artifact Reference:** `file:///C:/Users/use/.gemini/antigravity/brain/776f073e-4faa-4163-8563-aabcea780dd5/dashboard_reloaded.png`

### 02 · Dashboard Filter / Location Drawer (`02-dashboard-filter-open`)
- **Route:** `http://localhost:3000/dashboard`
- **Visual Description:** Slide-out drawer displaying location switcher (`Kathmandu Main` vs `Pokhara Branch`), date preset chips (`Today`, `Tomorrow`, `Next 7 Days`), and movement type toggles.
- **Key Elements:** Location radio group, branch inventory availability counters, reset button.

### 03 · Dashboard Today Movements (`03-dashboard-today`)
- **Route:** `http://localhost:3000/dashboard?scope=today`
- **Visual Description:** Strict operational day view anchored to the `06:00 → 06:00` rental day (Law 7 / Foundation §8.3).
- **Key Elements:** Zero marketing fluff; clean movement rows with direct operational shortcuts (`Cases & Gear`, `Handover`, `Return`).

### 04 · Dashboard Pickups Focus (`04-dashboard-pickups`)
- **Route:** `http://localhost:3000/dashboard#going-out`
- **Visual Description:** Filtered view displaying only outbound dispatch movements. Shows packing readiness badges (`● Packed`, `● 1 shortage`).
- **Key Elements:** Direct `Handover` quick action button triggering digital sign-on-glass modal.

### 05 · Dashboard Returns Focus (`05-dashboard-returns`)
- **Route:** `http://localhost:3000/dashboard#coming-back`
- **Visual Description:** Filtered view displaying inbound equipment returns. Shows expected return time, overdue counters, and security deposit hold status.
- **Key Elements:** `Return & Inspect` quick action button triggering check-in inspection drawer.

### 06 · Dashboard Late / Overdue Alerts (`06-dashboard-late`)
- **Route:** `http://localhost:3000/dashboard?filter=late`
- **Visual Description:** High-urgency alert strip surfacing overdue bookings (`View late (1)`).
- **Key Elements:** Red badge `OVERDUE · 65 DAYS LATE`, client phone shortcut, late fee calculation trigger.

### 07 · Orders List Default (`07-orders-default`)
- **Route:** `https://babin-rentals.booqable.com/orders` / `http://localhost:3000/rentals`
- **Visual Description:** 183px side filter rail on the left, top metric strip (Total Orders, Total Revenue, Pending Pickup), search toolbar, and 8-column data grid.
- **Key Elements:** Quick tabs (`All`, `Reserved`, `Started`, `Returned`), sticky header, pagination footer.

### 08 · Orders Filter Panel Open (`08-orders-filter-open`)
- **Route:** `http://localhost:3000/rentals?drawer=open`
- **Visual Description:** Multi-section filter panel showing Status checkboxes with live record counts (`Reserved (14)`, `Started (8)`), Payment status, and Date Range Presets.
- **Key Elements:** Dynamic facet counts, collapsible section chevrons, `Clear filters` link.

### 09 · Orders Multiple Filters Compound Stacking (`09-orders-multiple-filters`)
- **Route:** `http://localhost:3000/rentals?stage=Packed&payment=unpaid&starts_from=today`
- **Visual Description:** Table display when 3+ facets are stacked simultaneously.
- **Key Elements:** Active filter chip row above table: `[Stage: Packed ×] [Payment: Unpaid ×] [Today ×] [Clear all]`.

### 10 · Order Row Quick Actions (`10-order-row-actions`)
- **Route:** `http://localhost:3000/rentals`
- **Visual Description:** Rightmost action column of order rows displaying state-dependent verb buttons.
- **Key Elements:** Blue `↑ Handover` button for Packed rows, Green `↓ Return` button for On Rent rows, `•••` overflow menu.

### 11 · Order Context Menu (`11-order-context-menu`)
- **Route:** Clicked `•••` on booking `#B-854`
- **Visual Description:** Floating context dropdown menu with 6 operational verbs.
- **Key Elements:** `View Rental`, `Edit Lines`, `Register Payment`, `Print Documents`, `Duplicate`, `Cancel Booking (Red)`.

### 12 · Bulk Selection Active (`12-bulk-selection`)
- **Route:** `http://localhost:3000/rentals` (3 checkboxes selected)
- **Visual Description:** Table toolbar morphs into batch action mode.
- **Key Elements:** Indeterminate master checkbox `[-]`, selection label `3 bookings selected`, blue `Actions ▾` dropdown button.

### 13 · Bulk Actions Menu Open (`13-bulk-actions-menu`)
- **Route:** Clicked `Actions ▾` in bulk mode
- **Visual Description:** Dropdown menu displaying batch operations: `Print Packing Slips`, `Add Tags`, `Batch Return`, `Archive`.
- **Key Elements:** Action icons, separator line above destructive `Cancel Bookings`.

### 14 · Pickup / Handover Flow (`14-pickup-flow`)
- **Route:** `http://localhost:3000/rentals/B-854/handover`
- **Visual Description:** High-density equipment verification workspace with dual-mode digital sign-on-glass modal open.
- **Key Elements:** Serial number verification checklist, barcode scanner, deposit hold warning, cursive legal signature pad.
- **Artifact Reference:** `file:///C:/Users/use/.gemini/antigravity/brain/776f073e-4faa-4163-8563-aabcea780dd5/sign_modal_open.png`

### 15 · Return & Inspection Flow (`15-return-flow`)
- **Route:** `http://localhost:3000/rentals/B-854/return`
- **Visual Description:** Equipment check-in interface with optical condition logging (Sensor, Glass, Cables).
- **Key Elements:** `Mark Returned` buttons, `Report Damage` trigger, maintenance queue creation, deposit refund tally.
- **Artifact Reference:** `file:///C:/Users/use/.gemini/antigravity/brain/776f073e-4faa-4163-8563-aabcea780dd5/handover_signed_complete.png`

### 16 · Payment Registration Modal (`16-payment-flow`)
- **Route:** Clicked `Register Payment` on Booking Detail
- **Visual Description:** Modal dialog displaying balance breakdown (Total: Rs. 14,500, Paid: Rs. 0, Due: Rs. 14,500).
- **Key Elements:** Payment method selector (Cash, Bank QR / Fonepay, Card), Reference textbox, `Confirm Payment` button.

### 17 · Product Hover Preview Card (`17-product-preview`)
- **Route:** Hover over `Sony FX3` in Booking Detail
- **Visual Description:** Floating 360px card showing product photo, total owned (4), available in vault (2), daily rate (Rs. 4,500).
- **Key Elements:** High-resolution equipment photo, stock status pills, vault shelf tag (`Shelf A-1`).

### 18 · Customer Hover Preview Card (`18-customer-preview`)
- **Route:** Hover over `Bikash Shrestha` in Bookings List
- **Visual Description:** Floating 340px card showing client profile, phone, email, VIP badge, lifetime rental spend.
- **Key Elements:** Direct `tel:` and `mailto:` links, active rental status, `New Booking` shortcut.

### 19 · Order Hover Preview Card (`19-order-preview`)
- **Route:** Hover over `#B-854` in Calendar view
- **Visual Description:** Floating 380px card showing booking schedule, line item list, deposit status, and total price.
- **Key Elements:** Mini equipment breakdown, stage pill, `Open Booking →` link.

### 20 · Empty Filter Results State (`20-empty-filter-results`)
- **Route:** `http://localhost:3000/rentals?stage=Cancelled&q=NonExistent`
- **Visual Description:** Clean empty state illustration indicating zero matches for current filters.
- **Key Elements:** Heading `No bookings match your filters`, description text, two action buttons: `[ Clear search ]` and `[ Reset all filters ]`.
