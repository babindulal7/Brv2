# Babin Rentals OS — Quick Action State Transition Matrix

**Standard Reference:** Foundation Specification v2.0 & Brain v5.0 Enterprise  
**Authoritative Engine:** `src/lib/workflow.ts` & `src/lib/os_engine.py`  
**Governing Laws:** Law 5 (Deposits), Law 6 (Floor Blindness), Law 10 (Discount Gates), Law 11 (Never Colour Alone), Law 17 (Client Terminology)

---

## 1. Master Operational State Matrix

Every booking record in Babin Rentals OS progresses through an immutable, deterministic finite state machine consisting of **6 canonical stages** and **4 operational jobs**:

| Stage Index | Stage Name | Primary Quick Action Verb | Secondary Action Verbs | Row Hover Quick Action | Kebab (`...`) Secondary Actions | Forbidden Actions |
|---|---|---|---|---|---|---|
| **0** | **Quote** | `[ ✓ Confirm Booking ]` *(Brand Blue)* | `[ + Add Gear ]`<br>`[ ✉ Send Quote ]` | `[ View Quote ]`<br>`[ Confirm ]` | `Print Quote Sheet`<br>`Apply Law 10 Discount`<br>`Duplicate Quote`<br>`Cancel Quote` | Handover / Dispatch<br>Check-in / Return<br>Issue Final Invoice |
| **1** | **Booked** | `[ 📦 Pack Gear ]` *(Indigo)* | `[ 💵 Record Advance ]`<br>`[ 🖨 Picklist ]` | `[ Staging Slip ]`<br>`[ Pack ]` | `Print Warehouse Picklist`<br>`Assign Prep Tech`<br>`Extend Dates`<br>`Cancel Booking` | Handover / Dispatch (Before Packing)<br>Return<br>Close / Settle Deposit |
| **2** | **Packed** | `[ 🚀 Handover Gear ]` *(Orange Accent)* | `[ 📄 Review Manifest ]`<br>`[ 💵 Settle Dues ]` | `[ Dispatch ]`<br>`[ Manifest ]` | `Print Packing Slip`<br>`Send Digital Sign Link`<br>`Swap Item (QC Failure)`<br>`Cancel Booking` | Return<br>Close<br>Handover with Unpaid Advance (Blocked by Gate R1) |
| **3** | **On Rent** | `[ 🔄 Return Gear ]` *(Emerald Green)* | `[ ⏳ Extend Rental ]`<br>`[ ⚠️ Log Incident ]` | `[ Quick Return ]`<br>`[ Incident ]` | `Print Active Rental Manifest`<br>`Swap Defective Gear`<br>`Log Mid-Shoot Extension`<br>`Flag Overdue` | Re-handover<br>Delete / Cancel Booking<br>Close / Archive |
| **4** | **Returned** | `[ 🔍 Inspect & Reset ]` *(Amber Warning)* | `[ 💵 Settle Deposit ]`<br>`[ 🧾 Issue Invoice ]` | `[ Bench QC ]`<br>`[ Settle ]` | `Log Damage Finding`<br>`Calculate Late Return Fee`<br>`Print Return Receipt`<br>`Waive Fee (Gate)` | Handover / Re-dispatch<br>Mark as Available (Before Reset Completes)<br>Refund Deposit (Before Settling Damage) |
| **5** | **Closed** | `[ 📁 View Invoice ]` *(Neutral Slate)* | `[ 📋 Clone Booking ]`<br>`[ 🖨 Summary PDF ]` | `[ Invoice ]`<br>`[ History ]` | `Export Financial Audit Row`<br>`View Full Lifecycle Audit`<br>`Email Receipt to Client` | Edit Line Items<br>Modify Payments (Immutable Law 4)<br>Re-open / Dispatch Gear |

---

## 2. Exhaustive Stage Specifications & Validation Gates

### 2.1 Stage 0: `Quote` (Inquiry & Estimation)
* **Status Intent:** Client has requested equipment availability and pricing; no inventory reservation is committed until advance criteria are satisfied.
* **Primary Verb:** `[ Confirm Booking ]` (Icon: `check`, Color: `#2563EB`).
* **Validation Gates:**
  - **Advance Gate (§R1):**
    - Total $< \text{NPR } 5,000$: Full payment required before confirmation.
    - Total $\ge \text{NPR } 5,000$: Minimum NPR 5,000 advance.
    - Total $\ge \text{NPR } 10,000$: Minimum 50% advance.
  - **Law 10 Discount Gate:** If discount $> 10\%$, requires a reason $\ge 10$ characters AND a named approving manager; hard cap at $25\%$.
* **Warehouse Visibility (Law 6):** Floor technicians cannot see Quote financial breakdowns.

---

### 2.2 Stage 1: `Booked` (Reserved & Staging Queue)
* **Status Intent:** Inventory is locked and physically blocked from other bookings. Gear is placed on the staging queue.
* **Primary Verb:** `[ Pack Gear ]` (Icon: `box`, Color: `#4F46E5`).
* **Operational Job:** Launches `Job: Pack`. Warehouse tech verifies flight cases, lens mount adapters, cables, and accessories against the staging manifest.
* **Validation Gates:**
  - **Safety Check:** Automated verification that heavy lenses have 15mm support rods, cinema cameras have certified media, and batteries meet watt-hour requirements.

---

### 2.3 Stage 2: `Packed` (Staged & Ready on Floor)
* **Status Intent:** Kit is boxed, labeled with client luggage tags, and sitting on the dispatch bench awaiting client arrival.
* **Primary Verb:** `[ Handover Gear ]` (Icon: `truck`, Color: `#F97316`).
* **Operational Job:** Launches `Job: Handover`.
* **Validation Gates:**
  - **Gate R1 Payment Verification:** Handover button is **strictly disabled** if pending advance or outstanding balance threshold is violated.
  - **Digital Handover Signature:** Client must sign on screen; serial barcodes are scanned and recorded.
  - **Law 6 Enforcement:** Handover interface displayed to warehouse staff renders **zero financial figures** (no rates, no daily fees, no totals).

---

### 2.4 Stage 3: `On Rent` (Active in Field)
* **Status Intent:** Equipment is legally in the custody of the client.
* **Primary Verb:** `[ Return Gear ]` (Icon: `rotate-ccw`, Color: `#16A34A`).
* **Operational Job:** Launches `Job: Return`.
* **Validation Gates:**
  - **Late Return Bander (`lateFee.ts`):**
    - $\le 30$ mins: Grace period (NPR 0).
    - $31 - 120$ mins: Half Day fee.
    - $> 120$ mins: Full Day rate per 24h overage.

---

### 2.5 Stage 4: `Returned` (Quarantine & Bench QC)
* **Status Intent:** Gear is physically back in Boudha, but **strictly unavailable for re-renting** (`RETURNED ≠ AVAILABLE`).
* **Primary Verb:** `[ Inspect & Reset ]` (Icon: `wrench`, Color: `#D97706`).
* **Operational Job:** Launches `Job: Reset` (Absorbs Cleaning and Bench QC).
* **Validation Gates:**
  - **Damage & Loss Findings (`damage.ts`):** Requires photographic proof and description $\ge 10$ characters.
  - **Law 5 Deposit Settlement:** Deposit liability is applied against verified damage or returned in full. It never reduces the rental revenue total.

---

### 2.6 Stage 5: `Closed` (Settled & Reconciled)
* **Status Intent:** All gear is inspected, reset, returned to dry cabinets; all payments, invoices, and deposits are settled.
* **Primary Verb:** `[ View Invoice ]` (Icon: `file-text`, Color: `#64748B`).
* **Operational Job:** Record is permanently closed and archived.
* **Validation Gates:**
  - **Law 4 Immutability:** Payment records can never be updated or deleted; reversals must be appended as offset rows.
