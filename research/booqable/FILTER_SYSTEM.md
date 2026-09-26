# Booqable Research — Filter System Architecture

**Document Type:** Empirical Interaction Analysis & Technical Deconstruction  
**Subject:** Booqable Admin Backend UI (Live Inspection & Structural Audit)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Executive Summary & Placement Grammar

Booqable uses a **hybrid filtering architecture** combining three distinct UI expressions across its administrative surfaces:
1. **The Left Side Rail (183px Fixed Width):** Used on primary list pages (`/orders`, `/product_groups`, `/customers`, `/reports/documents/invoices`).
2. **Top-of-Table Quick Segment Presets:** Used on `/orders` (Quick View tabs: *All, Reserved, Picked up, Returned, Archived*) and `/calendar`.
3. **Modal/Drawer Mobile Fallbacks:** Triggered on viewports below 1024px where the 183px rail collapses into an off-canvas drawer.

### 1.1 Placement & Trigger Mechanics

| Dimension | Booqable Implementation | Behavioral Characteristics |
|---|---|---|
| **Trigger Position** | Left of Page Title or inside Table Toolbar | Icon button `[▯]` sits adjacent to page title (`H1`). On list tables, also surfaced as a toggle button `Filters [Icon: Sliders] (Count)`. |
| **Active Count Badge** | Displayed on both trigger and section headers | Numeric badge (e.g. `Filters 3`) appears when active filter count > 0. In individual facet sections, active counts are rendered as a subtle gray counter `(2)`. |
| **Presentation Mode** | Inline Side Rail (Desktop) / Slide-over Drawer (Tablet/Mobile) | On desktop (>=1024px), the rail is **inline**, pushing table content to the right without covering data. Below 1024px, it becomes an overlay drawer with backdrop shade. |
| **Rail Dimensions** | Fixed `183px` width (`min-width: 183px`, `max-width: 183px`) | Deliberately narrow to maximize horizontal real estate for multi-column data grids. |
| **Collapse / Reset** | Header-level toggle + Section accordions | Clicking `[▯]` completely unmounts the rail, expanding the table to 100% width. Each category has an accordion chevron (`^` / `v`) that collapses section items. |

```
Desktop Layout:
┌────────────────┬────────────────┬────────────────────────────────────────────────────────┐
│ Global Nav     │ Filter Rail    │ Main Working Surface                                   │
│ (Icons/Labels) │ (183px Fixed)  │                                                        │
│                │ ────────────── │ ┌────────────────────────────────────────────────────┐ │
│  Dashboard   │ Status      (2)│ │ Tabs: All (620) · Reserved (14) · Started (8)      │ │
│  Bookings    │ [x] Reserved   │ ├────────────────────────────────────────────────────┤ │
│  Inventory   │ [ ] Started    │ │ Search [               ]  Actions ▾  Columns ▾     │ │
│  Customers   │ ────────────── │ ├────────────────────────────────────────────────────┤ │
│  Documents   │ Payment        │ │ Active Chips: [Status: Reserved ×] [Unpaid ×]      │ │
│  Settings    │ [x] Unpaid     │ ├────────────────────────────────────────────────────┤ │
│                │ ────────────── │ │ Table Rows (Sticky Header, 48px row height)        │ │
│                │ Dates       📅 │ └────────────────────────────────────────────────────┘ │
│                │ ────────────── │                                                        │
│                │ ⬇ Export CSV   │                                                        │
└────────────────┴────────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Exhaustive Filter Category Schema by Page

### 2.1 Orders / Bookings (`/orders`)

The Bookings list contains the most complex multi-facet filtering engine in Booqable:

```json
[
  {
    "page": "Orders",
    "filter_group": "Status",
    "type": "multi-select-checkbox",
    "behavior": "OR within group, AND across groups",
    "options": [
      { "id": "concept", "label": "Concept", "has_count": true },
      { "id": "reserved", "label": "Reserved", "has_count": true },
      { "id": "started", "label": "Started (Picked up)", "has_count": true },
      { "id": "returned", "label": "Returned", "has_count": true },
      { "id": "cancelled", "label": "Cancelled", "has_count": true, "default_hidden": true },
      { "id": "archived", "label": "Archived", "has_count": true, "default_hidden": true }
    ],
    "default": ["concept", "reserved", "started", "returned"]
  },
  {
    "page": "Orders",
    "filter_group": "Payment Status",
    "type": "multi-select-checkbox",
    "behavior": "OR within group, AND across groups",
    "options": [
      { "id": "paid", "label": "Paid", "has_count": true },
      { "id": "partially_paid", "label": "Partially paid", "has_count": true },
      { "id": "unpaid", "label": "Unpaid", "has_count": true },
      { "id": "overpaid", "label": "Overpaid", "has_count": true },
      { "id": "deposit_held", "label": "Deposit held", "has_count": true }
    ],
    "default": null
  },
  {
    "page": "Orders",
    "filter_group": "Date Range",
    "type": "date-dimension-picker",
    "sub_types": [
      { "id": "period", "label": "Period (Active within)" },
      { "id": "starts_at", "label": "Pickup Date (Starts at)" },
      { "id": "stops_at", "label": "Return Date (Stops at)" },
      { "id": "created_at", "label": "Date Created" }
    ],
    "presets": [
      "Today",
      "Tomorrow",
      "This week",
      "Next week",
      "This month",
      "Custom range"
    ],
    "default": null
  },
  {
    "page": "Orders",
    "filter_group": "Fulfillment Type",
    "type": "dropdown-select",
    "options": ["All", "Pickup", "Delivery"],
    "default": "All"
  },
  {
    "page": "Orders",
    "filter_group": "Tags",
    "type": "tag-cloud-multiselect",
    "searchable": true,
    "options": "dynamic_from_tenant_tags",
    "logic": "AND (all tags must match)"
  }
]
```

### 2.2 Inventory / Products (`/product_groups`)

```json
[
  {
    "page": "Inventory",
    "filter_group": "Product Type",
    "type": "dropdown-select",
    "options": ["All", "Rental Product", "Consumable / Sale Item", "Service"]
  },
  {
    "page": "Inventory",
    "filter_group": "Tax Profile",
    "type": "dropdown-select",
    "options": ["All", "Standard VAT 13%", "Zero-rated", "Exempt"]
  },
  {
    "page": "Inventory",
    "filter_group": "Price Ruleset",
    "type": "dropdown-select",
    "options": ["All", "Standard Daily", "Tiered 3-Day", "Weekend Special"]
  },
  {
    "page": "Inventory",
    "filter_group": "Tracking Method",
    "type": "checkbox",
    "options": [
      { "id": "trackable", "label": "Trackable (Serial Numbered)" },
      { "id": "bulk", "label": "Bulk (Bulk Quantity Only)" }
    ]
  },
  {
    "page": "Inventory",
    "filter_group": "Tags",
    "type": "tag-cloud-multiselect",
    "searchable": true
  }
]
```

### 2.3 Customers / Clients (`/customers`)

```json
[
  {
    "page": "Customers",
    "filter_group": "Customer Type",
    "type": "checkbox-facet",
    "options": [
      { "id": "individual", "label": "Individual", "has_count": true },
      { "id": "company", "label": "Company / Corporate", "has_count": true }
    ]
  },
  {
    "page": "Customers",
    "filter_group": "Customer Created",
    "type": "date-preset-picker",
    "presets": ["Last 30 days", "Last 90 days", "This year", "Custom"]
  },
  {
    "page": "Customers",
    "filter_group": "Tags",
    "type": "tag-cloud-multiselect",
    "options": "dynamic"
  }
]
```

---

## 3. Deep Dive into Filter Dimensions

### 3.1 Date Filtering Mechanics

Booqable isolates date filtering into a **modal popover** anchored to the date input field in the side rail.
1. **Dimension Selector:** A radio button or dropdown toggling whether the date range evaluates:
   - `Period`: Matches any rental active for even 1 hour within the window.
   - `Pickup Date` (`starts_at`): Filters exclusively on the release timestamp.
   - `Return Date` (`stops_at`): Filters exclusively on the return due timestamp.
2. **Relative Quick Presets:** 
   - `Today` (00:00 to 23:59)
   - `Tomorrow`
   - `This Week` (Monday to Sunday)
   - `Next Week`
   - `Custom Range` (renders dual-month calendar picker)
3. **URL Query Serialization:**
   `?starts_from=2026-09-26T00:00:00Z&starts_to=2026-09-26T23:59:59Z`

### 3.2 Status Facets & Arithmetic Invariants

Booqable displays live record counts directly inside each checkbox label:
- `Reserved (14)`
- `Started (8)`
- `Returned (592)`

**Critical Observation on Default Visibility Hazard:**
By default, Booqable **silently excludes** `Cancelled` and `Archived` orders from the main list without rendering an explicit active chip. This causes operator confusion when searching for past or cancelled orders.
- *Babin Rentals OS Anti-Pattern Warning:* Never silently hide records. If a default filter is applied, it MUST appear as an explicit, removable chip in the active filter bar.

### 3.3 Payment Status vs Operational Status

Booqable keeps Payment Status completely decoupled from Rental Status:
- An order can be `Started (On Rent)` and simultaneously `Unpaid`.
- An order can be `Concept (Draft)` and `Paid`.
This separation allows the finance team to filter for cash collection (`Unpaid` + `Returned`) while the warehouse team filters for physical logistics (`Reserved` + `Today`).

### 3.4 Location Filtering

In multi-location setups, Location is positioned **at the very top of the rail**:
- Mode: Single select dropdown with an "All Locations" default.
- Persistence: Stored in `localStorage` under `booqable:current_location_id`.
- Navigation: Switching locations reloads list views with `?location_id=<uuid>` and updates available inventory counts across all views.

---

## 4. Combined Filtering & Stacking Behavior

### 4.1 Filter Evaluation Pipeline

When multiple filters are selected, Booqable processes them through this exact logical pipeline:

```
[Status: (Reserved OR Started)]
       AND
[Payment: (Unpaid OR Partially Paid)]
       AND
[Date: starts_at BETWEEN 2026-09-26 AND 2026-09-27]
       AND
[Tags: "VIP" AND "Documentary"]
       AND
[Search Query: "Sony FX3"]
```

### 4.2 Immediate vs Applied Updates

- **Zero "Apply" Button:** Selection of any checkbox or dropdown option triggers an **immediate instant refetch**.
- **Debounced Fetch:** Checkbox toggles trigger immediate queries; text search uses a **300ms debounce**.
- **URL Parameter Reflection:** Every active facet updates the browser `window.location.search` without reloading the page via `history.pushState`:
  ```
  /orders?statuses[]=reserved&statuses[]=started&payment_statuses[]=unpaid&page=1
  ```
- **State Survival:** Refreshing the browser or sending the URL to another user restores the exact filter state.

### 4.3 Active Filter Chips & Clearing Mechanics

Above the table and below the metric strip, Booqable renders an **Active Filter Chip Row**:
- Format: `[Facet Name: Value ✕]` (e.g. `[Status: Reserved ✕]`, `[Payment: Unpaid ✕]`)
- Single Dismissal: Clicking the `✕` on any chip immediately unchecks the box in the rail and refetches.
- Global Reset: If more than one filter is active, a text button **"Clear filters"** appears at the end of the chip row. Clicking it resets the view to default facets.

---

## 5. Key Strengths vs Deficiencies for Babin Rentals OS

### Strengths to Borrow
1. **Immediate visual feedback:** Async counts that update as filters change.
2. **Decoupled logistics and money:** Separate stage vs payment facets prevents status explosion.
3. **URL sync:** Full state preservation across refreshes and links.

### Deficiencies to Avoid
1. **Narrow 183px Rail Waste:** The 183px side rail eats horizontal space even when no filters are actively being toggled. An intelligent slide-over drawer (`FilterDrawer`) with a persistent top chip row provides cleaner ergonomics on laptops and tablets.
2. **Hidden Default Filters:** Silently dropping `Cancelled`/`Archived` bookings is a serious audit risk. All exclusions must be visibly indicated.
3. **No Multi-location Comparison:** Cannot view Location A and Location B simultaneously without switching to "All".
