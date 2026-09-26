# Babin Rentals OS — Quick Action Panel & Handover Cockpit Specification

**System Component:** Operational Drawer & Handover/Return Subsystem  
**Implementation Standard:** Babin Rentals OS UI Standard (React 19 + TypeScript + Tailwind CSS)  
**Governing Laws:** Law 5 (Deposit Liability), Law 6 (Floor Blindness), Law 11 (Never Colour Alone), Law 15 (44px Touch Targets), Law 17 (Client Terminology)  
**Target Locations:** `src/components/ui/RentalQuickActionDrawer.tsx` & `src/modules/rentals/`

---

## 1. Architectural Philosophy & Slide-Over Drawer Model

In Babin Rentals OS, physical gear movements occur on the warehouse prep bench in Boudha. Rather than navigating through cumbersome multi-page forms, all operational jobs (`Pack`, `Handover`, `Return`, `Reset`) are executed through a **high-efficiency right slide-over cockpit**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ BABIN RENTALS OS — OPERATIONAL WORKFLOW DRAWER (Width: 480px)          │
│                                                                        │
│ ┌─ DRAWER HEADER ────────────────────────────────────────────────────┐ │
│ │ [Truck Icon] Handover Cockpit · Order #1039                  [ × ] │ │
│ │ Client: Saugat Dhital (Magan Ent) · Window: 06:00 AD (२०८३/०६/१०)  │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌─ GEAR MANIFEST & SERIAL CHECKLIST (Scrollable) ────────────────────┐ │
│ │ [x] Sony FX3A Cinema Line Body Kit (SN: 1042-FX3)                  │ │
│ │     ├─ [x] FX3A Camera Body (SN: 1042)                             │ │
│ │     ├─ [x] Sony NP-FZ100 Battery #1 (SN: B-991)                    │ │
│ │     └─ [x] Sony NP-FZ100 Battery #2 (SN: B-992)                    │ │
│ │ [x] Sigma 24-70mm f/2.8 DG DN Art II (SN: 8810-SIG)                │ │
│ │ [ ] Tilta Mirage Matte Box System (SN: 4402-TIL)                   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌─ BARCODE SCANNER DOCK ─────────────────────────────────────────────┐ │
│ │ [ 🔍 Scan or type barcode...                 ] [ 📷 Camera Scan ]  │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌─ CLIENT DIGITAL SIGNATURE PAD (HTML5 Canvas) ──────────────────────┐ │
│ │ ┌────────────────────────────────────────────────────────────────┐ │ │
│ │ │ ✍️ Sign on glass here (Law 17 Client Handover)                 │ │ │
│ │ └────────────────────────────────────────────────────────────────┘ │ │
│ │ [ Clear Signature ]                          [ Verified ID: Photo] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌─ STICKY EXECUTION FOOTER (Law 15: 44px min height) ────────────────┐ │
│ │ [ Cancel ]                        [ Confirm Handover (3/4 Scanned) ]│
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The Four Operational Jobs & Drawer Specializations

### 2.1 Job 1: `Pack` (Execution at `Booked` Stage)
* **Goal:** Verify that all accessories, flight cases, lens supports, and cables are assembled before staging.
* **Auto-Checks:**
  - CHIOPT or Anamorphic sets mandate 15mm rods and lens support.
  - RED Komodo-X mandates RED-approved CFexpress Type B media and V-mount adapter.
  - Aputure 600x mandates 10kg sandbag and heavy-duty C-stand.
* **Action:** Transitions booking to `Packed` stage.

### 2.2 Job 2: `Handover` (Execution at `Packed` Stage)
* **Goal:** Safely release cinema assets to the client with legal custody transfer.
* **Gate Verification:**
  - **Law 6 Strict Enforcement:** Drawer displays zero financial data. Technicians see equipment, serial numbers, case numbers, and client name only.
  - **Gate §R1 Advance Payment:** System blocks `Confirm Handover` if the required advance payment is unpaid.
  - **Client Signature on Glass:** Client draws digital signature directly on iPad/tablet touch surface.
  - **Serialized Verification:** Every serialized line item must be scanned or manually checked.
* **Action:** Transitions booking to `On Rent` stage; sends instant PDF manifest and WhatsApp confirmation to client.

### 2.3 Job 3: `Return` (Execution at `On Rent` Stage)
* **Goal:** Receive physical gear back from the shoot and log custody return.
* **Late Return Calculation (`lateFee.ts`):**
  - Evaluates current Kathmandu timestamp against scheduled return time (06:00 threshold).
  - Automatically flags grace period ($\le 30$ mins) or appends half-day / full-day fee band.
* **Missing Items Check:** Any unchecked accessory (e.g. Accsoon antenna, HDMI cable) is flagged for immediate client review.
* **Action:** Transitions booking to `Returned` stage. Iron Law: `RETURNED ≠ AVAILABLE`.

### 2.4 Job 4: `Reset & Inspect` (Execution at `Returned` Stage)
* **Goal:** Decontaminate, inspect, bench QC, and return gear to active rental rotation.
* **Bench QC Checklist:**
  - 12G-SDI Ground Loop Check.
  - Sensor sweep at f/22 against clean light box.
  - Flange depth and backfocus check on cine zooms.
* **Damage Finding Flow (`damage.ts`):**
  - Requires photographic upload and description $\ge 10$ characters.
  - Triggers deposit settlement dialog: applies damage deduction against security deposit (Law 5).
* **Action:** Transitions booking to `Closed` stage, returning assets to `AVAILABLE` stock.

---

## 3. Barcode Scanner Integration & Hardware Wedge Support

1. **USB / Bluetooth Laser Wedge Scanner:**
   - Listens to global window `keypress` buffer.
   - Detects burst scanner input (intervals $< 30\text{ms}$ between keystrokes).
   - On `Enter`, matches scanned barcode against the order's pending manifest.
2. **Audio-Visual Feedback:**
   - Match Success: Plays high-pitch chime (`880Hz`, 100ms), flashes green row highlight, increments scanned counter.
   - Match Error: Plays low error buzz (`220Hz`, 250ms), flashes red toast (e.g. *"Item not on this booking"*).
3. **WebRTC Camera Scanner Fallback:**
   - Uses device camera with `BarcodeDetector` API for tablet/mobile staff.

---

## 4. Digital Signature on Glass Component Specification

* **Canvas Dimensions:** `100%` width $\times$ `140px` height.
* **Resolution:** Scaled at `window.devicePixelRatio` ($2\times$ or $3\times$ retina) to prevent raster pixelation.
* **Curve Smoothing:** Implements cubic Bezier interpolation between pointer events for fluid, natural penmanship.
* **Storage:** Exported as compressed PNG / SVG and linked directly to the database `handover_signatures` table with UTC timestamp and client IP/device telemetry.
