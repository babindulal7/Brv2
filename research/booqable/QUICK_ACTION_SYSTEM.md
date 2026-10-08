# Booqable Research — Quick Action & Operational Workflow System

**Document Type:** Empirical Interaction Analysis & Technical Deconstruction  
**Subject:** Booqable Admin Backend UI (Action Systems & State Transitions)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Quick Action Placement Grammar

Booqable strictly restricts operational actions into **five distinct placement families** across the product. No action lives outside these five tiers:

| Family | Location | Visual Expression | Trigger Purpose |
|---|---|---|---|
| **F1: Header Primary** | Top-Right of Page Header | Solid Blue button (`#1b68b3` / `--primary`), optional split-button caret | Create actions (`+ New booking`, `Add product ▾`, `Add customer`) |
| **F2: Bulk Action Bar** | Table Toolbar (Left) | Disabled gray button at 0 items, active dropdown at >=1 items | Batch operations on selected records (`Actions ▾ · 3 selected`) |
| **F3: Row-Level Verb** | Rightmost column in data table | Single, compact button (32px height) or text link | Singular next operational step (`End`, `Pick Up`, `Return`) |
| **F4: Panel Quick Links** | Dashboard Panel Headers & Footers | Right-aligned text links (`View late (1) →`, `View all →`) | Contextual navigation that pre-filters target list |
| **F5: Detail Page Verb Rail** | Top-Right of Booking Detail Header | High-visibility Amber/Blue action pill (`↑ Pick Up`, `↓ Return`) | Primary stage progression button for the active document |

---

## 2. Order Lifecycle State & Quick Action Matrix

Booqable enforces strict state-dependent action availability. An order row or header displays different actions based directly on its rental and payment state:

| Order State | Primary Action (Row/Header) | Secondary Action | Overflow Menu (`•••`) Actions |
|---|---|---|---|
| **Concept (Draft)** | `Reserve` (Locks inventory) | `Edit Order` | Send quote, Delete draft, Add customer, Duplicate |
| **Reserved** | `↑ Pick Up` (Opens Handover) | `Register Payment` | Edit dates, Send contract, Print packing slip, Cancel |
| **Started (Picked up)** | `↓ Return` (Opens Check-in) | `Add Items` (Swap/Add) | Extend rental period, Report shortage, Print receipt |
| **Returned** | `Archive` (Removes from active) | `View Invoice` | Create credit note, Re-open order, Print return slip |
| **Late / Overdue** | `↓ Return (Late)` (Highlighted) | `Contact Client` | Charge late fee, Send return reminder, Flag customer |
| **Cancelled** | *None (Read-only)* | `Re-activate` | View audit trail, Delete permanently |
| **Archived** | *None (Read-only)* | `Duplicate` | Restore to active list, Export PDF |

---

## 3. Pickup Quick Action Workflow (Handover)

When an operator clicks the primary **`↑ Pick Up`** action on a `Reserved` booking:

```
[ Click '↑ Pick Up' ] 
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MODAL DRAWER: Pick Up Order #854 — Bikash Shrestha                     │
│ ────────────────────────────────────────────────────────────────────── │
│ SUMMARY: 6 items · Period: 24 Jul – 26 Jul 2026                        │
│                                                                        │
│ EQUIPMENT LINES:                                                       │
│ [x] Sony FX3 Cinema Line Camera           SN: 4402194  [ Scanned ✓ ]   │
│ [x] Sony FE 24-70mm f/2.8 GM II Lens      SN: 8810231  [ Scanned ✓ ]   │
│ [x] Aputure 600d Pro Light                SN: 3301920  [ Scanned ✓ ]   │
│ [ ] DJI RS4 Pro Gimbal Combo              SN: [Auto-assign on scan]    │
│ [ ] 2x Sony NP-FZ100 Batteries (Bulk)     Qty: 2/2     [ Mark Ready ]  │
│ ────────────────────────────────────────────────────────────────────── │
│ BARCODE SCANNER INPUT:                                                 │
│ [ 📷 Scan barcode / serial tag...                                    ] │
│ ────────────────────────────────────────────────────────────────────── │
│ SHORTAGE WARNING:                                                      │
│ ⚠️ DJI RS4 Pro has 0 available units in vault.                         │
│ [ ] Allow shortage (External sub-hire required)                        │
│ ────────────────────────────────────────────────────────────────────── │
│ SIGNATURE & HANDOVER:                                                  │
│ Receiver: Bikash Shrestha                                              │
│ [ Sign on Glass / Client Signature Drawer                            ] │
│ ────────────────────────────────────────────────────────────────────── │
│ [ Cancel ]                                        [ Complete Pick Up ] │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Step-by-Step Pickup Interaction Rules
1. **Drawer Presentation:** Opens as an overlay slide-out drawer from the right side of the screen (`width: 640px`).
2. **Line Item Validation:** Every line item must be marked as either:
   - Scanned / Serial Assigned
   - Bulk Quantity Confirmed
   - Swapped with an equivalent model
3. **Shortage Interception:** If an item is unallocated or double-booked, Booqable displays an amber shortage warning. The operator must check "Allow shortage" or swap the item before completing pickup.
4. **Post-Completion State Shift:**
   - The booking state immediately flips from `Reserved` to `Started`.
   - The primary action button flips from `↑ Pick Up` to `↓ Return`.
   - Inventory availability counters decrement across the entire application in real time.

---

## 4. Return Quick Action Workflow (Check-in & Inspection)

When an operator clicks **`↓ Return`** on a `Started` booking:

```
[ Click '↓ Return' ]
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MODAL DRAWER: Return Order #854 — Bikash Shrestha                      │
│ ────────────────────────────────────────────────────────────────────── │
│ RETURN STATUS: 6 items out · Return Deadline: 26 Jul 2026, 06:00 AM    │
│                                                                        │
│ CHECK-IN CHECKLIST:                                                    │
│ [x] Sony FX3 Camera (SN: 4402194)         [ Good Condition ✓ ]  [🔧]   │
│ [x] Sony 24-70mm GM II (SN: 8810231)      [ Glass Clean ✓    ]  [🔧]   │
│ [x] Aputure 600d Pro (SN: 3301920)        [ Cable Check ✓    ]  [🔧]   │
│ [!] DJI RS4 Pro Gimbal (SN: 1102948)      [ ⚠️ Damage Reported ] [🔧]   │
│ [ ] 2x Sony NP-FZ100 Batteries            [ ⚠️ 1 Missing ]      [🔧]   │
│ ────────────────────────────────────────────────────────────────────── │
│ DAMAGE & DOWNTIME ROUTING:                                             │
│ DJI RS4 Pro marked for inspection: Axis lock loose.                    │
│ -> Auto-creates Downtime entry in maintenance queue.                   │
│ ────────────────────────────────────────────────────────────────────── │
│ FINANCIAL SETTLEMENT:                                                  │
│ Rental Balance: Rs. 0 · Deposit Held: Rs. 25,000                       │
│ Deductions: Rs. 2,500 (Missing Battery)                                │
│ Refund Balance: Rs. 22,500                                             │
│ ────────────────────────────────────────────────────────────────────── │
│ [ Cancel ]                                         [ Complete Return ] │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Step-by-Step Return Interaction Rules
1. **Condition Toggles:** Every serialized item has a condition check trigger. Toggling "Damaged" opens a sub-form to record photos and description.
2. **Partial Returns:** Operators can check in 4 out of 6 items. The booking transitions into a `Partially Returned` status, keeping the remaining 2 units active on rent.
3. **Automated Maintenance Routing:** Marking an item damaged or dirty immediately flags the asset in the Inventory roster and creates a `Downtime` record.
4. **Deposit Settlement Link:** The return drawer interfaces directly with the security deposit ledger, allowing direct deduction for missing items before returning funds.

---

## 5. Payment Quick Actions & Financial Modals

Booqable provides **three contextual payment actions**:

### 5.1 "Register Payment" Modal
- **Trigger:** Clicked from the booking sidebar or row menu.
- **Fields:**
  - Amount (Defaults to exact outstanding balance)
  - Payment Method: Cash, Bank Transfer / QR, Card, Custom
  - Date & Timestamp (Defaults to current local time)
  - Reference / Receipt Number
- **Effect:** Immediately recalculates `payment_status` (`unpaid` -> `partially_paid` -> `paid`).

### 5.2 "Request Payment" (Online Link)
- **Trigger:** Clicked when an invoice has an outstanding balance.
- **Behavior:** Generates a secure hosted checkout link or triggers an automated email with embedded Stripe/payment portal buttons.

### 5.3 Security Deposit Quick Action
- **Trigger:** Separate deposit strip on Booking Detail.
- **Modes:**
  - `Hold Deposit` (Credit card pre-authorization or cash receipt)
  - `Release Deposit` (Zero-fee return of funds)
  - `Claim Deposit` (Converts deposit into payment against damage/late fees)

---

## 6. Babin Rentals OS Architectural Synthesis

### What Babin Rentals OS Adopts:
1. **Single Primary Action Law:** Every booking row has exactly ONE primary button representing the immediate physical logistics step.
2. **Amber/Green Visual Language:**
   - Amber = Action Required before equipment crosses perimeter (`Pack`, `Handover`).
   - Green = Returning gear / Completed safe state (`Return`, `Inspect`).
3. **Drawer-Based Flows:** Handover and Return run as focused workspaces, preventing full-page reloads and keeping operator context alive.

### What Babin Rentals OS Replaces:
1. **No Money on Floor Screens (Law 6):** Unlike Booqable, which shows raw financial balances on the warehouse floor pickup screen, Babin Rentals OS hides financial amounts from warehouse tablets, replacing them with binary audit gates (`Deposit Verified ✓`, `Accounts Cleared ✓`).
2. **Strict Multi-Session Support:** Babin Rentals OS natively tracks multi-case, partial handovers with individual session timestamps, avoiding Booqable's flat single-timestamp limitation.
