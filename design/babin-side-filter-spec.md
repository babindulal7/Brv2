# Babin Rentals OS — Side Filter System Architectural Specification

**System Component:** Global Filter Rail & Drawer Subsystem  
**Implementation Standard:** Babin Rentals OS UI Standard (React 19 + TypeScript + Tailwind CSS)  
**Governing Laws:** Law 6 (Floor Blindness), Law 7 (AD/BS Dates), Law 11 (Never Colour Alone), Law 14 (Width Decides), Law 15 (44px Touch Targets), Law 17 (Client Terminology)  
**Target Locations:** `src/components/ui/GlobalFilterDrawer.tsx` & `src/modules/rentals/`

---

## 1. System Architecture & Dual Responsive Modes (Law 14)

Following Babin Rentals OS **Law 14 (Width Decides: 768 / 1180px)**, the filter subsystem operates in two distinct layout configurations based strictly on viewport width:

```
┌────────────────────────────────────────────────────────────────────────┐
│ DESKTOP VIEWPORT (≥ 1180px): Persistent Docked Side Rail               │
│                                                                        │
│ ┌──────────────┬──────────────────┬──────────────────────────────────┐ │
│ │ App Nav      │ Filter Rail      │ Main Table Workspace             │ │
│ │ (240px)      │ (260px Docked)   │ (Flex-1 Responsive Data Grid)    │ │
│ │              │                  │                                  │ │
│ │              │ • Stage (6)      │ [Active Filter Chips Bar       ] │ │
│ │              │ • Payment (Law 6)│ [Metric Cards Strip (Law 6 Mask)] │ │
│ │              │ • Dual Date (BS) │ [Order Rows - 56px Height      ] │ │
│ │              │ • Client Tiers   │                                  │ │
│ │              │ • Production Type│                                  │ │
│ └──────────────┴──────────────────┴──────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ TABLET & MOBILE VIEWPORT (< 1180px): Slide-Over Drawer Overlay         │
│                                                                        │
│ ┌─────────────────────────────────────────────────────────┬──────────┐ │
│ │ Main Table Workspace                                    │ Filter   │ │
│ │ (Full Width 100vw, dimmed with backdrop blur overlay)   │ Drawer   │ │
│ │                                                         │ (320px)  │ │
│ └─────────────────────────────────────────────────────────┴──────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Domain-Specific Facet Schema for Cinema Rentals

### 2.1 Facet Section 1: Canonical Operational Stage (Law 11)
Every option strictly adheres to **Law 11 (Never Colour Alone)** by combining an SVG icon, explicit label, and accessible color:

```typescript
export interface StageFilterOption {
  stage: 'quote' | 'booked' | 'packed' | 'on_rent' | 'returned' | 'closed';
  label: string;
  icon: 'file-text' | 'box' | 'truck' | 'play' | 'rotate-ccw' | 'check-circle';
  colorToken: string;
  count: number;
}
```

* `Quote (0)`: Icon `file-text`, Color `#2563EB` (Blue), Badge: Inquiries pending advance.
* `Booked (1)`: Icon `box`, Color `#4F46E5` (Indigo), Badge: Reserved gear in staging queue.
* `Packed (2)`: Icon `truck`, Color `#F97316` (Orange), Badge: Flight cases staged on floor.
* `On Rent (3)`: Icon `play`, Color `#16A34A` (Green), Badge: Equipment active on set.
* `Returned (4)`: Icon `rotate-ccw`, Color `#D97706` (Amber), Badge: Gear in quarantine/bench QC.
* `Closed (5)`: Icon `check-circle`, Color `#64748B` (Slate), Badge: Reconciled bookings.

---

### 2.2 Facet Section 2: Payment & Financial Status (Law 6 RLS Guarded)
* **Law 6 Non-Negotiable Gate:** If the active user role is `warehouse` or `crew`, this entire section is omitted from the UI and stripped from the query pipeline.
* **Facet Options:**
  - `Payment Due`: Invoices with unpaid balance.
  - `Advance Paid`: Satisfies Gate §R1, ready for dispatch.
  - `Paid in Full`: Zero outstanding balance.
  - `Security Deposit Held`: Active deposit liability held in escrow (Law 5).
  - `Deposit Refund Pending`: Returned gear cleared with deposit due for return.

---

### 2.3 Facet Section 3: Dual Calendar & Date Dimensions (Law 7)
* **Law 7 Standard:** All timestamps stored in UTC using Gregorian dates (AD). The UI displays both AD and Bikram Sambat (BS) for local Kathmandu operations:
  - Display format: `2026-09-26 AD (२०८३ असोज १० BS)`.
* **Date Presets:**
  - `Today` (Starts or ends today).
  - `Tomorrow's Shoots` (Gear going out tomorrow).
  - `Returning Today` (Expected at Boudha bench by 06:00 tomorrow).
  - `Overdue Shoots` (Exceeding rental window + 30m grace period).
  - `This Month` / `Custom Range`.

---

### 2.4 Facet Section 4: Client Loyalty Tier (Law 17)
Enables filtering by production house reputation and risk level:
* `Purple Tier`: VIP Production Houses (Rs 500k+ historical spend).
* `Blue Tier`: Trusted Commercial DoPs (Rs 200k+ spend).
* `Green Tier`: Regular Clients (Rs 50k+ spend).
* `Yellow Tier`: New Clients (Identity verification & KYC mandatory).
* `Red Tier`: Payment Risk / Past Due Backlog (Direct Owner approval required).

---

### 2.5 Facet Section 5: Production & Risk Flags
* `High Altitude / Mountain Shoot`: Expeditions flagged for Mustang, Manang, Everest (enforces 40% battery derating and Pelican acclimatization).
* `Camera Caretaker Assigned`: Shoots carrying Babin technical crew (Rs 2,000/day).
* `Cinema Zoom Rig`: Packages containing CHIOPT or Anamorphic sets requiring heavy rods.

---

## 3. Design Tokens & Styling Contracts

```css
:root {
  /* Layout Dimensions */
  --filter-rail-width: 260px;
  --filter-drawer-width: 320px;
  --filter-row-height: 44px; /* Law 15 44px touch target compliance */
  
  /* Typography Scale */
  --t-filter-title: 0.75rem; /* 12px font-weight: 600, uppercase */
  --t-filter-label: 0.875rem; /* 14px font-weight: 500 */
  --t-filter-count: 0.75rem; /* 12px tabular-nums */
  
  /* Color Tokens */
  --filter-bg: var(--surface, #FFFFFF);
  --filter-border: var(--border, #E2E8F0);
  --filter-hover-bg: var(--bg-hover, #F8FAFC);
  --filter-active-bg: var(--brand-subtle, #EFF6FF);
}
```

---

## 4. Full Component State & Accessibility Protocol

1. **Law 15 Touch Target Verification:** Every checkbox row has a minimum height of `44px` and hit area spanning the entire `260px` rail width.
2. **Keyboard Traversal:** The rail implements a standardized WAI-ARIA `toolbar` or `group` pattern with full keyboard navigation:
   - `Tab` moves between sections.
   - `Space` toggles checkbox selection.
   - `Enter` expands/collapses accordion headers.
   - `Escape` dismisses the drawer on tablet/mobile.
