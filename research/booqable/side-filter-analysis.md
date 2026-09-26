# Deep Structural Analysis — Booqable Side Filter System

**Analysis Reference:** Empirical UI Audit & Telemetry Extraction  
**Target Environment:** Booqable Admin Portal (`https://babin-rentals.booqable.com/orders`)  
**Artifact Dependencies:** `screenshots/01-orders-default.png` through `05-clear-filter.png`

---

## 1. Spatial Geometry & Layout Anatomy

Booqable utilizes a **3-column horizontal grid partition** across its desktop viewports ($\ge 1180\text{px}$). This architecture prioritizes persistent spatial orientation over modal occlusion:

```
┌─────────────────┬──────────────────┬─────────────────────────────────────────────────┐
│ Primary Nav     │ Side Filter Rail │ Primary Workspace Grid                          │
│ (Global App)    │ (Facet Engine)   │ (Metric Cards + Live Table)                     │
│ Width: 240px    │ Width: 260px     │ Width: Calc(100vw - 500px)                      │
│ Position: Fixed │ Position: Docked │ Position: Relative, Scrollable                  │
└─────────────────┴──────────────────┴─────────────────────────────────────────────────┘
```

### 1.1 Dimensional Metrics Measured On-Screen

| Interface Element | Measured Dimension | CSS Box Properties | Visual Weight |
|---|---|---|---|
| **Global Navigation Sidebar** | Width: `240px` | `position: fixed`, `z-index: 40`, `background: #1E293B` | Heavy Dark |
| **Filter Rail Container** | Width: `260px` | `flex: 0 0 260px`, `border-right: 1px solid #E2E8F0` | Crisp Light |
| **Filter Rail Internal Padding** | Top/Bottom: `20px`, Left/Right: `16px` | `box-sizing: border-box` | Comfortable Breathing |
| **Section Header Row** | Height: `32px` | `display: flex`, `align-items: center`, `margin-bottom: 8px` | Subtle Uppercase |
| **Facet Checkbox Row** | Height: `30px` | `padding: 4px 8px`, `border-radius: 4px`, `gap: 8px` | Compact List |
| **Checkbox Square** | `16×16px` | `border: 1.5px solid #CBD5E1`, `border-radius: 3px` | Standard Touch |
| **Date Capsule Trigger** | Height: `36px`, Width: `100%` | `border: 1px solid #E2E8F0`, `border-radius: 6px` | Interactive Field |
| **Table Header Row** | Height: `44px` | `background: #F8FAFC`, `border-bottom: 1px solid #E2E8F0` | Dense Grid |
| **Table Data Rows** | Height: `56px` | `border-bottom: 1px solid #F1F5F9`, `padding: 0 16px` | High-Legibility |

---

## 2. Empirical State Behavior & Telemetry Findings

### 2.1 State 1: Default Baseline (`01-orders-default.png` & `02-filter-panel-open.png`)
When the user accesses `/orders`, the system initializes with:
- **Default Status Filter:** Active filters set to omit finalized historical data (`Archived` and `Canceled` unselected by default).
- **Available Facet Counts:**
  - `Draft (13)`: Inquiries or unconfirmed quotes.
  - `Reserved (2)`: Booked and confirmed, awaiting dispatch.
  - `Started (6)`: Currently active in the field with clients.
  - `Returned (736)`: Physically back in warehouse, pending closing.
  - `Archived (0)`: Permanently stored orders.
  - `Canceled (287)`: Voided bookings.
- **Payment Status Facet Counts:**
  - `Payment due (70)`
  - `Partially paid (38)`
  - `Paid (646)`
  - `Overpaid (3)`
  - `Process deposit (0)`

### 2.2 State 2: Single Filter Activation (`03-single-filter-active.png`)
Clicking the `Draft` checkbox triggers immediate reactive mutation:
1. **URL Serialization:** The browser URL instantly updates with `?status=draft` without triggering a full page reload (HTML5 `history.pushState`).
2. **Zero-Latency Data Pruning:** The order list table shrinks from hundreds of entries down to precisely **13 records**.
3. **Metric Card Recomputation:** The 4 top metric cards dynamically recalculate:
   - `Bookings`: Updated to `13`.
   - `Items ordered`: Recalculates to reflect total item count in draft orders.
   - `Revenue`: Recomputed sum of draft order values.
   - `Due`: Updated sum of receivables.
4. **Active Chip Injection:** An active filter chip `[Status: Draft ×]` appears in the header filter bar.

### 2.3 State 3: Multi-Select OR Evaluation (`04-multiple-filters-active.png`)
When the user checks both `Draft` (13) and `Reserved` (2):
1. **Intra-Facet Disjunction (OR):** The table immediately renders $13 + 2 = \mathbf{15}$ orders.
2. **Dynamic Dependent Count Recalculation:** The counts in the subsequent `Payment Status` section dynamically re-index to reflect *only* the distribution within those 15 active orders (e.g. `Payment due` count drops to the exact subset belonging to Draft + Reserved orders).
3. **Multi-Chip Display:** Two individual chips appear: `[Status: Draft ×]` and `[Status: Reserved ×]`, alongside a global `[Clear all]` action button.

### 2.4 State 4: Reset & Clear (`05-clear-filter.png`)
Clicking `[Clear all]` or deselecting the active checkboxes:
1. Removes all query parameters.
2. Re-expands table to all active rentals.
3. Restores metric cards to full portfolio totals.
4. Hides the `[Clear all]` button with zero layout shift.

---

## 3. Visual Design System & Typography Hierarchy

### 3.1 Typography Scale
* **Section Headers (`Status`, `Payment status`, `Date range`):**
  - Font Size: `11px` / `0.6875rem`
  - Font Weight: `600` (Semi-bold)
  - Letter Spacing: `+0.05em` (Tracked out uppercase)
  - Text Color: `#64748B` (Slate-500)
* **Facet Labels (`Draft`, `Reserved`, `Paid`):**
  - Font Size: `13px` / `0.8125rem`
  - Font Weight: `400` (Regular)
  - Text Color: `#1E293B` (Slate-800)
* **Numeric Counters (`(13)`, `(2)`, `(70)`):**
  - Font Size: `12px` / `0.75rem`
  - Font Variant: `tabular-nums`
  - Text Color: `#94A3B8` (Slate-400)
  - Selected Color: `#0F172A` (Slate-900)

### 3.2 Color Tokens & Contrast Ratios
* **Rail Background:** `#FFFFFF` on `#F8FAFC` page backdrop. Contrast ratio against body: `1.08:1` (demarcated by a crisp `1px solid #E2E8F0` border).
* **Hover State:** `#F1F5F9` (Slate-100) applied across the full 30px row on hover.
* **Checked Accent:** `#2563EB` (Blue-600) for standard checkboxes; WCAG AA contrast ratio `4.62:1` against white background.

---

## 4. Key Strengths & Architectural Flaws

### 4.1 Strengths (To Adopt in Babin Rentals OS)
1. **Instant Reactive Feedback:** Zero "Apply Filter" button friction; every click yields instantaneous DOM updates.
2. **Persistent Side Rail Visibility:** Eliminates the cognitive load of repeatedly opening and closing filter modals while browsing large fleets.
3. **Tabular Numeral Previews:** Displaying live record counts directly beside each checkbox prevents users from navigating into empty zero-result queries.
4. **URL Synchronization:** Deep-linkable state allows staff to share exact filtered queues (e.g. *"Show all overdue bookings"*) via a simple URL.

### 4.2 Critical Deficiencies (To Correct in Babin Rentals OS)
1. **Violates Babin OS Law 6 (Warehouse Sees No Money):** In Booqable, financial filters (`Payment due`, `Overpaid`, `Revenue totals`) are globally exposed to all users regardless of role. In Babin Rentals OS, warehouse staff must see gear and fulfillment status only, with financial facets masked via database Row-Level Security (RLS).
2. **Missing Dual-Calendar System:** Booqable only understands Western Gregorian dates (AD). Cinema production in Nepal operates simultaneously across Bikram Sambat (BS) and Gregorian (AD).
3. **Flat Status Model:** Booqable treats status as arbitrary tags rather than a strict finite state machine. Babin Rentals OS enforces the canonical 6-stage lifecycle (`Quote` $\rightarrow$ `Booked` $\rightarrow$ `Packed` $\rightarrow$ `On Rent` $\rightarrow$ `Returned` $\rightarrow$ `Closed`).
4. **Sub-Optimal Touch Targets:** 30px row height in Booqable violates Babin OS Law 15 (`44×44px` minimum touch target on all surfaces).
