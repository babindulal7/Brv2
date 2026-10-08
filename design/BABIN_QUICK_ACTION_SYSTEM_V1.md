# Babin Rentals OS — Quick Action System Specification (v1.0)
## Action Families, State Machine Placement, RBAC Gates & Mobile Ergonomics

*Babin Rentals Pvt Ltd · Boudha-6, Kathmandu · Foundation Specification v2.0*  
*Standard: Law of One Primary Action · Law 6 (No Money on Floor) · Law 15 (44px Touch Targets) · Law 17 (Clients, not Customers)*

---

## 1. Core Architecture & The Law of One Primary Action

In high-pressure production rental environments—where camera assistants arrive at 06:15 AM for a 07:00 AM commercial call sheet—user interfaces cannot afford cognitive friction, multi-click hunting, or ambiguous button states.

### The Law of One Primary Action
Every rental row in Babin Rentals OS must display **exactly ONE unambiguous, high-contrast Primary Action button** that directly matches its current operational state:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ BK-2026-0891  │ Saugat Dhital (VIP) │ RED Komodo-X 6K Kit │ 06:00 → 06:00 (3d) │ Packed │ [ Start Handover ] │ •••│
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Deterministic State Mapping:** A technician never wonders *"What do I click next?"* The button verb is the exact job step required by the state machine (`[ Start Packing ]`, `[ Start Handover ]`, `[ Check-In Return ]`, `[ Start Reset & QC ]`).
2. **Strict Law 15 Compliance:** The Primary Action button has a minimum height of 40px with a 44×44px interactive hit area, styled for instant touch accuracy on rugged tablets.
3. **Secondary Actions Gated to Overflow (`•••`):** Non-routine actions (reassign serial number, extend dates, add operational note, cancel quote) reside in a consistent 3-dot popover menu, preventing visual clutter.

---

## 2. The 5 Quick Action Placement Families

Actions are categorized into 5 ergonomic placement families across the application:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ F1: HEADER BAR (Global Actions)                          [ 📦 Quick Availability ]  [ 🔄 Sync ]  [ + New Rental ]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ F2: FLOATING BULK BAR (Appears on row selection)   [✓ 3 Selected] [ 📄 Print Pack Slips ] [ 🏷️ Print Case Tags ]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TABLE VIEW                                                                                                     │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Row 1: BK-2026-0891 ...                                                F3: ROW VERB: [ Start Packing ]  •••│ │
│ │ Row 2: BK-2026-0892 ...                                                F3: ROW VERB: [ Start Handover ] •••│ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ F4: QUICK PEEK DRAWER (Side sheet preview on row hover/click)              [ Edit ]  [ Download PDF ]  [ Open ]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ F5: DETAIL STICKY ACTION RAIL (Top header inside rental detail view)                 [ Job: Handover Wizard ➔ ]│
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Family Specifications

| Family | Location | Primary Purpose | Responsive Adaptation |
|---|---|---|---|
| **F1: Header Global Actions** | Top Right of Dashboard/Rental Page | Global creation and inventory lookup. Primary: `+ New Rental`. Secondary: `Quick Stock Check`. | On screens $< 768$px, collapses to sticky bottom right FAB (`+`) and icon triggers. |
| **F2: Floating Bulk Action Bar** | Floats at bottom center (or top table header) when $\ge 1$ row checkbox checked. | Batch operational execution: `Print Flight Case Tags`, `Bulk Prep Slips`, `Assign Warehouse Tech`. | Floats above mobile bottom navigation with clear selection counter and `Deselect All (✕)`. |
| **F3: Table Row Action Verb** | Rightmost column of every rental row (`width: 170px`). | Executes the immediate state transition job (`Pack`, `Handover`, `Return`, `Reset`). | Anchored right. On mobile card view, renders as full-width button at bottom of card. |
| **F4: Quick Peek Drawer Actions** | Top header of slide-over drawer when row is tapped for quick preview. | Navigation and secondary exports: `Open Full Booking`, `Print Pull Sheet`, `Call Client`. | Drawer slides up as bottom sheet on mobile devices. |
| **F5: Detail Sticky Action Rail** | Top action bar inside `/rentals/:id` detail screen. | Drives multi-step workflows: `Start Handover Session`, `Begin Return QC`, `Settle Deposit`. | Pinned to top of viewport during vertical scrolling. |

---

## 3. State-Driven Quick Action Assignment Rules

The Primary Action button dynamically evaluates the rental record's lifecycle stage, operational gates, and user role:

```
Quote (0) ───► Booked (1) ───► Packed (2) ───► On Rent (3) ───► Returned (4) ───► Closed (5)
   │               │              │               │                │               │
   ▼               ▼              ▼               ▼                ▼               ▼
[Confirm &]     [Start]       [Start]         [Check-In]       [Start Reset]   [View]
[Advance  ]     [Packing]     [Handover]      [Return  ]       [& QC       ]   [Archive]
```

### State-by-State Action Matrix

```typescript
export interface StateActionDefinition {
  stage: RentalStage;
  primaryAction: {
    label: string;
    icon: string;
    variant: 'amber' | 'blue' | 'emerald' | 'purple' | 'slate';
    actionHandler: string;
    gateCondition?: (rental: RentalRecord, role: UserRole) => { allowed: boolean; reason?: string };
  };
  secondaryActions: Array<{
    label: string;
    icon: string;
    actionHandler: string;
    roles: UserRole[];
  }>;
  overflowActions: Array<{
    label: string;
    icon: string;
    actionHandler: string;
    destructive?: boolean;
    roles: UserRole[];
  }>;
}
```

#### 1. Stage `Quote` (0)
- **Operational Reality:** Client inquiring or negotiating package. Gear is not reserved.
- **Primary Action:** `[ Confirm & Advance ]` (Opens modal to record required advance payment per Foundation §R1 and advance stage to `Booked`).
- **Secondary Action:** `[ Send Quote PDF ]` (Generates official Babin Rentals branded PDF quote with 7-day validity and deposit terms).
- **Overflow Menu (`•••`):** `Edit Gear`, `Duplicate Quote`, `Apply Law 10 Discount`, `Cancel Quote (Law 3)`.

#### 2. Stage `Booked` (1)
- **Operational Reality:** Confirmed booking. Gear must be pulled from Boudha warehouse shelves and packed into flight cases.
- **Primary Action:** `[ Start Packing ]` (Opens full-screen / drawer `Job: Pack` checklist with case hierarchy and barcode scanning).
- **Secondary Action:** `[ Print Case Tags ]` (Sends thermal flight case label prints with QR codes to warehouse label printer).
- **Overflow Menu (`•••`):** `Reassign Serial Item`, `Print Prep Sheet`, `Reschedule Dates`, `Add Operational Note`.

#### 3. Stage `Packed` (2)
- **Operational Reality:** Cases assembled, verified, and staged on dispatch shelf. Awaiting client arrival at shop.
- **Primary Action (Gate-Controlled):**
  - **If Gate Status = CLEAR:** `[ Start Handover ]` (Opens Digital Handover session with live gear inspection and client signature canvas).
  - **If Gate Status = LOCKED (Missing Deposit or Advance):** Button changes to `[ ⚠️ Gate Locked ]` with amber outline. Tapping displays: *"Release blocked: Required security deposit or advance balance pending. Client must clear with Office Desk."*
- **Secondary Action:** `[ View Staging Summary ]` (Displays shelf location e.g. `Shelf B3 - Case #1, #2`).
- **Overflow Menu (`•••`):** `Unpack / Modify Kit`, `Swap Damaged Item`, `Print Handover Document`.

#### 4. Stage `On Rent` (3)
- **Operational Reality:** Kit is active in the field. Clock is running.
- **Primary Action:** `[ Check-In Return ]` (Launches `Job: Return` session: item-by-item verification, serial number scan, missing cable alert).
- **Secondary Action:** `[ Extend Rental ]` (Opens calendar extension dialog; checks downstream booking collisions).
- **Overflow Menu (`•••`):** `Report Incident / Mid-Shoot Damage`, `Attach Camera Caretaker`, `Client Contact / WhatsApp`.

#### 5. Stage `Returned` (4)
- **Operational Reality:** Gear is back in shop. **Crucial Rule:** `RETURNED ≠ AVAILABLE`. Gear must be bench-checked, cleaned, and sensor-swept before returning to active stock.
- **Primary Action:** `[ Start Reset & QC ]` (Opens bench QC form: Siemens star parfocal check, light table f/22 sensor sweep, 12G-SDI ground loop verification, cleaning signoff. Reset absorbs cleaning).
- **Secondary Action:** `[ Log Damage / Issue ]` (Initiates damage report with photo upload, repair quote, and deposit hold).
- **Overflow Menu (`•••`):** `View Return Signoff`, `Print Return Receipt`, `Flag Maintenance Quarantine`.

#### 6. Stage `Closed` (5)
- **Operational Reality:** Rental finalized. Deposit refunded/settled. Invoices archived.
- **Primary Action:** `[ View Archive ]` (Read-only immutable historical view of all sessions, scans, signatures, and payments).
- **Secondary Action:** `[ Re-Book Rental ]` (Clones items and client into a new Quote).
- **Overflow Menu (`•••`):** `Download Full Rental Dossier (ZIP)`, `Export Tax Invoice (Office Only)`.

---

## 4. Role-Based Permissions & Law 6 Separation

Babin Rentals OS enforces strict Role-Based Access Control (RBAC) across three primary operational roles:

```
┌────────────────────────────────────────────────────────────────────────┐
│ OWNER & FINANCE MANAGER                                                │
│ • Full financial authority: record payments, approve Law 10 discounts │
│ • Settle security deposits, issue refunds, approve repair invoices     │
│ • Override booking blocks, modify day rates, export tax dossiers      │
├────────────────────────────────────────────────────────────────────────┤
│ DISPATCHER & LOGISTICS SUPERVISOR                                      │
│ • Assign crew, schedule pickups/deliveries, reassign serial numbers    │
│ • Resolve shortages, approve kit substitutions, manage bookings       │
│ • Can view payment status (Paid/Unpaid) but cannot alter rates         │
├────────────────────────────────────────────────────────────────────────┤
│ WAREHOUSE FLOOR CREW & BENCH TECH (Strict Law 6 & RLS Masking)        │
│ • ZERO financial numbers (no day rates, no deposits, no totals)        │
│ • Pack kits, scan barcodes, run Handover sessions, execute Return QC   │
│ • Handover button respects binary gate: Gate Clear vs Gate Locked      │
└────────────────────────────────────────────────────────────────────────┘
```

### Law 6 Enforcement in Action Handlers

```typescript
// src/lib/actions/handoverGate.ts

export interface HandoverGateStatus {
  canRelease: boolean;
  statusBadge: 'clear' | 'locked';
  userMessage: string;
  internalCode: 'ALL_CLEAR' | 'DEPOSIT_MISSING' | 'ADVANCE_MISSING' | 'DISCOUNT_UNAPPROVED';
}

export function evaluateHandoverGate(rental: RentalRecord, userRole: UserRole): HandoverGateStatus {
  // Advance payment check (§R1)
  if (rental.advanceRequiredPaisa > 0 && rental.advancePaidPaisa < rental.advanceRequiredPaisa) {
    return {
      canRelease: false,
      statusBadge: 'locked',
      userMessage: userRole === 'floor_crew' 
        ? 'Release Locked: Direct client to Office Desk to complete advance clearance.'
        : `Advance Shortfall: Rs ${(rental.advanceRequiredPaisa - rental.advancePaidPaisa) / 100} outstanding.`,
      internalCode: 'ADVANCE_MISSING'
    };
  }

  // Security Deposit Check (Law 5)
  if (rental.depositRequiredPaisa > 0 && !rental.depositHeld) {
    return {
      canRelease: false,
      statusBadge: 'locked',
      userMessage: userRole === 'floor_crew'
        ? 'Release Locked: Security deposit not secured. Direct client to Office Desk.'
        : `Deposit Missing: Rs ${rental.depositRequiredPaisa / 100} deposit must be held prior to release.`,
      internalCode: 'DEPOSIT_MISSING'
    };
  }

  return {
    canRelease: true,
    statusBadge: 'clear',
    userMessage: 'All operational and administrative gates cleared. Ready for client signoff.',
    internalCode: 'ALL_CLEAR'
  };
}
```

---

## 5. Security Deposit & Damage Settlement Gates

High-value cinema equipment (RED Komodo-X, Ronin 4D 6K, Anamorphic sets) mandates flat-rate security deposits ($1\text{ to }1.5\text{ Lakh NPR}$). Quick actions guarantee these deposits are never bypassed:

### Handover Gate Logic (Departure)
1. **Automated Deposit Check:** When `Job: Handover` is launched, the system checks whether `depositHeld === true`.
2. **If False:**
   - Floor Crew: Primary Action `[ Start Handover ]` is disabled. Tooltip states: *"Administrative clearance required. Send client to Office Desk."*
   - Office Staff: Action prompts: `[ Hold Deposit (Cash/Cheque/Bank) ]`. Once recorded, the Handover gate unlocks in real-time across all connected floor tablets via WebSocket subscription.

### Damage Settlement Gate Logic (Return)
1. **Damage Discovery at QC Reset:** If technician identifies damage during `Job: Reset` (e.g. scratched front element, cracked LCD, damaged SDI port):
   - Technician clicks `[ Flag Damage ]` in QC session.
   - Uploads min 1 photo, enters $\ge 10$-character description.
   - System automatically sets status to `Damage Hold` and routes to Manager dashboard.
2. **Deposit Offset & Settlement (Office Only):**
   - Charge $< \text{NPR } 25,000$: Manager approves.
   - Charge $\ge \text{NPR } 25,000$: Owner approval mandatory.
   - Settlement calculation:
     $$\text{Deposit Refund} = \max(0, \text{Held Deposit} - \text{Damage Charge})$$
     $$\text{Client Shortfall} = \max(0, \text{Damage Charge} - \text{Held Deposit})$$
   - Once settled, stage moves to `Closed`.

---

## 6. Responsive & Touch Ergonomics (Law 15 & 14)

### Tablet & Rugged Floor Mode (768px - 1179px)
- **Minimum Target Floor:** 56px row height with 44px min-height buttons.
- **Physical Feedback:** Tactile CSS press states (`active:scale-[0.98] transition-transform duration-75`).
- **No Hover-Only Triggers:** All actions are accessible via explicit tap targets; zero reliance on CSS `:hover` states which fail on tablets.

### Mobile Screen Adaptation (< 768px)
- **Full-Width Row Verb:** Each rental renders as a standalone card. The Primary Action button stretches 100% width across the bottom of the card (`h-11 rounded-lg font-semibold text-sm`).
- **Sticky Bottom Action Sheet:** When reviewing a rental on mobile, critical actions float in a pinned bottom bar:

```
┌────────────────────────────────────────────────────────┐
│ BK-2026-0891 · Packed · Saugat Dhital                  │
│ [ ⚡ Start Handover Session ]                     [•••]│
└────────────────────────────────────────────────────────┘
```

---

## 7. Comparative Analysis: Babin vs. Booqable Quick Actions

| Dimension | Booqable Implementation | Babin Rentals OS v1.0 | Operational Advantage |
|---|---|---|---|
| **Primary Action Clarity** | 3–4 competing icons per row (View, Edit, More) | Strict **Law of One Primary Action** per row | Eliminates staff hesitation; guides exact next workflow step |
| **Financial Gate Enforcement** | Pickup allowed regardless of payment | Strict **Handover Gate** (blocks pickup on unpaid deposit/advance) | Prevents un-secured high-value gear release ($1.5\text{Lakh}+$ risk) |
| **Warehouse Privacy (Law 6)** | Floor crew sees rental rates & invoice totals | Complete masking: Floor sees only operational gate (`Clear` / `Locked`) | Zero financial leakage; keeps warehouse focused purely on gear QC |
| **Touch Optimization** | Desktop-centric 30px buttons | Strict **Law 15** (44×44px hit targets, 56px row floor) | High reliability for one-handed tablet use in dim prep bays |
| **Damage Workflow** | Generic notes field on return | Structured Damage Gate with photo evidence & deposit offset engine | Protects business capital; prevents disputed deposit deductions |

---
*Babin Rentals OS · Quick Action Specification Approved for Production Implementation*
