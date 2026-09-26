# Enterprise Rental Intelligence System: Architecture, Metrics & Operations

*Synthesized from deep industry research (Rentman, Current-RMS, Booqable, AVIXA, ESTA, IATA, Nepal Department of Customs 2026–27 Tariff, and Babin Rentals empirical operations).*

---

## 1. THE 6 STRATEGIC ARCHITECTURE PRIORITIES

To scale Babin Rentals OS into an institutional-grade cinema equipment rental intelligence engine without fragile artificial complexity:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. §TEST BEFORE ADVANCED INTELLIGENCE                                   │
│    Tri-layer testing: Deterministic (pytest), Property-based            │
│    (Hypothesis), and LLM behavioral assertion (Promptfoo / Eval suite). │
├─────────────────────────────────────────────────────────────────────────┤
│ 2. §SERIAL AS THE COMMON DATA BACKBONE                                  │
│    Append-only `rental_event` ledger. Every serial unit has unique      │
│    provenance, run hours, maintenance log, and custody photo history.   │
├─────────────────────────────────────────────────────────────────────────┤
│ 3. RELIABILITY STATISTICS OVER PREMATURE ML                             │
│    Track rental cycles, operating hours, repeat-failure windows,        │
│    downtime days, and repair ratios before attempting neural ML.       │
├─────────────────────────────────────────────────────────────────────────┤
│ 4. INTERMITTENT DEMAND FORECASTING (§D)                                 │
│    Rental gear exhibits sporadic, zero-demand days. Use Croston,        │
│    TSB, and IMAPA (StatsForecast) before deep neural nets. Translate to │
│    operational risk bands (Low/Mod/High/Critical), not fractional gear. │
├─────────────────────────────────────────────────────────────────────────┤
│ 5. SEPARATE INTERNAL TRUTH FROM EXTERNAL MARKET OBSERVATIONS            │
│    Internal rules (rates, deposits, VAT, laws) are inviolable truth.    │
│    External observations (CineGrid, Hamrobazar, dealers) are dated,     │
│    probabilistic context that inform human owner rate revisions.        │
├─────────────────────────────────────────────────────────────────────────┤
│ 6. DEFENSIVE PRICING & ZERO-AMBIGUITY STACKING GATES                    │
│    Law 10: Standard <=10%, >10% requires reason >=10 chars + approver,  │
│    25% hard cap, zero role bypass. Linear multi-day default.             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. CANONICAL APPEND-ONLY EVENT LEDGER (`rental_event`)

Before forecasting or anomaly detection, all operational transitions are recorded in an append-only event log.

### Event Schema:
```json
{
  "event_id": "EVT-2026-XXXXX",
  "timestamp": "2026-10-15T09:30:00Z",
  "booking_id": "BK-2026-XXXX",
  "quote_id": "QT-2026-XXXX",
  "client_id": "CLI-XXXX",
  "product_id": "PRD-FX3",
  "asset_serial_id": "SN-FX3-002",
  "staff_id": "STF-PRAKASH",
  "event_type": "CHECKED",
  "from_status": "PACKED",
  "to_status": "CHECKED",
  "quantity": 1,
  "rate_npr": 4500,
  "discount_npr": 0,
  "revenue_npr": 4500,
  "cost_npr": 0,
  "location": "Boudha Hub",
  "source": "Babin Rentals OS Web",
  "metadata_json": {
    "photos": ["https://.../sn-fx3-002-front.jpg"],
    "notes": "Passed optical and sensor check"
  }
}
```

### Complete 21-Event Operational Lifecycle:
1. `QUOTE_CREATED`: Draft quote prepared.
2. `QUOTE_SENT`: Quote transmitted to client with explicit next action.
3. `QUOTE_VIEWED`: Client opened / reviewed quote.
4. `QUOTE_CHANGED`: Line items, discounts, or dates altered.
5. `QUOTE_ACCEPTED`: Client agreed to quote terms.
6. `QUOTE_LOST`: Quote expired, rejected, or lost to competitor (requires lost reason).
7. `DISCOUNT_OVERRIDDEN`: Discount >10% authorized with approver and rationale.
8. `RESERVED`: Mandatory advance received; inventory physically locked.
9. `PACKED`: Physical serial assigned and staged into serialized peli case.
10. `CHECKED`: Second-person QC check completed (mount, ports, count, cables).
11. `RELEASED`: Handover signed by client, balance/deposit cleared, gear departs.
12. `RETURNED_PHYSICAL`: Physical gear arrives back at hub (NOT yet ready).
13. `INSPECTION_STARTED`: Return QC technician begins optical/electrical evaluation.
14. `INSPECTION_FAILED`: Defect, damage, or missing accessory flagged.
15. `CLEANING_COMPLETED`: Sensor blown, glass cleaned, chassis wiped, cables recoiled.
16. `READY`: Gear certified back in bookable available stock.
17. `FAULT_REPORTED`: Field malfunction logged by client or caretaker.
18. `REPAIR_STARTED`: Unit quarantined and transferred to technician / authorized center.
19. `REPAIR_COMPLETED`: Functional QA passed; repair invoice logged.
20. `PART_REPLACED`: Specific spare part consumed from inventory.
21. `WRITTEN_OFF`: Irreparable / destroyed asset retired from fixed asset registry.

---

## 3. OPERATIONAL METRICS & FINANCIAL INTELLIGENCE FORMULAS

### Fleet & Utilization Formulas:
| Metric | Mathematical Formula | Operational Purpose | Target Benchmark |
|---|---|---|---|
| **Physical Utilization** | $\frac{\text{Rented Asset-Hours}}{\text{Bookable Asset-Hours}}$ | True asset commitment rate | 45%–65% healthy cinema tier |
| **Utilization Days** | $\frac{\text{Days on Rent}}{\text{Days Available}}$ | Macro fleet planning | 12–16 days/month |
| **Revenue Utilization** | $\frac{\text{Realized Pre-Tax Rental Revenue}}{\text{Theoretical Standard Rate Revenue}}$ | Detects hidden margin erosion from heavy discounting | $\ge 88\%$ |
| **Investment Recovery** | $\frac{\text{Cumulative Asset Contribution (Pre-tax Rev - Direct Maint/Sub)}}{\text{Actual Acquisition Cost}}$ | Measures capital payback progress | 40% in 10 Months (~4%/mo) |
| **Payback Remaining** | $\frac{\text{Remaining Unrecovered Investment}}{\text{Trailing 3-Month Avg Monthly Contribution}}$ | Evaluates asset lifecycle transition (Hold vs Sell) | $< 18\text{ months}$ to hurdle |
| **Maintenance Burden** | $\frac{\text{Repair Cost} + \text{Spare Parts} + \text{Downtime Lost Margin}}{\text{Asset Rental Revenue}}$ | Identifies "busy but unprofitable" toxic gear | $\le 12\%$ of revenue |
| **Lost-Demand Rate** | $\frac{\text{Qualified Unavailable Requests}}{\text{Total Qualified Inquiries}}$ | Clear primary signal to trigger additional unit purchases | $> 20\%$ triggers Buy Evaluation |

### Sales & Quote Intelligence Formulas:
| Metric | Mathematical Formula | Operational Purpose |
|---|---|---|
| **Quote Win Rate** | $\frac{\text{Quotes Won}}{\text{Valid Quotes Issued}}$ | Sales follow-up efficiency |
| **Quote Value Conversion** | $\frac{\text{Realized Quoted Revenue}}{\text{Total Quoted Pipeline}}$ | Prevents tiny wins from masking large lost cinema packages |
| **Conditional Attach Rate** | $\frac{\text{Bookings with Product } A \text{ and } B}{\text{Bookings with Product } A}$ | Direct upsell engine (e.g. FX3 $\rightarrow$ extra NP-FZ100 = 74%) |
| **Bundle Penetration** | $\frac{\text{Bookings using Established Bundle}}{\text{Eligible Multi-Item Bookings}}$ | Verifies if curated bundles reduce friction and staff prep |
| **Return-to-Ready Time** | $T_{\text{READY}} - T_{\text{RETURNED\_PHYSICAL}}$ | Warehouse velocity benchmark (target $< 120\text{ min}$ for camera kits) |
| **Repeat-Failure Rate** | $\frac{\text{Assets failing within 30 days of repair}}{\text{Total Repaired Assets}}$ | Audits external repair technician quality |

---

## 4. NEPAL PROCUREMENT & LANDED COST ENGINE

When evaluating fleet additions, NEVER compare foreign retail sticker prices directly. Babin Rentals must evaluate full **Landed Acquisition Cost** using the Nepal Department of Customs 2026–27 tariff schedule.

### Landed Cost Formula:
$$\text{Landed Cost (NPR)} = \text{CIF Value} + \text{Customs Duty} + \text{VAT} + \text{Local Charges} + \text{Risk Reserve}$$

Where:
- $\text{FOB Price (NPR)} = \text{Foreign Currency Price} \times \text{NRB Selling Rate} \times (1 + \text{FX Hedging 1.5\%})$
- $\text{International Freight} = \text{Courier / Air Freight (DHL/FedEx/Air Cargo)}$
- $\text{Transit Insurance} = 0.5\% \text{ to } 1.0\% \text{ of FOB}$
- $\text{Assessable CIF Value} = \text{FOB} + \text{Freight} + \text{Insurance}$
- $\text{Customs Duty} = \text{CIF Value} \times \text{HS Code Tariff Rate}$
- $\text{Taxable Base} = \text{CIF Value} + \text{Customs Duty}$
- $\text{VAT} = \text{Taxable Base} \times 13\%$
- $\text{Local Clearing \& Inland Transport} = \text{Customs agent clearance, airport handling, transit to Boudha hub}$
- $\text{Warranty Risk Reserve} = 5.0\% \text{ of FOB}$ (compensates for lack of international warranty coverage in Nepal)

### 2026–27 Nepal Customs Harmonized Tariff Reference:
| Equipment Category | HS Code | Customs Duty | VAT | Total Effective Import Factor |
|---|---|---|---|---|
| Digital Cinema Cameras (Body only) | `8525.89.00` | 15.0% | 13.0% | $\approx 1.30 \times \text{CIF}$ |
| Camera Lenses & Optics | `9002.11.00` | 10.0% | 13.0% | $\approx 1.24 \times \text{CIF}$ |
| Video Monitors & Recorders | `8528.52.00` | 15.0% | 13.0% | $\approx 1.30 \times \text{CIF}$ |
| LED Lighting Fixtures | `9405.42.00` | 15.0% | 13.0% | $\approx 1.30 \times \text{CIF}$ |
| Lithium-Ion Battery Packs | `8507.60.00` | 10.0% | 13.0% | $\approx 1.24 \times \text{CIF}$ |
| Camera Support, Gimbals & Rigs | `8479.89.90` | 10.0% | 13.0% | $\approx 1.24 \times \text{CIF}$ |

### Authorized Local Nepal Dealer Network:
1. **Sony Light & Sound (Pako / New Road, Kathmandu)**: Official Sony Pro distributor; warranty repairs, authorized sensor servicing, genuine NP-FZ100/CFexpress.
2. **Soheto Nepal (Teku, Kathmandu)**: Professional broadcast, lenses, tripods, wireless systems, studio rigging.
3. **DJI Authorized Store Nepal (Infinity Tower, Gongabu, Kathmandu)**: Ronin 4D, RS4 Pro, wireless transmitters, gimbal motors, genuine DJI spares.
4. **Aputure / Amaran Nepal Channel**: COB fixtures, Bowens mount modifiers, OEM ballast cables, spare fan assemblies.
5. **CineGrid / Hamrobazar Secondary Market**: Verified peer-to-peer benchmarking for used gear resale value.

---

## 5. REPAIR VS. REPLACEMENT THRESHOLD & SPARE PARTS HIERARCHY

Never dispatch gear with uninspected faults. Quarantined equipment must be evaluated against standard repair-to-replacement ratios:

### Repair Ratio Formula:
$$\text{Repair Ratio} = \frac{\text{Technician Quote} + \text{Parts} + \text{Intl Freight} + \text{Downtime Lost Margin}}{\text{Current Replacement Value in Nepal}}$$

### Action Thresholds:
| Defect Class | Provisional Repair Band (% of Replacement Value) | Standard Management Action |
|---|---|---|
| **Cables, caps, antennas, quick-release plates** | 1% – 10% | Replace immediately from in-house Tier A shelf stock |
| **Connector doors, battery latches, external screws** | 5% – 20% | Repair in-house or via local authorized technician |
| **Gimbal arm lock, motor calibration, focus motor** | 10% – 30% | Authorized DJI service; evaluate remaining unit economic life |
| **Lens mount deformation, mechanical play** | 10% – 35% | Authorized optical tech quote + collimation / MTF alignment |
| **Camera I/O board, HDMI port, USB-C PD circuit** | 15% – 40% | Service board replacement; review model history & downtime |
| **Major optical element scratch, cracked LED engine** | 25% – 60% | Case-by-case review; compare against buying new unit |
| **Mainboard catastrophic burn, cracked sensor** | 40% – 80%+ | **RETIRE / WRITE OFF**. Do not sink capital into high-risk repairs |
| **Swollen, physically cracked, or overheating Li-ion battery** | Replacement | **IMMEDIATE RETIREMENT**. Strictly prohibited from re-rental! |

### 3-Tier Spare Parts Strategy:
- **Tier A (In-Hub Shelf Stock, Boudha)**: High-wear consumables that cause preventable downtime:
  - Shielded 12G-SDI cables, high-speed HDMI cables, USB-C PD cables.
  - Standardized external wireless antennas (SMA/RP-SMA).
  - Quick-release Arca / Manfrotto / Ronin plates, 1/4"-20 and 3/8"-16 cage screws.
  - 15mm carbon fiber and aluminum rods, lens support brackets.
  - Dual NP-FZ100, NP-F, and V-mount chargers.
  - Spare CFexpress Type A/B and SD V90 media cards.
  - Light stand locking knobs, safety cables, C-47 clips, sandbag covers.
- **Tier B (Local Dealer Stock, 24–48h Lead Time)**:
  - Ronin BG30 battery grips, RS4 focus motors.
  - External monitor sunhoods, cage top handles, D-Tap splitter hubs.
  - Approved replacement cooling fans for lighting fixtures.
- **Tier C (Factory / Authorized International Service Only)**:
  - Digital camera motherboards and optical sensors.
  - Cine lens internal optical groups and aperture assemblies.
  - High-voltage power controllers for 600W+ COB fixtures.

---

## 6. DIAGNOSTIC REPAIR TREES

### Tree 1: RED Camera SDI Signal Failure
```
RED SDI Output Unresponsive
 │
 ├── [Physical Damage / Burnt Smell / Water Ingress?]
 │    ├── YES ──> IMMEDIATE HOLD ──> Level C RED Authorized Service
 │    └── NO
 │         │
 ├── [Power down camera and monitor completely]
 │    ├── Connect known-good shielded 12G-SDI cable BEFORE powering on monitor
 │    ├── Power camera first, wait for boot, then power monitor (Prevents ground-loop spike)
 │    └── Signal restored?
 │         ├── YES ──> Faulty field cable / improper ground sequence. Log Tier A replacement.
 │         └── NO
 │              │
 ├── [Check Project Resolution & SDI Output Format Setting]
 │    ├── Reset output frequency / format to 1080p 24fps / 25fps clean baseline
 │    └── Signal restored?
 │         ├── YES ──> Configuration mismatch resolved. Reset default profile.
 │         └── NO
 │              │
 ├── [Test secondary output chain / alternate monitor]
 │    └── Camera SDI output still completely dead?
 │         ├── YES ──> Level C SDI Driver IC blown. QUARANTINE CAMERA.
 │         └── NO  ──> External monitor / accessory port issue isolated.
```

### Tree 2: Image Sensor Contamination / Spot Finding
```
Dark Spot on Inspection Image
 │
 ├── [Test: Shoot uniform white wall at f/16 or f/22, ISO 100, defocussed]
 │    └── Spot clearly visible?
 │         ├── NO  ──> Dust is superficial or on front lens element. Clean lens with optical kit.
 │         └── YES
 │              │
 ├── [Rotate lens on body or switch to known-clean reference prime lens]
 │    └── Spot remains in exact same pixel location?
 │         ├── NO  ──> Particle is on lens rear element. Clean lens rear glass.
 │         └── YES ──> Particle is on camera sensor optical low-pass filter (OLPF).
 │              │
 ├── [Run Camera Internal Ultrasonic Cleaning Mode]
 │    └── Spot cleared?
 │         ├── YES ──> Complete. Log inspection clean pass.
 │         └── NO
 │              │
 ├── [Inverted Body Manual Blower Cycle]
 │    ├── Point camera mount downward in clean prep room.
 │    ├── Use filtered manual hand rocket blower (NO canned compressed gas!).
 │    └── Spot cleared?
 │         ├── YES ──> Complete. Log cleaning passed.
 │         └── NO  ──> Wet wipe or authorized technician clean required.
 │                      *If RED: Do NOT touch sensor. Send to authorized service.*
 │                      *If FX3: Certified technician optical swab only.*
```

### Tree 3: LED Cinema Fixture Thermal / Power Shutdown
```
Aputure / Amaran COB Fixture Shuts Down During Burn Test
 │
 ├── [Wet fixture, damaged mains cord, or burnt odor?]
 │    ├── YES ──> CUT POWER ──> QUARANTINE ──> Level C Service.
 │    └── NO
 │         │
 ├── [Test on dedicated 16A wall circuit with verified voltage (220V +/- 10V)]
 │    └── Unit stays powered on?
 │         ├── YES ──> Generator / location power drop issue. Advise client on power supply.
 │         └── NO
 │              │
 ├── [Inspect intake / exhaust fan vents for dust / lint blockage]
 │    ├── Clean ventilation grills with dry soft brush and low blower.
 │    ├── Allow fixture to cool for 20 minutes; test fan operation on boot.
 │    └── Fan spins freely and light runs stable at 100% for 30 minutes?
 │         ├── YES ──> Thermal trip resolved. Log maintenance clearance.
 │         └── NO  ──> Fan failure or ballast thermal sensor fault. Level B/C Service.
```

---

## 7. CHAIN OF CUSTODY (21-STEP PROTOCOL) & EVIDENCE REGIME

Babin Rentals enforces absolute physical and digital traceability:

```
PICK ──> SERIAL SCAN ──> FUNCTIONAL QC ──> ACCESSORY COUNT ──> CONDITION PHOTOS
  │
  ▼
PACKED IN SERIALIZED PELI ──> CASE SEAL / QR ──> CHECKER SIGN-OFF ──> BILLING CLEAR
  │
  ▼
RELEASE SCAN + CLIENT SIGNATURE ──> DISPATCH ON LOCATION
  │
  ▼
PHYSICAL RETURN SCAN ──> RETURN QC PHOTOS ──> ACCESSORY RECONCILIATION
  │
  ▼
FUNCTIONAL TEST ──> INSPECTION ──> SENSOR/OPTICAL CLEANING ──> READY FOR BOOKING
```

### Photo Evidence Mandatory Schema:
Photos must be saved in cloud storage indexed by:
`assets/{asset_serial_id}/{booking_id}/{event_type}/`

- **Camera / Lens Pre-Dispatch Photos**:
  1. Front element / sensor glass.
  2. Rear element / lens mount.
  3. Physical serial number plate.
  4. Top & side I/O ports.
  5. Power-on screen showing firmware and zero warning indicators.
  6. Open foam case layout showing all included cables/accessories.
- **Return Photos**:
  - Captured whenever any scratch, dent, missing cable, or malfunction is observed.

---

## 8. LITHIUM BATTERY AIR TRANSPORT COMPLIANCE (IATA 2026/2027)

Kathmandu dispatch to remote Nepal shoots (Pokhara, Lukla, Mustang) or international productions must strictly observe IATA Dangerous Goods Regulations:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LITHIUM BATTERY RATING               IATA FLIGHT COMPLIANCE RULE        │
├─────────────────────────────────────────────────────────────────────────┤
│ <= 100 Wh                            PERMITTED in Passenger Carry-On.   │
│ (e.g. SmallRig 99Wh, FX3 NP-FZ100)   Max 20 spares per passenger.       │
│                                      Terminals must be taped/isolated.  │
│                                      STRICTLY PROHIBITED in Checked!    │
├─────────────────────────────────────────────────────────────────────────┤
│ 101 Wh to 160 Wh                     AIRLINE OPERATOR APPROVAL REQUIRED.│
│ (e.g. 150Wh V-mount packs)           Max 2 spares per passenger.        │
│                                      Passenger Carry-On Only.           │
│                                      STRICTLY PROHIBITED in Checked!    │
├─────────────────────────────────────────────────────────────────────────┤
│ > 160 Wh                             PROHIBITED on Passenger Aircraft.  │
│ (e.g. 290Wh high-draw cinema packs)  Must ship via Cargo Aircraft under │
│                                      IATA DGR Class 9 UN3480 protocols. │
├─────────────────────────────────────────────────────────────────────────┤
│ Swollen / Damaged Packs              ABSOLUTE BAN. Cannot be transported │
│                                      by air under any circumstances.    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. QUOTE INTELLIGENCE & AUTOMATED RENT-VS-BUY ENGINE

### Automated Client Lead Score Formula:
$$\text{Lead Score} = w_1(\text{Rental Frequency}) + w_2(\text{Lifetime Spend}) + w_3(\text{Recent Spend}) + w_4(\text{Repeat Product Match}) - w_5(\text{Payment Risk})$$

### Rent vs. Buy Advisory Trigger:
When a repeat client rents the same camera or lens package $\ge 12\text{ times}$ or spends $\ge 60\%$ of the item's purchase price within a rolling 12-month period, RIS automatically generates a transparent Rent-vs-Buy breakdown:
- **Net Ownership Cost**: Landed Purchase Cost + Financing (12%) + Maintenance/Insurance (10%) - Expected 24-Mo Resale Value.
- **Expected Rental Cost**: Projected Shoot Days $\times$ Negotiated Daily Rate.
- **Advisory Recommendation**: "Over the past 10 months you have rented the Sony FX3 package 14 times, spending NPR 1,42,000. At your current trajectory, ownership may be cost-effective for the body, while continuing to rent specialty lenses and heavy lighting preserves your working capital."
