# Booqable Research — Hover & Preview Card Architecture

**Document Type:** Empirical Interaction Analysis & Technical Deconstruction  
**Subject:** Booqable Admin Backend UI (Hover Affordances & Rich Preview Cards)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Overview & Ergonomic Intent

Booqable relies heavily on **rich hover preview cards** to solve a fundamental density dilemma in rental operations:
> *How can an operator evaluate an order, customer reputation, or equipment availability without leaving their current list view or losing their table scroll position?*

Instead of forcing page transitions or heavy modal dialogs, hovering over key hyperlinked entities displays an informative floating card anchored to the cursor.

```
Table Row:
#854  │ 24 Jul 2026 │ [ Bikash Shrestha] ──┐
─────────────────────────────────────────────│
                                             ▼ (Floating Preview Card after 400ms)
                        ┌────────────────────────────────────────────────────────┐
                        │  Bikash Shrestha                  [ VIP / Agency ⭐ ] │
                        │ Film Director & Producer · Kathmandu                   │
                        │ ────────────────────────────────────────────────────── │
                        │ 📞 +977 9841234567         ✉️ bikash@cinema.np         │
                        │ 🏢 Mandala Films Pvt. Ltd. 📍 Jhamsikhel, Lalitpur    │
                        │ ────────────────────────────────────────────────────── │
                        │ CLIENT METRICS:                                        │
                        │ 12 Rentals Completed · Rs. 4,85,000 Lifetime Spend     │
                        │ Security Deposit: Standard Waiver Approved             │
                        │ ────────────────────────────────────────────────────── │
                        │ CURRENT ACTIVITY:                                      │
                        │ Active on #B-854 (Kathmandu Jazz Festival, 6 items)    │
                        │ ────────────────────────────────────────────────────── │
                        │ [ View Full Profile → ]      [ Create New Booking + ]  │
                        └────────────────────────────────────────────────────────┘
```

---

## 2. Entity Preview Card Specifications

### 2.1 Customer / Client Preview Card
- **Trigger Element:** Any link rendering the client's name in Orders, Calendar, or Invoices.
- **Card Width:** `340px`
- **Information Hierarchy:**
  1. Header: Avatar/Initials, Full Name, Corporate Badge, Tag Chips (`VIP`, `Cash Only`).
  2. Contact Strip: Direct telephone link (`tel:`) and email link (`mailto:`).
  3. Reliability Metrics: Total bookings count, lifetime rental spend, payment punctuality rating.
  4. Active Booking Status: Names current booking and return date if gear is currently out.
  5. Quick Footer: Single-click navigation to `/customers/{id}` or trigger new booking for this customer.

### 2.2 Product & Inventory Preview Card
- **Trigger Element:** Equipment title in booking line items, search results, or calendar bars.
- **Card Width:** `360px`
- **Information Hierarchy:**
  1. Header: Product primary photo thumbnail (64x64px), Model name, Brand (`Sony`, `Aputure`).
  2. Inventory Stock Strip:
     - `Total Owned`: e.g. 4 units
     - `In Vault / Available`: e.g. 2 units (Green badge)
     - `Out on Rent`: e.g. 1 unit
     - `In Maintenance / QC`: e.g. 1 unit (Amber badge)
  3. Pricing Matrix: Daily rate (`Rs. 4,500/day`), 3-Day weekend rate, Replacement value.
  4. Next Scheduled Release: Date and booking number of the next upcoming reservation.

### 2.3 Order / Booking Preview Card
- **Trigger Element:** Order number `#854` in Calendar, Customer detail, or Dashboard movements.
- **Card Width:** `380px`
- **Information Hierarchy:**
  1. Header: `#854` with Stage Pill (`Reserved`) and Payment Badge (`Unpaid`).
  2. Client & Project: Client Name, Project Name (*Kathmandu Jazz Festival*).
  3. Schedule: Pickup timestamp (BS & AD) to Return timestamp.
  4. Gear Roster Summary: First 4 line items with quantities, plus `+2 more items...` chip.
  5. Financial Strip: Total rental charge, deposit held, balance outstanding.
  6. Action CTA: `Open Workspace →`

### 2.4 Stock Item / Serial Number Preview Card
- **Trigger Element:** Serial number badge or barcode tag (`PEL-1510-REDKOM-01`).
- **Card Width:** `300px`
- **Information Hierarchy:**
  1. Asset Tag & Barcode: `SN: 4402194` / `EQ000214`.
  2. Optical / QC State: `Sensor Clean ✓`, `Firmware v3.0`, `Cleaned on 22 Sept`.
  3. Home Storage Location: `Vault Shelf A-2`.
  4. Current Custody: Names the booking number and client currently holding the asset.

---

## 3. Timing & Physical Interaction Parameters

To prevent the common UX defect known as **"Hover Flapping"** (where preview popovers flicker wildly as the user moves their mouse across a table):

| Parameter | Measured Timing / Rule | Purpose |
|---|---|---|
| **Hover Delay (`showDelay`)** | `400ms` | Prevents the card from popping open when the user is simply moving their cursor across the table to click a button. |
| **Exit Grace Window (`hideDelay`)** | `250ms` | Provides enough time for the operator to move their cursor off the trigger link and **into the card body** without it closing. |
| **Pointer Persistence** | Mouse can enter card body | Interactive links inside the card (e.g. `tel:`, `View Profile`) remain fully clickable. |
| **Collision Detection** | Viewport Smart Flip | If trigger is within 250px of the right screen edge, card renders to the left. If near the bottom edge, flips to render above. |
| **Z-Index Layering** | `z-index: 1050` | Sits above table headers and sticky bars, but below modal dialogs and slide-out drawers. |

---

## 4. Mobile & Touch Ergonomics

On touchscreens (iPads, Android tablets, smartphones):
1. **Hover State Non-Existent:** Native hover does not exist on touch devices; tap must trigger the primary navigation.
2. **Booqable Fallback:** On touch devices, clicking the link navigates directly to the page. There is no preview card on mobile.
3. **Babin Rentals OS Improvement:**
   - In Babin Rentals OS, mobile and warehouse floor tablets convert preview cards into a **Bottom Action Sheet / Popover** on `Long-Press (500ms)`, allowing warehouse staff holding an iPad to inspect client phone numbers and vault locations without losing their place on the packing line.
