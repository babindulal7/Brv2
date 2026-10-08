# Babin Rentals OS — Filter System Specification (v1.0)
## Architecture, Layout, Operational Windows & Facet Engine

*Babin Rentals Pvt Ltd · Boudha-6, Kathmandu · Foundation Specification v2.0*  
*Standard: Integer Paisa · 06:00 → 06:00 Operational Day · Law 6 (No Money on Floor) · Law 7 (AD in UTC, BS Rendered) · Law 15 (44px Touch Targets)*

---

## 1. Executive Summary & Design Philosophy

The Babin Rentals OS Filter System governs how warehouse dispatchers, floor technicians, logistics managers, and business owners navigate active rentals, fleet equipment, and client accounts. 

### Why Booqable's Filtering Fails for Cinema Rental Operations
During empirical research of Booqable's interaction architecture (`research/booqable/FILTER_SYSTEM.md`), three critical structural bottlenecks were identified:
1. **Calendar Day Fallacy:** Booqable filters strictly on calendar midnight (`00:00:00 → 23:59:59`), creating severe operational friction for film and commercial productions that work on a standard **06:00 → 06:00** rental cycle. Orders due back at 07:00 AM get flagged as "different day" returns.
2. **Financial Bleed into Operational Views:** Booqable embeds payment tags (`Unpaid`, `Partially Paid`, invoices) indiscriminately alongside operational stages (`Started`, `Returned`). This directly violates **Law 6 (Warehouse sees no money)**, risking rate leaks and confusing warehouse packing teams with billing concerns.
3. **No Dual Calendar Awareness:** Booqable operates solely on Gregorian calendar dates (AD), whereas Nepal film crew schedules, call sheets, and client deadlines oscillate between **Bikram Sambat (BS - नेपाली पात्रो)** and Anno Domini (AD).

### The Babin Solution
Babin Rentals OS v1.0 implements a decoupled, high-performance filter architecture:
- **06:00 → 06:00 Operational Day Engine:** Filter date windows align with actual production call times and return deadlines.
- **Strict Role-Based Separation (Office vs. Floor):** Office views expose granular financial balance facets; floor warehouse views substitute binary pass/fail gate states (`Audit Clear` vs `Gate Locked`).
- **Dual BS/AD Date Intelligence:** Filter queries store and evaluate in UTC (Law 7), but present intuitive dual-calendar pickers with Nepali month presets (Baisakh through Chaitra).
- **Zero-Layout-Shift Filter Bar:** Instant active chip previews with single-click removal, progressive counts, and persistent column configurations.

---

## 2. Filter Toolbar Topology & Ergonomics

The filter toolbar occupies a fixed 56px height band (`Law 15` minimum touch target floor) positioned immediately above the rental table view.

```
Desktop Layout (>= 1180px):
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search rentals, clients, gear... ]  [📅 Today (06:00-06:00) ▼]  [⚡ Filters (3) ▼]  [☷ Columns ▼]     [+ New Rental] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Active: [Stage: Booked ✕] [Date: Today ✕] [Deposit: Pending ✕] [Shortage Alert ✕]               [Clear all filters (4)]│
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Tablet Layout (768px - 1179px):
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search... (flex-grow)           ]  [📅 Today ▼]  [⚡ Filters (3)]  [☷]                               [+ New Rental] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Stage: Booked ✕] [Deposit: Pending ✕] +2 more...                                                              [Clear] │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Mobile Layout (< 768px):
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search rentals...                          ]  [⚡ Filter (3) ]  [+]                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Toolbar Component Specifications

| Control | Position | Interaction Behavior | Visual State / Law Compliance |
|---|---|---|---|
| **Search Input** | Left (320px fixed on desktop, flex on mobile) | 300ms debounced input. Clears with Esc or trailing `✕`. Cmd+K omnibox shortcut. | Icon: `Search` (20px). Placeholder: *"Search BK#, client, gear..."* |
| **Date Window Preset** | Middle-Left (210px) | Single click opens 06:00-aware quick presets popover + custom dual BS/AD date picker. | Label shows active range: *"Today"*, *"Tomorrow"*, *"Custom (2 days)"*. Icon: `Calendar`. |
| **Filters Trigger** | Middle-Center (140px) | Opens 380px slide-out Filter Drawer from right. Displays numeric badge `(N)` when active. | Icon: `SlidersHorizontal`. Badge: Dark amber `bg-amber-500 text-white font-mono` if active. |
| **Column Customizer** | Middle-Right (110px) | Dropdown with checkbox list to toggle table column visibility. Persisted in `localStorage`. | Icon: `Columns`. |
| **Primary Action** | Far Right (Auto) | Direct router link to rental intake wizard. | Button: `bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2.5 rounded-lg`. |

---

## 3. The 06:00 → 06:00 Operational Rental Day Engine

Standard Gregorian midnight filtering disrupts production rental operations. In Babin Rentals OS, the **Rental Day** is strictly defined as **06:00:00 AD to 05:59:59 AD next day** (24 hours).

```
Calendar Timeline (AD):
Day N 00:00 ─── 06:00 [START RENTAL DAY N] ────────────────────── 23:59 ─── Day N+1 05:59:59 [END RENTAL DAY N]
```

### Date Window Presets

```typescript
export interface DateWindowPreset {
  id: string;
  label: string;
  subLabel?: string;
  calculateRange: (referenceDateUtc: Date) => { startUtc: string; endUtc: string };
}

export const OPERATIONAL_DATE_PRESETS: DateWindowPreset[] = [
  {
    id: 'today',
    label: 'Today',
    subLabel: 'Current 06:00 → 06:00 shift',
    calculateRange: (now) => getOperationalShiftRange(now, 0)
  },
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    subLabel: 'Next 06:00 → 06:00 shift',
    calculateRange: (now) => getOperationalShiftRange(now, 1)
  },
  {
    id: 'this_weekend',
    label: 'This Weekend',
    subLabel: 'Friday 06:00 → Monday 06:00',
    calculateRange: (now) => getWeekendShiftRange(now)
  },
  {
    id: 'next_7_days',
    label: 'Next 7 Days',
    subLabel: 'Rolling 7 operational days',
    calculateRange: (now) => getRollingShiftRange(now, 7)
  },
  {
    id: 'custom_bs_ad',
    label: 'Custom Date Range...',
    subLabel: 'Dual Bikram Sambat / AD calendar picker',
    calculateRange: (now) => ({ startUtc: '', endUtc: '' }) // user selected
  }
];
```

### Law 7 Dual Calendar Engine (AD in UTC, BS Rendered)
1. **Database & API Filtering:** All date queries run strictly against UTC timestamps:
   ```sql
   WHERE booking.start_time >= :startUtc AND booking.end_time <= :endUtc
   ```
2. **Display Layer:** The date picker displays side-by-side calendars:
   - **Bikram Sambat (BS):** Nepali months (Baisakh, Jestha, Ashadh, Shrawan, Bhadra, Ashwin, Kartik, Mangsir, Poush, Magh, Falgun, Chaitra).
   - **Anno Domini (AD):** Standard ISO Gregorian date for international camera crews.
   - Any selection in BS automatically converts to AD UTC via `src/lib/bs.ts` before hitting the filter store.

---

## 4. Facet Engine & Drawer Specification

Clicking `Filters (N)` slides in a 380px drawer anchored to the right viewport boundary, preserving the user's scroll position and table view.

```
┌────────────────────────────────────────────────────────┐
│ Filters (3 active)                                 [✕] │
├────────────────────────────────────────────────────────┤
│ ▾ OPERATIONAL STAGE                                    │
│   [ ] Quote (0)                             12         │
│   [✓] Booked (Needs Packing) (1)             6  ● Amber │
│   [✓] Packed (Ready for Handover) (2)        4  ● Blue  │
│   [ ] On Rent (In Field) (3)                18  ● Green │
│   [ ] Returned (Reset / QC Due) (4)          3  ● Purple│
│   [ ] Closed (Archived) (5)                142         │
├────────────────────────────────────────────────────────┤
│ ▾ OPERATIONAL ALERTS & FLAGS                           │
│   [✓] Shortage / Equipment Conflict          2  ⚠️ Red  │
│   [ ] Overdue Return (>06:00 past due)       1  🚨 Red  │
│   [ ] Return Due Within 4 Hours              3  ⏳ Amber│
│   [ ] Camera Caretaker Attached              5         │
│   [ ] High Risk Location (Mountain/Monsoon)  2         │
├────────────────────────────────────────────────────────┤
│ ▾ FINANCIAL & GATE AUDIT (Office Mode)                │
│   [ ] Unpaid (Full balance outstanding)      8         │
│   [ ] Advance Pending (Confirmation Block)   3         │
│   [✓] Security Deposit Pending               4  ⚠️      │
│   [ ] Deposit Held & Clear                  22         │
│   [ ] Refund / Settlement Due                2         │
├────────────────────────────────────────────────────────┤
│ ▾ GEAR CATEGORIES                                      │
│   [ ] Cinema Cameras (RED / FX3A / Ronin 4D) 8         │
│   [ ] Anamorphic & Cine Zooms               11         │
│   [ ] High-Wattage Lighting (>1200W)         4         │
│   [ ] Verified Packages (44 Bundles)         7         │
├────────────────────────────────────────────────────────┤
│ ▾ CLIENT TRUST TIER (Law 17)                           │
│   [ ] 🟣 VIP (Tier Purple - 500k+)           4         │
│   [ ] 🔵 Trusted (Tier Blue - 200k+)        12         │
│   [ ] 🟢 Regular (Tier Green - 50k+)        19         │
│   [ ] 🟡 New Client                          6         │
│   [ ] 🔴 High Risk / Outstanding Dues        3         │
├────────────────────────────────────────────────────────┤
│ [ Reset All Filters ]               [ Apply Filters (3)]│
└────────────────────────────────────────────────────────┘
```

### Facet Definitions & Validation Rules

#### Facet 1: Operational Stage (Canonical 6 Stages)
Adheres strictly to `workflow.ts` stages:
- **`Quote` (0):** Non-binding client draft or inquiry. No physical stock reservation.
- **`Booked` (1):** Advance paid and booking confirmed. Gear allocated, awaiting physical assembly (`Job: Pack`).
- **`Packed` (2):** Flight cases prepped, verified against checklist, staged on Boudha hub shelf. Awaiting client arrival (`Job: Handover`).
- **`On Rent` (3):** Gear released to production crew. Active rental clock ticking.
- **`Returned` (4):** Gear physically returned to shop. Undergoing QC bench check, sensor sweep, and cleaning (`Job: Reset`). **Crucial Rule:** `RETURNED ≠ AVAILABLE`.
- **`Closed` (5):** Financial settlement reconciled, deposit returned, rental sealed.

#### Facet 2: Operational Alerts & Flags (High-Priority Triage)
- **`Shortage / Conflict`:** Overlap detected where physical inventory $< $ reserved count.
- **`Overdue Return`:** Rental where `end_time < NOW()` and stage is still `On Rent`. Computes into late fee bands (Grace $\le 30$m, Half Day $\le 2$h, Full Day $> 2$h).
- **`Inspection / Damage Hold`:** Gear quarantined on return bench due to reported physical or electrical defect.

#### Facet 3 & 4: Financial Facets vs. Floor Warehouse Gates (Law 6)
**Office Surface (Owners & Managers):**
- Shows granular financial status: `Unpaid`, `Advance Pending`, `Partially Paid`, `Fully Paid`, `Deposit Pending`, `Deposit Held`, `Deposit Settlement Due`.
- Displays real monetary balances calculated strictly in integer Paisa (e.g. `Rs 1,45,000`).

**Warehouse Floor Surface (Packing Crew & Bench Techs):**
- **Strict Law 6 Enforcement:** No rupee amounts, no invoices, no discount numbers.
- Financial status is collapsed into a **Binary Handover Gate**:
  - `Gate Status: CLEAR` (Advance and required security deposit verified by office). Floor crew is permitted to tap `[Start Handover]`.
  - `Gate Status: LOCKED` (Missing advance or unverified deposit). The `[Start Handover]` button is disabled with prompt: *"Release blocked: Consult Office Manager for clearance."*

#### Facet 5: Client Trust Tier (Law 17)
In compliance with **Law 17 (The word 'customer' appears nowhere in the UI or system)**, all entity facets and labels reference **Clients**.
- Tiers: `VIP` (Purple), `Trusted` (Blue), `Regular` (Green), `New` (Yellow), `Risk` (Red).

---

## 5. Active Filter Chips & Clear System

Whenever any filter condition deviates from default, an **Active Filter Chips Bar** mounts smoothly below the main toolbar (`height: 40px`, zero table flicker).

### Chip Interaction Model
1. **Label Syntax:** `[Facet Category]: [Selected Value] ✕`. Example: `Stage: Booked ✕`.
2. **Removal:** Clicking `✕` or hitting Backspace while focused removes that specific facet and triggers immediate table re-query without page reload.
3. **Compound Chip Merging:** If 3 stages are selected, they collapse into: `Stage: Booked + 2 more ✕` on screens $< 1180$px.
4. **Clear All Button:** Positioned at the trailing end: *"Clear all filters (N)"*. Resets state to default view (`Date: Today`, `Stage: All Active`).

---

## 6. TypeScript Filter State Architecture & URL Query Sync

```typescript
// src/types/rentalFilters.ts

export type RentalStage = 'quote' | 'booked' | 'packed' | 'on_rent' | 'returned' | 'closed';

export type OperationalFlag = 
  | 'shortage'
  | 'overdue'
  | 'due_today'
  | 'caretaker_attached'
  | 'high_risk_location'
  | 'inspection_hold';

export type FinancialStatusOffice = 
  | 'unpaid'
  | 'advance_pending'
  | 'partially_paid'
  | 'fully_paid'
  | 'deposit_pending'
  | 'deposit_held'
  | 'settlement_due';

export type HandoverGateFloor = 'gate_clear' | 'gate_locked';

export type ClientTrustTier = 'purple_vip' | 'blue_trusted' | 'green_regular' | 'yellow_new' | 'red_risk';

export interface BabinRentalFilterState {
  // Free text query
  searchQuery: string;

  // Operational Date Window
  datePreset: 'today' | 'tomorrow' | 'this_weekend' | 'next_7_days' | 'custom';
  startDateUtc: string | null; // ISO 8601 string
  endDateUtc: string | null;

  // Operational Stages
  stages: RentalStage[];

  // Flags & Triage
  flags: OperationalFlag[];

  // Financial (Decoupled per Law 6)
  financialOffice?: FinancialStatusOffice[];
  handoverGateFloor?: HandoverGateFloor;

  // Equipment & Bundles
  categoryIds: string[];
  bundleIds: string[];

  // Clients (Law 17)
  clientTiers: ClientTrustTier[];

  // Pagination & Sorting
  page: number;
  pageSize: number;
  sortBy: 'pickup_time' | 'return_time' | 'created_at' | 'booking_number';
  sortOrder: 'asc' | 'desc';
}
```

### URL Serialization Matrix

| State Property | URL Parameter Key | Example Parameter String | Notes |
|---|---|---|---|
| `searchQuery` | `q` | `?q=RED+Komodo` | Trimmed, URL-encoded |
| `datePreset` | `date` | `?date=today` | Preset identifier |
| `startDateUtc` / `endDateUtc` | `from` / `to` | `?from=2026-09-26T00:15:00Z&to=...` | Only when `date=custom` |
| `stages` | `stage` | `?stage=booked,packed` | Comma-delimited list |
| `flags` | `flags` | `?flags=shortage,overdue` | Comma-delimited list |
| `financialOffice` | `fin` | `?fin=deposit_pending,unpaid` | Office views only |
| `handoverGateFloor` | `gate` | `?gate=gate_locked` | Floor views only |
| `sortBy` / `sortOrder` | `sort` / `dir` | `?sort=pickup_time&dir=asc` | Default sort |

---

## 7. Empty State Recovery Matrix

When filters return zero matching rentals, the table displays a contextual empty state card that diagnoses why no results were found and offers 1-click recovery actions:

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│                      🔍 No Rentals Match Your Filter                   │
│                                                                        │
│   Active filters: Date = "Today", Stage = "Returned", Flag = "Shortage"│
│                                                                        │
│   Suggestions:                                                         │
│   • No gear with shortages is scheduled for return today.              │
│   • Try widening your date window or clearing specific stage filters.  │
│                                                                        │
│     [ Clear Stage Filters ]    [ Expand to Next 7 Days ]    [ Reset All]│
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Specific Reset:** Clears only the narrowest constraint (e.g., clears `Shortage` flag, keeps date range).
2. **Date Expansion:** Broadens current date window from `Today` to `Next 7 Days`.
3. **Master Reset:** Restores default operational dashboard view.

---

## 8. Summary of Architectural Improvements Over Booqable

| Feature Dimension | Booqable System | Babin Rentals OS v1.0 | Operational Advantage |
|---|---|---|---|
| **Rental Day Boundary** | Calendar Midnight (`00:00 → 23:59`) | Production Day (`06:00 → 06:00 next day`) | Matches call sheets and equipment check-in reality |
| **Financial Separation** | Invoices & Unpaid badges shown to all staff | Strict Law 6 separation (RLS & binary floor gates) | Zero pricing leaks; prevents warehouse dispatch confusion |
| **Calendar Support** | Western Gregorian (AD) only | Dual Bikram Sambat (BS) & AD with instant sync | Seamless booking for local Nepali productions & festivals |
| **Touch Ergonomics** | 32px small desktop controls | 56px toolbar floor, 44px min touch targets (Law 15) | Optimized for iPad and rugged warehouse tablet use |
| **Client Terminology** | "Customer" throughout | 100% "Client" terminology (Law 17) | Professional cinema-industry brand compliance |
| **Empty State Guidance** | Generic "No results found" text | Contextual diagnostic suggestions + 1-click repairs | Saves floor crew from getting stuck during intake rush |

---
*Babin Rentals OS · Boudha-6, Kathmandu · Specification Approved for Production Implementation*
