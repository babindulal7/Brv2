# Babin Rentals OS — Rental Row Action Matrix (v1.0)
## Complete State-by-State, Flag-by-Flag & Role-Based Interaction Engine

*Babin Rentals Pvt Ltd · Boudha-6, Kathmandu · Foundation Specification v2.0*  
*Standard: Law 6 (No Money on Floor) · Law 11 (Never Colour Alone) · Law 15 (44px Minimum Touch Targets) · Law 17 (Clients, not Customers)*

---

## 1. Matrix Overview & Behavioral Principles

The **Rental Row Action Matrix** is the definitive operational lookup engine for Babin Rentals OS. It dictates exactly which buttons, badges, modals, and overflow menus render for every active booking across all combinations of:
1. **Canonical Stage:** `Quote` (0), `Booked` (1), `Packed` (2), `On Rent` (3), `Returned` (4), `Closed` (5).
2. **Operational Flags:** `Standard`, `Shortage / Conflict`, `Due Soon`, `Overdue Return`, `Gate Locked`, `Damaged / QC Hold`.
3. **Financial Status:** `Unpaid`, `Advance Pending`, `Deposit Pending`, `Deposit Held`, `Settlement Due`, `Fully Reconciled`.
4. **User Role (RBAC):** `Owner`, `Office Manager`, `Dispatcher`, `Floor Warehouse Crew`.

### Non-Negotiable Operational Laws Enforced
- **Law of One Primary Action:** Exactly ONE high-contrast Primary button is rendered per row.
- **Law 6 (Warehouse Sees No Money):** In Floor Warehouse view, all financial amounts and rates are strictly stripped at the database/RLS layer. In their place, floor staff see a binary gate: **`Gate Clear`** or **`Gate Locked`**.
- **Law 11 (Never Colour Alone):** Every status tag combines an **explicit icon**, a **text label**, and a **semantic color**.
- **Law 15 (44px Minimum Touch Targets):** All row buttons, menus, and checkboxes meet the minimum 44×44px hit bounds on desktop and touchscreens.

---

## 2. Master Row Action Matrix (Exhaustive Table)

| # | Booking Stage | Operational Flag | Payment / Gate State | Primary Action Verb (Solid) | Secondary Action (Ghost / Link) | Overflow Menu (`•••`) Options | Target Modal / Drawer | Role Permissions |
|---|---|---|---|---|---|---|---|---|
| **01** | `Quote` | None | Unpaid (Draft) | `[ Confirm & Advance ]` | `[ Send Quote PDF ]` | • Edit Kit<br>• Duplicate Quote<br>• Apply Law 10 Discount<br>• Cancel Quote (Law 3) | Advance Payment & Confirmation Modal | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Edit/Send<br>• Floor: View Only |
| **02** | `Quote` | Shortage | Advance Not Paid | `[ Resolve Conflict ]` | `[ Edit Kit ]` | • Sub-Rent Inquiry<br>• Substitute Gear<br>• Call Client<br>• Cancel Quote | Inventory Availability & Conflict Matrix | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Sub-rent<br>• Floor: View Only |
| **03** | `Quote` | Expired (>7d) | Unpaid | `[ Re-Quote ]` | `[ Archive (Law 3) ]` | • Refresh Pricing<br>• Contact Client<br>• Delete Draft (Void) | Quote Refresh & Re-Validation Dialog | • Owner: Full<br>• Manager: Full<br>• Dispatcher: View/Send |
| **04** | `Booked` | None | Advance Cleared | `[ Start Packing ]` | `[ Print Flight Case Tags ]` | • Reassign Serial Numbers<br>• Print Prep Sheet<br>• Reschedule Dates<br>• Add Tech Note | `Job: Pack` Flight Case Tree Checklist | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Full<br>• Floor: Pack & Tag |
| **05** | `Booked` | Shortage | Advance Cleared | `[ Resolve Shortage ]` | `[ Print Prep Sheet ]` | • Initiate Sub-Rental<br>• Swap Serialized Unit<br>• Expedite Return Reset<br>• Notify Dispatcher | Sub-Rental / Equipment Swap Dialog | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Full<br>• Floor: Alert Only |
| **06** | `Booked` | Caretaker Required | Advance Cleared | `[ Assign Caretaker ]` | `[ Start Packing ]` | • View Crew Roster<br>• Send Brief to Tech<br>• Re-print Call Sheet | Crew Dispatch & Caretaker Assignment | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Full<br>• Floor: View Assigned |
| **07** | `Packed` | Ready on Shelf | Deposit Held / Gate Clear | `[ Start Handover ]` | `[ View Staging Shelf ]` | • Print Handover Slip<br>• Re-check Flight Case<br>• Modify Serial Unit | `Job: Handover` Digital Signature Canvas | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Full<br>• Floor: Run Handover |
| **08** | `Packed` | Ready on Shelf | Deposit Pending (Office View) | `[ Secure Deposit ]` | `[ Start Handover ]` | • Request Cash/Cheque<br>• Apply Trust Exemption<br>• Print Prep Summary | Security Deposit Intake Modal | • Owner: Full<br>• Manager: Full<br>• Dispatcher: View<br>• Floor: **Hidden (Law 6)** |
| **09** | `Packed` | Ready on Shelf | Gate Locked (Floor View) | `[ ⚠️ Refer to Office ]` | `[ View Staging Shelf ]` | • View Packing Summary<br>• Verify Flight Case QR<br>• Call Dispatcher | Administrative Gate Notice Popover | • Floor Crew: Read-Only Gate Notice |
| **10** | `On Rent` | In Field | Active (Within Time) | `[ Check-In Return ]` | `[ Extend Rental ]` | • Report Mid-Shoot Incident<br>• WhatsApp Client<br>• View Dispatch Manifest | `Job: Return` Inspection & Scanning Drawer | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Full<br>• Floor: Check-In |
| **11** | `On Rent` | Return Due Today | Active (< 4h to cutoff) | `[ Prep Return Bench ]` | `[ Check-In Return ]` | • Send Courtesy Reminder<br>• Check Next Booking Collisions<br>• Call Client | Return Bench Staging & Intake Queue | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Full<br>• Floor: Ready Bench |
| **12** | `On Rent` | Overdue Return | Overdue (> 06:00 cutoff) | `[ Overdue Check-In ]` | `[ Contact Client ]` | • Assess Late Fee (§1.6)<br>• Review Collisions<br>• Waive Late Fee (Gate)<br>• Security Alert | Late Return Check-In & Fee Bander | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Overdue<br>• Floor: Physical Scan |
| **13** | `Returned` | QC Due | Deposit Held | `[ Start Reset & QC ]` | `[ Quick Visual Check ]` | • Log Damage Finding<br>• Sensor Sweep Test<br>• Re-seat Cine Zoom<br>• Print Return Receipt | `Job: Reset` QC Bench Checklist & Bench SOPs | • Owner: Full<br>• Manager: Full<br>• Dispatcher: View<br>• Floor: Run Reset |
| **14** | `Returned` | Damaged / Missing | Damage Quarantined | `[ Assess Damage ]` | `[ View Photos ]` | • Upload Repair Estimate<br>• Offset Security Deposit<br>• Send Damage Dossier<br>• Quarantine Asset | Damage Assessment & Deposit Offset Engine | • Owner: Approve $\ge 25\text{k}$<br>• Manager: Approve $< 25\text{k}$<br>• Dispatcher: View<br>• Floor: Log Photos |
| **15** | `Returned` | Passed QC & Reset | Settlement Due (Office View) | `[ Settle & Close ]` | `[ Release Deposit ]` | • Print Final Tax Invoice<br>• Send Closing Statement<br>• Add Client Loyalty Points | Deposit Reconciliation & Final Settlement | • Owner: Full<br>• Manager: Full<br>• Dispatcher: View<br>• Floor: **Hidden (Law 6)** |
| **16** | `Returned` | Passed QC & Reset | Reset Signed (Floor View) | `[ Gear Returned to Shelf ]` | `[ Print Staging Label ]` | • View QC Signoff<br>• Check Flight Case Nesting | Shelf Location Staging Dialog | • Floor Crew: Confirm Staged in Bay |
| **17** | `Closed` | None | Fully Reconciled | `[ View Dossier ]` | `[ Repeat Rental ]` | • Download Full Audit ZIP<br>• Print Tax Invoice<br>• Review Damage Log<br>• Client History Link | Immutable Rental Archive View | • Owner: Full<br>• Manager: Full<br>• Dispatcher: Repeat<br>• Floor: Read Only |

---

## 3. Visual Badge Syntax (Law 11 Compliance)

Every status indicator throughout the table must comply with **Law 11 (Never colour alone)**. It must bundle a distinct Lucide icon, an uppercase/capitalized text label, and a contrast-tested background/text token:

```
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE BADGES:                                                         │
│  Quote:     [ 📄 QUOTE ]         (bg-slate-100 text-slate-700)        │
│  Booked:    [ 📅 BOOKED ]        (bg-amber-100 text-amber-900)        │
│  Packed:    [ 📦 PACKED ]        (bg-blue-100 text-blue-900)          │
│  On Rent:   [ 🚀 ON RENT ]       (bg-emerald-100 text-emerald-900)    │
│  Returned:  [ 🔄 RETURNED ]      (bg-purple-100 text-purple-900)      │
│  Closed:    [ 🔒 CLOSED ]        (bg-zinc-100 text-zinc-600)          │
├────────────────────────────────────────────────────────────────────────┤
│  ALERT & GATE BADGES:                                                  │
│  Shortage:     [ ⚠️ SHORTAGE ]   (bg-rose-100 text-rose-800)          │
│  Overdue:      [ 🚨 OVERDUE ]    (bg-red-100 text-red-900 animate-pulse)│
│  Gate Clear:   [ 🟢 GATE CLEAR ] (bg-emerald-50 text-emerald-800)     │
│  Gate Locked:  [ ⛔ GATE LOCKED ](bg-amber-100 text-amber-900)        │
│  Damage Hold:  [ 🛠️ QC HOLD ]    (bg-orange-100 text-orange-900)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Operational Workflows for Primary Row Actions

### Workflow A: `[ Start Packing ]` (Row 04)
1. **Trigger:** Floor tech taps `[ Start Packing ]` on a `Booked` rental row.
2. **View:** Launches full-screen slide-over `Job: Pack` (3-column layout):
   - **Column 1:** Flight Case Tree (e.g. `Pelican 1510 #1 [Camera Rig]`, `Pelican 1510 #2 [Optics]`, `Soft Bag [Support]`).
   - **Column 2:** Serial Item Pull List with integrated barcode/QR scanner or manual 1-tap checkoff.
   - **Column 3:** Mandatory Accessory Guard (auto-prompts: *RED approved CFexpress card inserted? Tilta Mirage attached? 15mm rods packed?*).
3. **Completion:** Upon 100% checkoff, tech taps `[ Mark as Packed ]`. Stage advances to `Packed`. System automatically logs technician ID, timestamp, and assigns staging shelf e.g. `Shelf B-04`.

---

### Workflow B: `[ Start Handover ]` (Row 07)
1. **Trigger:** Floor tech taps `[ Start Handover ]` when client arrives.
2. **Pre-Flight Gate:** System instantaneously evaluates `evaluateHandoverGate(rental, 'floor_crew')`.
   - If `depositHeld === false` $\rightarrow$ Action aborts with modal: *"Release Blocked: Security Deposit Pending with Office."*
   - If `canRelease === true` $\rightarrow$ Handover wizard opens.
3. **Verification Steps:**
   - Physical kit walk-through with client.
   - Serial number visual match.
   - High-friction accessory physical count (antennas, 15mm rods, magnets).
4. **Client Signature:** Client signs directly on iPad/tablet canvas.
5. **Release:** Tech taps `[ Complete Handover & Release ]`. Stage advances to `On Rent`. Rental countdown timer starts in UTC.

---

### Workflow C: `[ Check-In Return ]` (Row 10 / 12)
1. **Trigger:** Client returns gear to Boudha hub. Tech taps `[ Check-In Return ]`.
2. **Intake Flow:**
   - Tech scans or taps off returned flight cases.
   - Serial number verification against original dispatch manifest.
   - If return is $> 30$ mins past 06:00 cutoff, system automatically prompts late return band:
     - $31\text{ to } 120\text{ min} \rightarrow$ Half Day fee calculated.
     - $> 120\text{ min} \rightarrow$ Full Day fee calculated.
     - Tech can flag waiver request requiring Manager approval.
3. **Debrief Loop:** Tech answers mandatory 60-second debrief prompt:
   - *"Did gear perform without incident?"* $\rightarrow$ Yes / No.
   - If No $\rightarrow$ Categorize: Gear Failure / Physical Damage / Missing Piece.
4. **Completion:** Stage moves to `Returned`. **Gear is strictly NOT returned to available inventory yet** (`RETURNED ≠ AVAILABLE`).

---

### Workflow D: `[ Start Reset & QC ]` (Row 13)
1. **Trigger:** Bench tech initiates `Job: Reset` on returned gear.
2. **Bench QC Protocols:**
   - **Sensor Sweep:** Light table test at $f/22$ for dust/oil spots.
   - **Cine Zoom Parfocal Check:** Siemens star alignment at minimum and maximum focal lengths.
   - **SDI Port Check:** Verifies 12G-SDI clean output.
   - **Physical Decontamination:** Cleans dust, checks silica packs, sanitizes grips.
3. **Branching Outcomes:**
   - **All Passed:** Tech taps `[ QC Passed & Cleaned ]`. Gear moves to `AVAILABLE` stock. Rental moves to `Closed` (or pending deposit refund).
   - **Issue Found:** Tech taps `[ Log Damage ]`. Uploads min 1 photo, enters description, marks quarantined. Status moves to `Damage Hold`.

---

## 5. Mobile & Tablet Row Ergonomics

On viewports $< 768$px, table rows transform into modular cards adhering to **Law 14 & 15**:

```
┌────────────────────────────────────────────────────────┐
│ BK-2026-0891 · Saugat Dhital                 [••• Menu]│
│ RED Komodo-X 6K Cinema Package                         │
│ 📅 26 Sep (06:00) → 29 Sep (06:00) · 3 Days            │
├────────────────────────────────────────────────────────┤
│ [ 📦 PACKED ]    [ 🟢 GATE CLEAR ]                     │
├────────────────────────────────────────────────────────┤
│ [ ⚡ START HANDOVER SESSION                          ] │
└────────────────────────────────────────────────────────┘
```

1. **Top Row:** Booking ID, client name, and the 3-dot overflow menu (`•••`) with 44×44px hit bounds.
2. **Middle Band:** Gear description and 06:00-aligned dates.
3. **Status Band:** Law 11 compliant badges (`Stage` + `Gate Status`).
4. **Full-Width Action Floor:** The Primary Action button stretches 100% width across the bottom of the card (`height: 44px`, `rounded-lg`, bold typography, high contrast amber/blue/emerald background).

---

## 6. Implementation Checklist for Developers

- [ ] Connect table row Primary Action to `evaluateHandoverGate()` in `src/lib/actions/handoverGate.ts`.
- [ ] Enforce Law 6 via Supabase/PostgreSQL Row Level Security (RLS) views (`rentals_floor_v` masks monetary columns `subtotal`, `discount`, `vat`, `rental_total`, `deposit_paisa`).
- [ ] Implement 300ms debounce on search input, zero debounce on stage/flag facet toggles.
- [ ] Ensure all action buttons use `min-h-[44px]` and `min-w-[44px]` touch containers.
- [ ] Verify that tapping `[ Check-In Return ]` routes through the mandatory 60-second debrief prompt.
- [ ] Ensure that `Returned` gear cannot be assigned to new bookings until `Job: Reset` has been signed off.

---
*Babin Rentals OS · Row Action Matrix Approved for Production Implementation*
