# Booqable Research — Complete UI Component Inventory & Design Tokens

**Document Type:** Technical Component Specification & UI Pattern Library  
**Subject:** Booqable Admin Backend UI (Atomic & Composite Component Roster)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Overview of Component Catalog

This inventory specifies the **21 foundational UI components** governing the filter, search, table, quick action, and preview architectures in Booqable, with strict interaction and responsive contracts for Babin Rentals OS.

---

## 2. Component Specifications (1 – 21)

### 1. `FilterTrigger`
- **Purpose:** Toggles the visibility of the side filter rail or slide-over drawer.
- **States:** Default, Hover, Active (Drawer open), Badge (Count > 0).
- **Props:** `{ isOpen: boolean; activeCount: number; onToggle: () => void; label?: string }`
- **Interaction:** Clicking toggles drawer visibility. Keyboard `Alt+F` opens directly.
- **Responsive:** On desktop, collapses 183px rail; on tablet/mobile, slides in from right with backdrop.

### 2. `FilterSidebar` / `FilterDrawer`
- **Purpose:** Container holding all filtering categories, facets, and export links.
- **States:** Collapsed, Expanded, Loading (async facet counts).
- **Props:** `{ open: boolean; onClose: () => void; activeCount: number; onClearAll: () => void; children: React.ReactNode }`
- **Responsive:** Fixed 183px inline on >=1280px; 360px modal drawer with overlay on <1280px.

### 3. `FilterSection`
- **Purpose:** Collapsible accordion group grouping related filter options (e.g. Status, Payment, Dates).
- **States:** Open, Closed, Focused.
- **Props:** `{ title: string; defaultOpen?: boolean; count?: number; action?: React.ReactNode; children: React.ReactNode }`
- **Interaction:** Full-width click target toggles chevron `^` / `v` and unmounts body.

### 4. `FilterOption`
- **Purpose:** Individual selectable facet within a section (checkbox, radio, or multi-select chip).
- **States:** Unchecked, Checked, Indeterminate, Disabled.
- **Props:** `{ label: string; count?: number | null; checked: boolean; onChange: (checked: boolean) => void }`
- **Visuals:** Shows label left-aligned, record count right-aligned in muted gray text.

### 5. `FilterSearch`
- **Purpose:** Mini searchbox embedded inside high-volume facet sections (e.g. searching 50+ tags).
- **States:** Empty, Filled, Active.
- **Props:** `{ value: string; onChange: (val: string) => void; placeholder: string }`

### 6. `ActiveFilterChip`
- **Purpose:** Removable pill rendered above the data table representing an active filter facet.
- **States:** Default, Hover (close button highlights).
- **Props:** `{ label: string; onRemove: () => void }`
- **Visuals:** Compact rounded chip: `[ Status: Packed ✕ ]`. Clicking `✕` unchecks the facet.

### 7. `ClearFilters`
- **Purpose:** Global reset action appearing when >=2 filter chips are active.
- **States:** Default, Hover.
- **Props:** `{ onClearAll: () => void; count: number }`
- **Visuals:** Text button `Clear all (3)` in link blue with underline on hover.

### 8. `DatePreset`
- **Purpose:** Quick-select button for standard relative operational timeframes.
- **Options:** `Today`, `Tomorrow`, `This Week`, `Next 7 Days`, `Custom`.
- **Props:** `{ activePreset: string; onSelect: (preset: string) => void }`

### 9. `DateRangePicker`
- **Purpose:** Dual-calendar popover allowing custom start and end date/time selection.
- **States:** Closed, Open, Selecting Start, Selecting End.
- **Props:** `{ from: string; to: string; onChange: (from: string, to: string) => void; timeEnabled?: boolean }`
- **Babin Adaptation:** Must display Bikram Sambat (BS) date alongside Gregorian (AD) timestamp.

### 10. `SearchInput`
- **Purpose:** Table-scoped searchbox for filtering list results as you type.
- **States:** Empty, Active/Focused, Searching (loading spinner), Filled (clear ✕ button visible).
- **Props:** `{ value: string; onChange: (q: string) => void; onClear: () => void; placeholder: string; debounceMs?: number }`

### 11. `SearchSuggestion`
- **Purpose:** Autocomplete dropdown list surfacing recent queries and top matches.
- **States:** Open, Highlighted row (arrow keys), Selected.
- **Props:** `{ items: Array<{ id: string; title: string; category: string }>; onSelect: (id: string) => void }`

### 12. `TableToolbar`
- **Purpose:** Horizontal control bar sitting immediately above the table header.
- **Layout:** `[ SearchInput ]  [ Quick Tabs ]  [ FilterTrigger ]  [ BulkActions ]  [ ColumnSelector ]`
- **Props:** `{ children: React.ReactNode }`

### 13. `BulkSelectionToolbar`
- **Purpose:** Alternate toolbar state activated when >=1 table rows are selected.
- **States:** Active, Indeterminate selection, All pages selected.
- **Props:** `{ selectedCount: number; totalCount: number; onSelectAllQuery: () => void; onClearSelection: () => void }`

### 14. `RowQuickAction`
- **Purpose:** Primary state-driven operational button in the rightmost table cell.
- **States:** Enabled, Loading, Disabled.
- **Props:** `{ label: string; icon: string; variant: 'primary' | 'success' | 'danger'; onClick: () => void }`
- **Dimensions:** 32px height on desktop, 44px min-height on tablet/mobile.

### 15. `RowActionMenu` (`•••`)
- **Purpose:** Contextual overflow dropdown for secondary and destructive row actions.
- **States:** Closed, Open, Item Hovered.
- **Props:** `{ actions: Array<{ label: string; icon: string; danger?: boolean; onClick: () => void }> }`

### 16. `StatusBadge`
- **Purpose:** Color-coded pill displaying operational or financial status.
- **Variants:** `Draft` (Gray), `Booked / Reserved` (Blue), `Packed` (Indigo), `On Rent` (Amber), `Returned` (Green), `Overdue` (Red).
- **Props:** `{ status: string; tone: 'neutral' | 'info' | 'progress' | 'out' | 'danger' }`

### 17. `PaymentAction`
- **Purpose:** Quick trigger to register payment, view ledger, or hold deposit.
- **Props:** `{ balanceDue: number; depositPending: boolean; onClick: () => void }`

### 18. `PickupAction` / `HandoverAction`
- **Purpose:** Triggers the equipment verification and digital sign-on-glass modal.
- **Props:** `{ bookingId: string; stage: string; onClick: () => void }`

### 19. `ReturnAction`
- **Purpose:** Triggers the return inspection and optical condition check-in drawer.
- **Props:** `{ bookingId: string; onReturn: () => void }`

### 20. `PreviewCard`
- **Purpose:** Floating rich card anchored to an entity link after a 400ms hover delay.
- **Props:** `{ entityType: 'order' | 'customer' | 'product'; id: string; targetRef: HTMLElement }`

### 21. `ColumnSelector`
- **Purpose:** Dropdown allowing operators to show/hide specific table columns.
- **Props:** `{ columns: Array<{ id: string; label: string; visible: boolean; locked?: boolean }>; onToggle: (id: string) => void }`
