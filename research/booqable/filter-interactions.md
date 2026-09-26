# Filter Interaction Architecture & State Synchronization

**Specification Target:** Universal Filter Engine Interactions  
**Reference Environment:** Booqable Admin Backend Audit  
**Target Subsystem:** Babin Rentals OS Query Layer (`src/lib/queries/`)  
**Artifact Dependencies:** `screenshots/02-filter-panel-open.png` through `05-clear-filter.png`

---

## 1. Multi-Select Boolean Algebra & Query Evaluation

The filtering engine employs a standard **Disjunctive Normal Form (DNF)** evaluation model across facet groups:

```
Result Set = (Status₁ OR Status₂ OR ...) 
             AND (Payment₁ OR Payment₂ OR ...) 
             AND (DateRange) 
             AND (SearchQuery)
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ Filter Selection Matrix                                                │
│                                                                        │
│ Group A (Status):           [x] Draft (13)     [x] Reserved (2)        │
│ Group Evaluation:           (Status = 'draft' OR Status = 'reserved')  │
│ Intra-Group Count:          13 + 2 = 15 Records                        │
│                                                                        │
│                              ▲                                         │
│                              │ INTERSECTION (AND)                      │
│                              ▼                                         │
│                                                                        │
│ Group B (Payment Status):   [x] Payment Due (70 total fleet-wide)      │
│ Filtered Sub-Count:         Only 3 of the 15 are Payment Due           │
│ Combined Result:            (Draft OR Reserved) AND (Payment Due)      │
│ Output Records:             3 Records Rendered in Table Grid           │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Intra-Group Disjunction (OR)
* When multiple checkboxes within the same section (e.g. `Draft` and `Reserved`) are checked, the filter returns the **union** of those states.
* Selecting an additional checkbox within a group strictly **widens or maintains** the result set.

### 1.2 Inter-Group Conjunction (AND)
* When selections exist across different facet sections (e.g. `Status` = *Reserved* AND `Payment Status` = *Payment Due*), the engine returns the **intersection**.
* Selecting a filter in a new section strictly **narrows or maintains** the result set.

---

## 2. Dynamic Real-Time Metric & Count Synchronization

### 2.1 Tabular Count Recomputation
Unlike legacy interfaces where checkbox counter badges reflect static total database quantities, modern rental workflows require **dependent facet indexing**:
1. When zero filters are applied, each checkbox displays its total count across the entire active fleet (e.g. `Payment due: 70`).
2. When `Draft` (13) is checked, the counts inside the `Payment Status` accordion immediately recalculate to reflect *only* the draft orders:
   - `Payment due (11)`
   - `Partially paid (0)`
   - `Paid (2)`
   - `Overpaid (0)`
3. This prevents staff from experiencing "zero-result click traps" where selecting a valid combination yields an empty grid.

### 2.2 Live Metric Card Aggregation
At the top of the table workspace, 4 primary operational metric cards update synchronously with every facet mutation:

```
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ Bookings          │ Items Ordered     │ Revenue (Paisa)   │ Due (Paisa)       │
│ 15                │ 48                │ Rs 1,85,000       │ Rs 42,500         │
│ ▲ (13 + 2)        │ ▲ Kit Sum         │ ▲ Taxable + VAT   │ ▲ Net Receivable  │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

* **Calculation Engine Rule:** In Babin Rentals OS, all financial rollups must execute using **integer Paisa math** (`scripts/os_engine.py`) to eliminate floating-point precision drift.
* **Role Masking Rule (Law 6):** If the authenticated user possesses the `warehouse` or `crew` role, the `Revenue` and `Due` metric cards are completely stripped from the DOM and replaced with fulfillment operational metrics (`Items Staged`, `Packs Pending`).

---

## 3. URL Parameter Serialization & History Management

To ensure full bookmarkability, deep linking, and frictionless browser Back/Forward navigation, all filter state is continuously mirrored to the browser URL query string.

### 3.1 Serialization Schema
| Parameter Key | Format | Example Value | Interpretation |
|---|---|---|---|
| `stage` | Comma-separated strings | `draft,reserved` | Status in ['draft', 'reserved'] |
| `payment` | Comma-separated strings | `due,partial` | Payment in ['due', 'partial'] |
| `date_dim` | String enum | `pickup` | Filter applies to dispatch date |
| `from` | ISO 8601 Date (`YYYY-MM-DD`) | `2026-09-26` | Start boundary |
| `to` | ISO 8601 Date (`YYYY-MM-DD`) | `2026-09-28` | End boundary |
| `q` | URL-encoded string | `Sony%20FX3A` | Full-text search token |
| `page` | Integer | `1` | Pagination cursor |

### 3.2 Navigation History Strategy (`pushState` vs `replaceState`)
* **Checkbox Toggle:** Uses `history.replaceState()`. Rapidly checking/unchecking multiple filters should not pollute the browser's back button history with 10 intermediate states.
* **Preset Navigation (e.g. clicking "Overdue Queue"):** Uses `history.pushState()`. Major queue switches constitute distinct navigational intents that users expect to traverse via the browser Back button.
* **Search Input Typing:** Debounced by `250ms`, executed via `history.replaceState()`.

---

## 4. Search Bar Integration & Token Matching

The search input sits in the table toolbar above the data grid. Its evaluation interacts seamlessly with the active facets:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [ 🔍 Search clients, order #, or serial numbers...          ] [Filters]│
└────────────────────────────────────────────────────────────────────────┘
```

1. **Multi-Field Matching:** A query token `FX3A` scans across:
   - Order Number (`#1039`)
   - Client Name (`Saugat Dhital`)
   - Company Name (`Magan Entertainment`)
   - Line Item Equipment Name (`Sony FX3A Cinema Line Body Kit`)
   - Physical Serial Numbers / Barcodes (`1042-FX3`)
2. **Compound Filtering:** If facets are active (`Status = Reserved`), the search query is applied as an additional `AND` predicate against the filtered subset:
   $$\text{Final Query} = \text{Facets}(D) \cap \text{SearchTokens}(Q)$$

---

## 5. Keyboard Accessibility & Micro-Interactions

| Interaction | Keybinding | Expected System Response |
|---|---|---|
| **Toggle Filter Drawer** | `Cmd/Ctrl + Shift + F` | Mounts or focuses the filter rail/drawer |
| **Facet Navigation** | `Tab` / `Shift + Tab` | Moves focus between individual checkbox items |
| **Toggle Checkbox** | `Spacebar` | Inverts checked state; fires reactive query |
| **Collapse Section** | `Enter` on Section Header | Expands/collapses accordion group |
| **Dismiss Popover/Drawer** | `Escape` | Closes date popover or off-canvas drawer; restores focus to trigger |
| **Clear All Filters** | `Alt + C` | Clears all active facets back to defaults |
