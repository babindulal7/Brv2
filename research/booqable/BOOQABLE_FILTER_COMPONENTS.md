# Booqable Filter System — Component Models & Structural Breakdown

**Document Version:** 1.0.0  
**Research Target:** Booqable Admin Backend (`https://babin-rentals.booqable.com/orders`)  
**Derived Target:** Babin Rentals OS Filter Subsystem  
**Reference Evidence:** `screenshots/01-orders-default.png` through `05-clear-filter.png`

---

## 1. Architectural Overview & Component Hierarchy

Booqable's filtering engine is constructed as a decoupled, multi-tier facet pipeline. The interface is composed of seven primary component primitives arranged in a hierarchical layout tree:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Global Filter Layout Container                                         │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Top-Level Action Bar & Active Filters Strip                        │ │
│ │ ┌──────────────┐ ┌───────────────────────────────┐ ┌─────────────┐ │ │
│ │ │FilterTrigger │ │ ActiveFilterChip List         │ │ClearAllBtn  │ │ │
│ │ └──────────────┘ └───────────────────────────────┘ └─────────────┘ │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌──────────────────────┬─────────────────────────────────────────────┐ │
│ │ FilterRail           │ Data Workspace (Table & Metric Cards)       │ │
│ │ (Inline or Drawer)   │                                             │ │
│ │                      │ ┌─────────────────────────────────────────┐ │ │
│ │ ┌──────────────────┐ │ │ Live Metric Summary Cards               │ │ │
│ │ │ FilterSection 1  │ │ │ [Bookings] [Items] [Revenue] [Due]      │ │ │
│ │ │ (Status)         │ │ └─────────────────────────────────────────┘ │ │
│ │ │  ├FilterCheckbox │ │                                             │ │
│ │ │  ├FilterCheckbox │ │ ┌─────────────────────────────────────────┐ │ │
│ │ │  └FilterCheckbox │ │ │ Order Registry Data Table (56px rows)   │ │ │
│ │ ├──────────────────┤ │ │                                         │ │ │
│ │ │ FilterSection 2  │ │ │                                         │ │ │
│ │ │ (Payment Status) │ │ │                                         │ │ │
│ │ ├──────────────────┤ │ │                                         │ │ │
│ │ │ DateRangeFilter  │ │ │                                         │ │ │
│ │ ├──────────────────┤ │ │                                         │ │ │
│ │ │ TagFilterSection │ │ │                                         │ │ │
│ │ ├──────────────────┤ │ │                                         │ │ │
│ │ │ ExportActionBtn  │ │ │                                         │ │ │
│ │ └──────────────────┘ │ └─────────────────────────────────────────┘ │ │
│ └──────────────────────┴─────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Specifications

### 2.1 Component 1: `FilterTrigger`
The entry-point toggle that mounts or expands the filter panel.

* **DOM Role / Tag:** `<button type="button" aria-haspopup="dialog" aria-expanded="{isOpen}">`
* **Visual Representation:** Icon-adjacent or pill button located at the left edge of the page title or within the table's secondary action bar.
* **Dimensions:**
  - Standard button height: `36px` (desktop), `44px` (touch-target compliance on mobile/tablet).
  - Horizontal padding: `12px` (when label present), `8px` square (when icon-only).
  - Border radius: `6px`.
* **Sub-elements:**
  1. **Icon Container:** `16×16px` SVG sliders/filter icon (`stroke-width: 1.5px`).
  2. **Label:** `"Filters"` rendered in `13px` / `0.8125rem` Medium (`font-weight: 500`).
  3. **Active Count Badge:** Circular or rounded pill (`min-width: 18px`, `height: 18px`, `padding: 0 4px`), background `var(--brand-primary)` or neutral dark (`#111827`), text white `11px` Bold (`font-weight: 700`).
* **Interactive States:**
  - `Default`: Background `transparent` or `#F9FAFB`, border `1px solid #E5E7EB`, text `#374151`.
  - `Hover`: Background `#F3F4F6`, border `#D1D5DB`.
  - `Active / Pressed`: Background `#E5E7EB`, border `#9CA3AF`.
  - `Active Filters Present`: Border color shifts to `var(--brand-border)` with colored badge.
  - `Focus-Visible`: `outline: 2px solid var(--focus-ring)`, `outline-offset: 2px`.

---

### 2.2 Component 2: `FilterRail`
The persistent container docked adjacent to the primary table.

* **DOM Role / Tag:** `<aside role="search" aria-label="Filters">`
* **Presentation Modes:**
  - **Inline Mode (Desktop $\ge 1180\text{px}$):** Statically flexed alongside table workspace. Does not obscure underlying data rows.
  - **Drawer Mode (Tablet/Mobile $< 1180\text{px}$):** Off-canvas slide-over anchored to the right or left with a `backdrop-blur` overlay (`rgba(17, 24, 39, 0.4)`).
* **Geometry & Spacing:**
  - Width: `240px` to `280px` fixed (`flex: 0 0 260px`).
  - Max Height: `calc(100vh - 64px)`.
  - Overflow: `overflow-y: auto`, `overflow-x: hidden`. Smooth custom scrollbar (`width: 4px`).
  - Internal Padding: `16px 12px 24px 12px`.
  - Divider Lines: `1px solid var(--border-subtle, #E5E7EB)` separating distinct filter groups.

---

### 2.3 Component 3: `FilterSection` (Accordion Facet Container)
Collapsible vertical grouping for a specific metadata dimension (e.g., Status, Payment, Location, Tags).

* **DOM Structure:**
  ```html
  <section class="filter-section" aria-labelledby="filter-section-title-status">
    <header class="filter-section-header">
      <button type="button" aria-expanded="true" class="filter-section-toggle">
        <span id="filter-section-title-status" class="filter-section-title">Status</span>
        <span class="filter-section-meta">
          <span class="filter-section-selected-count">2</span>
          <svg class="chevron-icon" aria-hidden="true">...</svg>
        </span>
      </button>
    </header>
    <div class="filter-section-body" role="group">
      <!-- FilterCheckbox items -->
    </div>
  </section>
  ```
* **Header Geometry:** Height `32px`, display `flex`, `align-items: center`, `justify-content: space-between`.
* **Typography:**
  - Title: `12px` / `0.75rem`, uppercase or title-case, `letter-spacing: 0.05em`, `font-weight: 600`, color `var(--text-muted, #6B7280)`.
  - Counter Badge: `11px`, tabular numerals, color `var(--text-secondary, #4B5563)`.
* **Motion / Transitions:**
  - Height expand/collapse: `transition: max-height 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease`.
  - Chevron rotation: `transform: rotate(0deg)` (open) $\rightarrow$ `rotate(-90deg)` (collapsed).

---

### 2.4 Component 4: `FilterCheckbox` (Row Item with Count)
The atomic multi-select element allowing users to toggle specific facet values.

* **DOM Structure:**
  ```html
  <label class="filter-checkbox-row">
    <div class="filter-checkbox-input-wrapper">
      <input type="checkbox" class="filter-checkbox-input" value="draft" />
      <span class="filter-checkbox-custom" aria-hidden="true">
        <svg class="check-mark">...</svg>
      </span>
    </div>
    <span class="filter-checkbox-label">Draft</span>
    <span class="filter-checkbox-count" aria-label="13 orders">13</span>
  </label>
  ```
* **Geometry:**
  - Row Height: `28px` to `32px`.
  - Padding: `4px 6px`.
  - Border Radius: `4px`.
* **Layout:** `display: flex`, `align-items: center`, `justify-content: flex-start`, `gap: 8px`.
* **Typography & Colors:**
  - Label: `13px` / `font-weight: 400`, color `var(--text-primary, #1F2937)`.
  - Count: `12px` / `font-variant-numeric: tabular-nums`, color `var(--text-tertiary, #9CA3AF)`, pushed to far right via `margin-left: auto`.
* **Checkbox Box:**
  - Dimensions: `16×16px`.
  - Border: `1.5px solid var(--border-input, #D1D5DB)`.
  - Checked State: Background `var(--brand-primary, #2563EB)`, border-color `var(--brand-primary, #2563EB)`.
  - Focus Ring: `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2)`.

---

### 2.5 Component 5: `DateRangeFilter` (Capsule Popover Trigger)
Trigger and popover calendar for restricting temporal boundaries.

* **DOM Structure:**
  ```html
  <div class="date-range-filter">
    <label class="date-filter-label">Date range</label>
    <button type="button" class="date-range-trigger" aria-haspopup="dialog">
      <svg class="calendar-icon">...</svg>
      <span class="date-range-text">All time</span>
      <svg class="dropdown-chevron">...</svg>
    </button>
  </div>
  ```
* **Trigger Styling:**
  - Height: `32px`. Width: `100%`.
  - Padding: `0 10px`. Border radius: `6px`.
  - Border: `1px solid #E5E7EB`. Background: `#FFFFFF`.
  - Text: `13px` regular, text-overflow: ellipsis.
* **Popover Menu Options:**
  - Quick Presets: `Today`, `Tomorrow`, `This week`, `Next week`, `This month`, `Next month`, `All time`.
  - Custom Date Range Picker: Dual input fields (`From: YYYY-MM-DD` and `To: YYYY-MM-DD`) with embedded calendar widget.

---

### 2.6 Component 6: `ActiveFilterChip`
Removable indicator chip displayed in the top bar above the table.

* **DOM Structure:**
  ```html
  <div class="active-filter-chip" role="status">
    <span class="chip-dimension-label">Status:</span>
    <span class="chip-value-label">Draft</span>
    <button type="button" class="chip-remove-btn" aria-label="Remove Draft filter">
      <svg class="close-x-icon">...</svg>
    </button>
  </div>
  ```
* **Dimensions:**
  - Height: `26px`.
  - Padding: `2px 6px 2px 8px`.
  - Border radius: `13px` (pill) or `4px` (subtle rounded tag).
* **Styling:**
  - Background: `var(--bg-subtle, #F3F4F6)`.
  - Border: `1px solid var(--border-default, #E5E7EB)`.
  - Dimension prefix: `11px` bold `color: #6B7280`.
  - Value: `12px` medium `color: #111827`.
  - Close Button: `14×14px` hit area, hover color `color: #DC2626`.

---

### 2.7 Component 7: `ClearAllButton`
The global reset trigger that clears all applied facets simultaneously.

* **DOM Role / Tag:** `<button type="button" class="clear-all-filters-btn">`
* **Trigger Condition:** Rendered ONLY when total active filter count $> 0$.
* **Styling:**
  - Flat text button, height: `26px`, padding: `0 8px`.
  - Typography: `12px`, `font-weight: 500`, color `var(--link-text, #2563EB)`.
  - Hover: Text decoration `underline`, color `var(--link-hover, #1D4ED8)`.
* **Action:** Resets all state atoms to system defaults; triggers instant recalculation of total records and removes all query parameters from URL.

---

## 3. Visual & Token Specifications

| Token | Semantic Token | Hex / Value | Usage |
|---|---|---|---|
| `--filter-bg` | Surface Background | `#FFFFFF` | Filter rail base background |
| `--filter-border` | Border Boundary | `#E5E7EB` | Dividers and input borders |
| `--filter-title` | Section Title | `#6B7280` | Uppercase facet section headers |
| `--filter-text` | Primary Label | `#1F2937` | Checkbox labels, trigger labels |
| `--filter-count` | Tabular Counter | `#9CA3AF` | Inactive item counts |
| `--filter-count-active` | Active Count | `#111827` | Counter when option is checked |
| `--filter-primary` | Brand Accent | `#2563EB` | Active checkboxes, primary triggers |
| `--filter-chip-bg` | Chip Surface | `#F3F4F6` | Active filter pill background |
| `--filter-row-hover`| Hover Highlight | `#F9FAFB` | Checkbox row hover background |

---

## 4. Responsive Adaptation Matrix

| Viewport Width | Display Mode | Filter Rail Placement | Table Behavior | Touch Target |
|---|---|---|---|---|
| $\ge 1180\text{px}$ (Desktop) | Persistent Inline | Left column, fixed `260px` | Flex-1, scales horizontally | `32px` standard |
| $768\text{px} - 1179\text{px}$ (Tablet) | Collapsible Drawer | Slide-over from right/left | Full width behind backdrop | `44px` minimum (Law 15) |
| $< 768\text{px}$ (Mobile) | Fullscreen Modal | Fixed overlay `100vw × 100vh` | Hidden behind modal | `48px` comfortable touch |
