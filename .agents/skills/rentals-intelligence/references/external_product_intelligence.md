# External Product Intelligence Layer (B&H + OEM + Babin Rentals Integration)

*Integration of B&H professional equipment catalog, OEM engineering documentation, and Babin Rentals empirical operations.*

---

## 1. CORE PRINCIPLE

> **"External websites tell us what a product is.**
> **OEM documentation tells us what it officially supports.**
> **Babin's rental history tells us how it actually performs in our business.**
> **Babin's repair history tells us how it fails.**
> **Babin's cinematography knowledge tells us when it is useful.**
> **RIS combines all of this to decide how to rent, prepare, protect, maintain, price, bundle, buy, sell, and recommend it."**

---

## 2. SOURCE HIERARCHY & CONFIDENCE MODEL

Every equipment fact in RIS carries a source attribution and a confidence score:

| Provenance Tier | Authority Level | Representative Sources | Confidence Score | Role in System |
|---|---|---|---|---|
| **Tier 1: OEM Documentation** | Highest Authority | Sony, RED, DJI, Aputure, Tilta, NiSi, Blazar, SmallRig official manuals & service bulletins | **1.00** | Non-negotiable physical & electrical limits |
| **Tier 2: Babin Ground Truth** | Internal Fact | Physical serials, purchase invoices, repair logs, rental transaction history, Babin field tests | **0.95** | Inviolable operational truth |
| **Tier 3: Dealer & Market Data** | Market Context | B&H Photo Video specs, package contents, Nepal dealer price observations | **0.90** | Commercial benchmarking & procurement |
| **Tier 4: Professional Community** | Advisory Signals | Cinematography forums, CineD / Newsshooter lab tests, user reports | **0.40 – 0.80** | Creates `KNOWLEDGE_CANDIDATE`; cannot set hard safety rules without Tier 1 or 2 verification |

### Contradiction Resolution Protocol:
$$\text{OEM} > \text{Babin Physical Verification} > \text{Authorized Dealer (B\&H)} > \text{Community Evidence}$$
When sources disagree, RIS **never silently overwrites**. It logs:
```json
{
  "conflict_detected": true,
  "field": "maximum_payload_kg",
  "source_a": { "name": "DJI OEM Manual", "val": 4.5, "tier": 1 },
  "source_b": { "name": "Dealer Listing", "val": 5.0, "tier": 3 },
  "active_value": 4.5,
  "action": "OEM_AUTHORITATIVE_ENFORCED"
}
```

---

## 3. CANONICAL PRODUCT ID STANDARD

To eliminate ambiguity across body-only, kit variations, mounts, and generations:
$$\mathbf{BRPI\text{-}\{brand\}\text{-}\{model\}\text{-}\{variant\}}$$

**Canonical Examples:**
- `BRPI-SONY-FX3-BODY`: Sony FX3 Full-Frame Cinema Camera (Body only, E-mount)
- `BRPI-RED-KOMODOX-BODY`: RED Digital Cinema Komodo-X 6K (RF mount, CFexpress B)
- `BRPI-DJI-RONIN4D-6K`: DJI Ronin 4D 6K 4-Axis Cinema Camera Combo
- `BRPI-DJI-RS4PRO-COMBO`: DJI RS 4 Pro Gimbal Stabilizer Combo
- `BRPI-CHIOPT-EXTREME-PL`: CHIOPT Xtreme 28-85mm T3.2 Zoom (PL Mount)
- `BRPI-NISI-ATHENA-5LENS-PL`: NiSi Athena Prime 5-Lens Set (14/24/35/50/85mm PL)
- `BRPI-APUTURE-600X-PRO`: Aputure LS 600x Pro Bi-Color LED Fixture
- `BRPI-SMALLRIG-VB99-PRO`: SmallRig VB99 Pro Mini V-Mount Battery (99Wh)

*Strict Rule:* Never merge a body-only camera with a kit, or combine different mounts under one SKU.

---

## 4. TYPED KNOWLEDGE GRAPH EDGES

Equipment nodes in RIS are linked via 18 strictly typed relationship edges:

1. `REQUIRES`: Mandatory hardware dependency (e.g. `CHIOPT Zoom` $\xrightarrow{\text{REQUIRES}}$ `15mm Rods + Lens Support`).
2. `COMPATIBLE_WITH`: Verified operational pairing (e.g. `Sony FX3` $\xrightarrow{\text{COMPATIBLE\_WITH}}$ `Sigma 24-70mm f/2.8 DG DN II Art`).
3. `INCOMPATIBLE_WITH`: Prohibited combination (e.g. `Ronin 4D` $\xrightarrow{\text{INCOMPATIBLE\_WITH}}$ `DJI RS4 Pro`).
4. `POWERED_BY`: Approved electrical source (e.g. `RED Komodo-X` $\xrightarrow{\text{POWERED\_BY}}$ `V-Mount 14.8V`).
5. `MOUNTS_TO`: Physical mounting interface (e.g. `Sony FX3` $\xrightarrow{\text{MOUNTS\_TO}}$ `DJI RS4 Pro QR Plate`).
6. `ADAPTS_TO`: Conversion adapter path (e.g. `NiSi Athena PL` $\xrightarrow{\text{ADAPTS\_TO}}$ `Sony E-mount via PL-E Adapter`).
7. `RECORDS_TO`: Approved media recording medium (e.g. `RED Komodo-X` $\xrightarrow{\text{RECORDS\_TO}}$ `CFexpress Type B RED-Certified`).
8. `OUTPUTS_TO`: Signal transmission flow (e.g. `Sony FX3` $\xrightarrow{\text{OUTPUTS\_TO}}$ `Accsoon CineView M7 Pro via Full HDMI`).
9. `INPUTS_FROM`: Signal receiving interface (e.g. `Accsoon M7 Pro` $\xrightarrow{\text{INPUTS\_FROM}}$ `Full HDMI / 3G-SDI`).
10. `SUPPORTED_BY`: Mechanical weight-bearing support (e.g. `Heavy Zoom` $\xrightarrow{\text{SUPPORTED\_BY}}$ `Lens Support Bracket`).
11. `PROTECTED_BY`: Environmental or transport enclosure (e.g. `Sony FX3` $\xrightarrow{\text{PROTECTED\_BY}}$ `Nanuk 935 Hard Case`).
12. `PACKED_WITH`: Kit co-packing mandate (e.g. `Accsoon M7 Pro` $\xrightarrow{\text{PACKED\_WITH}}$ `4x Serialized Antennas + NP-F Plates`).
13. `REPLACED_BY`: Newer hardware revision (e.g. `DJI RS3 Pro` $\xrightarrow{\text{REPLACED\_BY}}$ `DJI RS4 Pro`).
14. `SUBSTITUTE_FOR`: Direct rental alternative (e.g. `Tamron 28-75mm G2` $\xrightarrow{\text{SUBSTITUTE\_FOR}}$ `Sigma 24-70mm Art`).
15. `UPGRADE_FROM`: Higher-tier cine progression (e.g. `Sony FX3` $\xrightarrow{\text{UPGRADE\_TO}}$ `RED Komodo-X`).
16. `UPGRADE_TO`: Upward cinematic tier.
17. `BUNDLED_WITH`: Curated production package pairing (e.g. `Sony FX3` $\xrightarrow{\text{BUNDLED\_WITH}}$ `FX3 Commercial Bundle`).
18. `FREQUENTLY_RENTED_WITH`: Empirical co-occurrence pairing (e.g. `Sony FX3` $\xrightarrow{\text{FREQUENTLY\_RENTED\_WITH}}$ `SmallRig 99Wh V-Mount`).

---

## 5. EQUIPMENT CARE & 3-LEVEL DIAGNOSTIC HIERARCHY

Equipment issues in RIS are triaged using a strict 3-tier diagnostic ladder:

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL A: STAFF SAFE (In-Hub Prep & QC)                                │
│ Allowed without engineering authorization:                             │
│ - Inspect & swap field cable with known-good studio reference          │
│ - Swap battery / V-mount pack with fully charged known-good unit       │
│ - Swap media card with certified known-good card and test recording    │
│ - Reboot camera / fixture and restore factory profile baseline         │
│ - Inspect physical connector seating and cable strain relief           │
│ - Check external antenna count, tightness, and orientation             │
│ -> Outcome: Defect resolved OR escalated to Level B/C                  │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL B: TRAINED TECHNICIAN (Item placed on HOLD)                     │
│ Specialized internal maintenance:                                      │
│ - Optical collimation and mount flange focal distance alignment        │
│ - Connector pin retention measurement and ground continuity testing    │
│ - Ultrasonic sensor swab cleaning with certified optical fluid         │
│ - Quick-release lever and tripod foot hardware replacement             │
│ - Gimbal advanced IMU 6-axis calibration and motor stiffness tuning    │
│ -> Outcome: Return to READY with maintenance log OR escalate to Level C│
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL C: STOP USE — HARD QUARANTINE (Factory Service Escalation)      │
│ MANDATORY IMMEDIATE SHUTDOWN & QUARANTINE:                             │
│ - Liquid intrusion, water immersion, or optical condensation           │
│ - Burnt odor, smoke, or blown semiconductor component                  │
│ - Lithium-ion battery swelling, bulging, leaking, or shell puncture   │
│ - Intermittent power short circuit or ground loop fault                │
│ - Structural crack in cast alloy, carbon fiber arm, or lens mount      │
│ - Blown RED SDI driver IC (from ungrounded field cabling)              │
│ -> Outcome: Factory service invoice OR complete asset write-down       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. EXPANDED RIS FUNCTION CONTRACTS

RIS provides 19 standardized function contracts accessible via code and CLI:

```python
# Product & Market Intelligence
get_product_intelligence(product_id: str) -> Dict
get_external_market_price(product_id: str) -> Dict
estimate_landed_cost(product_id: str, destination: str = "Nepal") -> Dict

# Compatibility & Dependencies
get_compatibility(product_a: str, product_b: str) -> Dict
get_required_dependencies(product_id: str) -> List[Dict]
get_substitutes(product_id: str) -> List[Dict]
get_upgrade_path(product_id: str) -> Dict

# Care, Inspection & Diagnostics
get_product_care_profile(category: str) -> Dict
get_dispatch_checks(product_id: str) -> List[str]
get_return_checks(product_id: str) -> List[str]
get_failure_modes(product_id: str) -> List[Dict]
diagnose_issue(product_id: str, symptoms: List[str]) -> Dict

# Fleet Economics, Procurement & Sales
evaluate_purchase(product_id: str) -> Dict
calculate_attach_rate(product_a: str, product_b: str) -> float
find_sales_opportunities(client_id: str) -> List[Dict]
find_bundle_candidates() -> List[Dict]
find_lost_demand() -> Dict
recommend_physical_asset(product_id: str, rental_dates: Tuple[str, str]) -> Dict
validate_product_knowledge(product_id: str) -> Dict
```
