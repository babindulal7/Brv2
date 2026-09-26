# Booqable Research — Table Interactions & Responsive Data Grid

**Document Type:** Empirical Interaction Analysis & Technical Deconstruction  
**Subject:** Booqable Admin Backend UI (Table Mechanics & Grid Systems)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Table Architecture & Visual Anatomy

The primary data grid in Booqable serves as the high-throughput operational console. Across Bookings, Inventory, and Customers, it adheres to strict structural standards:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ]  BOOKING  │ CLIENT       │ STATUS   │ PERIOD              │ TOTAL   │ ACTIONS      │
├────────────────────────────────────────────────────────────────────────────────────────┤  ▲ Sticky Header
│ [x]  #B-854   │ Bikash S.    │ Reserved │ 24 Jul – 26 Jul     │ Rs.14.5k│ [↑ Pick Up]  │  │ (Row: 48px)
│ [ ]  #B-860   │ Kailash C.   │ Packed   │ 24 Jul – 02 Aug     │ Rs.28.0k│ [↑ Handover] │  ▼
│ [ ]  #B-876   │ Prakash Rai  │ On Rent  │ 23 Jul – 28 Jul     │ Rs.85.0k│ [↓ Return]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Structural Specifications

| Feature | Booqable Implementation | Babin Rentals OS Standard |
|---|---|---|
| **Sticky Header** | `position: sticky; top: 0; z-index: 10;` with subtle bottom border. Remains visible during long table scrolling. | Matches Booqable. Crucial for floor staff scrolling 100+ bookings. |
| **Row Height** | Standard `48px` on desktop. Dense lists drop to `42px`. | **56px Floor Rule (Law 15):** To maintain 44px touch targets without overlapping adjacent rows, Babin enforces 56px minimum row height. |
| **Checkbox Column** | 44px fixed width, vertically centered, master checkbox in `<th>`. | 48px fixed width with 44x44px invisible tap target centered. |
| **Primary Link Column** | Order number or Product name rendered in semi-bold blue (`#1b68b3`). | Rendered in primary brand font with hover underline and preview card trigger. |
| **Monetary Alignment** | Strictly **Right-Aligned** with monospace or tabular figures. | Right-aligned, formatted with Nepali rupee formatting (e.g. `Rs. 1,45,000`). |
| **Row Hover Effect** | Subtle gray tint (`rgba(0, 0, 0, 0.02)`) across entire row. | Clean surface highlight (`var(--surface-hover)`), preserving text contrast. |
| **Row Click Scope** | Clicking white space inside a row navigates to detail page. Checkbox and action buttons have `stopPropagation()`. | Full-row click navigation with strict isolation on checkboxes and buttons. |

---

## 2. Column Management & Customization

### 2.1 Column Visibility Selector (`Columns ▾`)
Positioned at the top right of the table toolbar, a dropdown button labelled **`Columns ▾`** allows operators to toggle optional columns:

```
Columns Dropdown:
┌────────────────────────────────────────┐
│ TOGGLE TABLE COLUMNS                   │
│ ────────────────────────────────────── │
│ [✓] Booking Number      (Locked)       │
│ [✓] Customer Name       (Locked)       │
│ [✓] Status                             │
│ [✓] Rental Period                      │
│ [✓] Line Item Count                    │
│ [ ] Fulfillment Type    (Off by def.)  │
│ [✓] Total Price                        │
│ [✓] Payment Status                     │
│ [ ] Security Deposit    (Off by def.)  │
│ [ ] Tags                (Off by def.)  │
│ [ ] Created At          (Off by def.)  │
│ ────────────────────────────────────── │
│ [ Reset to Default ]                   │
└────────────────────────────────────────┘
```

- **Persistence:** Stored in browser `localStorage` keyed by route (e.g. `booqable:columns:orders`).
- **Required Columns:** Identifier (`#Booking`) and Entity (`Customer`) are permanently locked and cannot be disabled.

### 2.2 Sorting Mechanics
- **Sort Triggers:** Clicking any sortable column header toggles sort order:
  1. Default: Sort by Created Date DESC (`-created_at`)
  2. First click: Sort ASC (`name`)
  3. Second click: Sort DESC (`-name`)
  4. Third click: Return to Default
- **Visual Indication:** Active column displays a persistent directional arrow (`▲` / `▼`). Non-active sortable columns show a muted double-chevron on hover.
- **Multi-Column Sort:** Booqable does not support multi-column sorting; single active column sort only.

---

## 3. Pagination vs Infinite Scroll

Booqable uses **explicit server-side pagination** at the footer of every table:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Showing 1 – 20 of 120 bookings       Page [ 1 ] 2  3  4  5  6  Next →   Rows: [ 20 ▾ ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Rows Per Page Selector:** Dropdown with options: `10`, `20`, `50`, `100` rows per page.
2. **Total Query Count:** Always explicitly states the total matches in the database query (`of 120 bookings`).
3. **URL Query Serialization:** Serializes into `?page=2&per_page=20`.
4. **Why Infinite Scroll was Rejected:**
   - Infinite scroll breaks table footer visibility (e.g. bulk export actions).
   - In rental logistics, jumping to a specific page or maintaining a stable row index while marking items is critical for warehouse coordination.

---

## 4. Responsive Viewport Adaptations

Booqable alters its table structure across three primary viewport tiers:

### 4.1 Desktop (>= 1280px)
- Full 183px side filter rail visible.
- Complete data grid with up to 10 columns visible without horizontal scroll.
- Row quick action buttons rendered inline in the rightmost column.

### 4.2 Tablet / iPad Landscape (768px – 1279px)
- Filter rail unmounts from canvas into an off-canvas drawer (`FilterDrawer`).
- Non-essential columns (`Created At`, `Fulfillment Type`, `Tags`) auto-hide to prevent horizontal scrolling.
- Row heights expand to 56px to accommodate finger taps on touchscreens.

### 4.3 Mobile (< 768px)
- **Table-to-Card Transformation:** The horizontal table morphs into a **vertical card list**.
- Each card contains:
  - Header: `#B-854` + Status Pill (`Reserved`) + Total Price
  - Body: Client Name (`Bikash Shrestha`) + Project Title
  - Schedule: Single-line pickup to return window
  - Footer Action: Full-width button with 44px min-height: `[ ↑ Pick Up Order ]`
- Toolbar collapses into a sticky bottom action bar.
