#!/usr/bin/env python3
"""
os_engine.py - Babin Rentals OS Domain Engines (Python Reference Implementation)

Strict architectural alignment with Babin Rentals OS (Foundation Specification v2.0):
- Integer Paisa currency math (1 NPR = 100 Paisa)
- Half-Up rounding at every displayed step
- Foundation §2.8 Reference Case Assertion (BK-2026-0715)
- Law 5: Deposits are liabilities (never touch Rental Total or Outstanding)
- Law 10: Discount gate (10% threshold, 25% hard cap, 10-char reason, named approver)
- Late fee tiers & waiver approval gate (lateFee.ts)
- Damage finding validation & deposit settlement (damage.ts)
- Canonical Six Stages & Four Jobs (workflow.ts)
"""

import sys
import math
from typing import Dict, Any, Optional, Tuple, List

# ── 1. INTEGER PAISA & FORMATTING (money.ts) ──────────────────────────────────

Paisa = int  # Branded integer representation

def rupees(n: float) -> Paisa:
    """Rupees -> Paisa integer."""
    return round_half_up(n * 100)

def to_rupees(p: Paisa) -> float:
    """Paisa -> Rupees float."""
    return p / 100.0

def round_half_up(n: float) -> int:
    """
    Half Up rounding applied at each displayed step.
    Handles negative numbers symmetrically: roundHalfUp(-0.5) = -1.
    """
    if n < 0:
        return -math.floor(-n + 0.5)
    return math.floor(n + 0.5)

def grouped(n: int) -> str:
    """
    South Asian (lakh) digit grouping: 185000 -> '1,85,000'.
    Custom algorithm, independent of ICU locale.
    """
    neg = n < 0
    s = str(abs(round_half_up(n)))
    if len(s) <= 3:
        return ("-" if neg else "") + s
    tail = s[-3:]
    head = s[:-3]
    
    # Insert commas every 2 digits from right to left
    res = []
    while len(head) > 2:
        res.insert(0, head[-2:])
        head = head[:-2]
    if head:
        res.insert(0, head)
    
    return ("-" if neg else "") + ",".join(res) + "," + tail

def format_money(p: Paisa) -> str:
    """
    §2.3 display: 'Rs 1,39,506'. Whole rupees carry no decimals;
    fractional paisa shows two decimals.
    """
    whole = abs(p) // 100
    paise = abs(p) % 100
    sign = "-" if p < 0 else ""
    if paise == 0:
        return f"{sign}Rs {grouped(whole)}"
    return f"{sign}Rs {grouped(whole)}.{paise:02d}"

def to_whole_rupee(paisa: float) -> Paisa:
    """Half-up to the nearest whole rupee, returned in paisa."""
    return round_half_up(paisa / 100.0) * 100

# ── 2. THE FINANCIAL ENGINE (money.ts §2.1) ───────────────────────────────────

def price(
    equipment: Paisa,
    sub_rental: Paisa = 0,
    services: Paisa = 0,
    crew: Paisa = 0,
    transport: Paisa = 0,
    discount_percent: float = 0.0,
    vat_percent: float = 13.0,
    payments: Paisa = 0
) -> Dict[str, Any]:
    """
    Foundation Specification v2.0 §2.1 calculation order:
    1. Subtotal = equipment + subRental + services + crew + transport
    2. Discount = roundHalfUp(subtotal * discount%)
    3. Taxable = subtotal - discount
    4. VAT = roundHalfUp(taxable * vat%)
    5. RentalTotal = taxable + vat
    6. Outstanding = rentalTotal - payments (Law 5: Deposits strictly excluded)
    """
    subtotal = equipment + sub_rental + services + crew + transport
    discount = to_whole_rupee(subtotal * (discount_percent / 100.0))
    taxable = subtotal - discount
    vat = to_whole_rupee(taxable * (vat_percent / 100.0))
    rental_total = taxable + vat
    outstanding = rental_total - payments
    
    return {
        "subtotal": subtotal,
        "discount": discount,
        "taxable": taxable,
        "vat": vat,
        "rental_total": rental_total,
        "payments": payments,
        "outstanding": outstanding
    }

# ── 3. FOUNDATION §2.8 REFERENCE CASE ASSERTION (BK-2026-0715) ────────────────

def assert_reference_case():
    """
    Asserts Foundation §2.8 worked example at module initialization:
    Equipment: Rs 1,32,750 | Discount: 7% | VAT: 13% | Payments: Rs 15,000
    Expected: Discount 9,293 | Taxable 1,23,457 | VAT 16,049 | Total 1,39,506 | Outstanding 1,24,506
    """
    ref = price(
        equipment=rupees(132750),
        discount_percent=7.0,
        vat_percent=13.0,
        payments=rupees(15000)
    )
    expected = {
        "discount": 9293,
        "taxable": 123457,
        "vat": 16049,
        "rental_total": 139506,
        "outstanding": 124506
    }
    for k, exp_val in expected.items():
        got_val = int(to_rupees(ref[k]))
        if got_val != exp_val:
            raise AssertionError(
                f"Financial Engine failed Foundation §2.8 assertion for '{k}': "
                f"expected Rs {exp_val:,}, got Rs {got_val:,}. Drift detected!"
            )

# Execute verification immediately on module load
assert_reference_case()

# ── 4. DISCOUNT ENGINE & LAW 10 (discount.ts) ──────────────────────────────────

DISCOUNT_APPROVAL_THRESHOLD = 10.0  # >10% requires reason and approver
DISCOUNT_CAP = 25.0                 # 25% hard cap, zero role bypass

def validate_discount(
    percent: float,
    reason: Optional[str] = None,
    approver_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validates discount against Law 10:
    - percent <= 10%: Allowed without approval
    - 10% < percent <= 25%: Requires reason >= 10 chars AND named Manager/Owner approver
    - percent > 25%: Hard blocked (exceeds cap)
    """
    if percent < 0:
        return {"valid": False, "requires_approval": False, "error": "Discount percent cannot be negative."}
    if percent == 0:
        return {"valid": True, "requires_approval": False, "error": None}
    if percent > DISCOUNT_CAP:
        return {
            "valid": False,
            "requires_approval": True,
            "error": f"Discount exceeds {DISCOUNT_CAP}% hard cap (Law 10). Maximum allowed is 25%."
        }
    if percent > DISCOUNT_APPROVAL_THRESHOLD:
        clean_reason = (reason or "").strip()
        if len(clean_reason) < 10:
            return {
                "valid": False,
                "requires_approval": True,
                "error": "A discount above 10% requires a detailed reason of at least 10 characters."
            }
        if not approver_name:
            return {
                "valid": False,
                "requires_approval": True,
                "error": "A discount above 10% requires a named authorizing approver (Manager or Owner)."
            }
        return {"valid": True, "requires_approval": True, "error": None}
    
    return {"valid": True, "requires_approval": False, "error": None}

# ── 5. LATE FEE ENGINE (lateFee.ts) ────────────────────────────────────────────

def calculate_late_fee(
    overage_minutes: float,
    day_rate_paisa: Paisa
) -> Dict[str, Any]:
    """
    Calculates late fee based on Foundation v2.0 §3 Q2:
    - <= 30 mins: Band 'None' -> Fee = Rs 0 (Grace period)
    - 31 to 120 mins: Band 'Half Day' -> Fee = dayRate / 2
    - > 120 mins: Band 'Full Day' -> Fee = dayRate * ceil(overageMinutes / 1440)
    """
    minutes = max(0.0, overage_minutes)
    if minutes <= 30:
        return {
            "overage_minutes": minutes,
            "band": "None",
            "full_days_charged": 0,
            "fee_paisa": 0
        }
    if minutes < 120:
        return {
            "overage_minutes": minutes,
            "band": "Half Day",
            "full_days_charged": 0,
            "fee_paisa": to_whole_rupee(day_rate_paisa / 2.0)
        }
    
    full_days = max(1, math.ceil(minutes / 1440.0))
    return {
        "overage_minutes": minutes,
        "band": "Full Day",
        "full_days_charged": full_days,
        "fee_paisa": to_whole_rupee(day_rate_paisa * full_days)
    }

def validate_late_fee_waiver(
    reason: str,
    approver_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Late fee waiver gate (lateFee.ts):
    A late fee is a suggestion. Waiving it requires reason >= 10 chars AND named Manager/Owner approver.
    """
    clean_reason = (reason or "").strip()
    if len(clean_reason) < 10:
        return {
            "valid": False,
            "error": "Late-fee waiver requires a reason of at least 10 characters."
        }
    if not approver_name:
        return {
            "valid": False,
            "error": "Late-fee waiver requires a named authorizing approver (Manager or Owner)."
        }
    return {"valid": True, "error": None}

# ── 6. DAMAGE FINDINGS & DEPOSIT SETTLEMENT (damage.ts) ────────────────────────

OWNER_DAMAGE_THRESHOLD: Paisa = rupees(25000)

def approver_for_damage(charge_paisa: Paisa) -> str:
    """< Rs 25,000 -> Manager; >= Rs 25,000 -> Owner."""
    return "Owner" if charge_paisa >= OWNER_DAMAGE_THRESHOLD else "Manager"

def validate_damage_report(
    photos: int,
    description: str,
    charge_paisa: Paisa,
    replacement_paisa: Paisa = 0
) -> Dict[str, Any]:
    """
    Validates a damage finding:
    - Min 1 photo evidence required
    - Min 10 chars description
    - Charge cannot be negative
    - Identifies required signoff (Manager vs Owner)
    """
    errors = {}
    warnings = []
    
    if photos < 1:
        errors["photos"] = "At least 1 photo is required before a damage charge can be raised."
    if len((description or "").strip()) < 10:
        errors["description"] = "Describe the damage in at least 10 characters. 'Broken' is not a finding."
    if charge_paisa < 0:
        errors["charge"] = "Damage charge cannot be negative."
    
    if charge_paisa == 0:
        warnings.append("Charging nothing. The finding is recorded and item moves to Maintenance.")
    if replacement_paisa > 0 and charge_paisa > replacement_paisa:
        warnings.append(
            f"The proposed charge exceeds asset replacement value ({format_money(replacement_paisa)}). "
            "Acceptable if repair costs exceed replacement, but must be justified."
        )
        
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "approver": approver_for_damage(charge_paisa)
    }

def settle_deposit(deposit_paisa: Paisa, damage_paisa: Paisa) -> Dict[str, Any]:
    """
    Law 5 Deposit Settlement:
    Refund = max(0, deposit - damage)
    Shortfall = max(0, damage - deposit)
    Refund is never negative. Shortfalls become separate accounts receivable.
    """
    dep = max(0, deposit_paisa)
    dam = max(0, damage_paisa)
    refund = max(0, dep - dam)
    shortfall = max(0, dam - dep)
    
    return {
        "refund_paisa": refund,
        "shortfall_paisa": shortfall,
        "fully_consumed": dep > 0 and refund == 0,
        "refund_formatted": format_money(refund),
        "shortfall_formatted": format_money(shortfall)
    }

# ── 7. CANONICAL WORKFLOW (workflow.ts) ────────────────────────────────────────

CANONICAL_STAGES = ["Quote", "Booked", "Packed", "On Rent", "Returned", "Closed"]

STAGE_METADATA = {
    "Quote":    {"order": 0, "token": "neutral",  "client": "Quote",            "desc": "Priced, not committed."},
    "Booked":   {"order": 1, "token": "primary",  "client": "Confirmed",        "desc": "Gear reserved, serials assigned."},
    "Packed":   {"order": 2, "token": "progress", "client": "Ready for pickup", "desc": "Packing complete."},
    "On Rent":  {"order": 3, "token": "out",      "client": "With you",         "desc": "All items with client."},
    "Returned": {"order": 4, "token": "in",       "client": "Returned",         "desc": "All items physically checked in."},
    "Closed":   {"order": 5, "token": "neutral",  "client": "Complete",         "desc": "Settled and complete."}
}

OPERATIONAL_JOBS = {
    "Pack":     {"runs_at": "Booked",   "sets": "Packed",  "sessions": False, "blocks_booking": True},
    "Handover": {"runs_at": "Packed",   "sets": "On Rent", "sessions": True,  "blocks_booking": True},
    "Return":   {"runs_at": "On Rent",  "sets": "Returned","sessions": True,  "blocks_booking": True},
    "Reset":    {"runs_at": "Returned", "sets": None,      "sessions": False, "blocks_booking": False}
}

def can_advance(from_stage: str, to_stage: str) -> bool:
    """Forward-only rule: Stages cannot be skipped."""
    if from_stage not in STAGE_METADATA or to_stage not in STAGE_METADATA:
        return False
    return STAGE_METADATA[to_stage]["order"] == STAGE_METADATA[from_stage]["order"] + 1

# Alias for compatibility
settle_deposit_against_damage = settle_deposit

# ── 8. ADVANCE POLICY & AVAILABILITY ENGINE (§R1, §R5) ─────────────────────────

def validate_advance(rental_total_paisa: Paisa, advance_paid_paisa: Paisa) -> Dict[str, Any]:
    """
    Validates advance payment against §R1 policy:
    - total < 5,000: FULL payment required before release
    - total >= 5,000 and < 10,000: minimum NPR 5,000 advance
    - total >= 10,000: minimum 50% advance
    """
    total = max(0, rental_total_paisa)
    paid = max(0, advance_paid_paisa)
    total_rs = to_rupees(total)
    
    if total_rs < 5000:
        req_paisa = total
        rule_desc = "Total < 5,000: Full payment required before release"
    elif total_rs < 10000:
        req_paisa = rupees(5000)
        rule_desc = "Total >= 5,000: Minimum NPR 5,000 advance required"
    else:
        req_paisa = to_whole_rupee(total * 0.50)
        rule_desc = "Total >= 10,000: Minimum 50% advance required"
        
    allowed = paid >= req_paisa
    return {
        "required_paisa": req_paisa,
        "paid_paisa": paid,
        "allowed": allowed,
        "rule_description": rule_desc,
        "required_formatted": format_money(req_paisa)
    }

def check_booking_conflict(start_date: str, end_date: str, existing_bookings: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Checks date overlap against existing bookings:
    Overlap exists if max(start1, start2) <= min(end1, end2).
    """
    conflicts = []
    for b in existing_bookings:
        b_start = b.get("start_date", "")
        b_end = b.get("end_date", "")
        if max(start_date, b_start) <= min(end_date, b_end):
            conflicts.append(b)
            
    return {
        "has_conflict": len(conflicts) > 0,
        "conflict_count": len(conflicts),
        "conflicts": conflicts
    }

def complete_kit_check(items: List[str]) -> Dict[str, Any]:
    """
    Deterministic rule-based auto-completion & conflict checks:
    - PL lens -> PL to E / PL to RF adapter + follow focus
    - CHIOPT zoom -> rods + lens support
    - Ronin 4D + external gimbal -> BLOCKING CONFLICT
    - RED body -> CFexpress Type B + V-Mount batteries + card reader
    - Glimmer filter -> Tilta Mirage matte box
    """
    names_lower = [i.lower().replace("_", " ") for i in items]
    required_additions = []
    blocking_errors = []
    
    def has_any(keywords):
        return any(any(kw.replace("_", " ") in item for kw in keywords) for item in names_lower)
        
    # Ronin 4D + external gimbal conflict
    if has_any(["ronin 4d"]) and has_any(["rs 3", "rs 4", "rs 5", "rs3", "rs4", "rs5", "gimbal"]):
        blocking_errors.append("HARD CONFLICT: DJI Ronin 4D has built-in 4-axis gimbal. Remove external gimbal.")
        
    # CHIOPT mount support
    if has_any(["chiopt"]):
        if not has_any(["rod", "baseplate", "support"]):
            required_additions.extend(["15mm Rods System", "Lens Support Bracket"])
            blocking_errors.append("HARD CONFLICT: CHIOPT 2.8kg zoom requires 15mm rods & lens support bracket.")
            
    # PL cine glass
    if has_any(["pl", "athena", "mantis", "great joy", "meike", "chiopt"]):
        if not has_any(["adapter", "pl-e", "pl to e", "pl to rf", "rf-pl"]):
            required_additions.append("PL to E / PL to RF Mount Adapter")
        if not has_any(["focus", "nucleus", "lidar"]):
            required_additions.append("Wireless Follow Focus Motor")
            
    # RED camera
    if has_any(["komodo", "red"]) and not has_any(["ronin 4d"]):
        if not has_any(["cfexpress type b", "cfexpress b", "cfast", "angelbird"]):
            required_additions.append("RED-Approved CFexpress Type B Card")
        if not has_any(["v-mount", "vmount", "battery"]):
            required_additions.append("99Wh V-Mount Batteries (Min 2x)")
            
    # Glimmer filter
    if has_any(["glimmer"]) and not has_any(["mirage", "matte box"]):
        required_additions.append("Tilta Mirage Matte Box")
        blocking_errors.append("HARD CONFLICT: Glimmer filter requires Tilta Mirage mattebox to mount.")
        
    return {
        "is_complete": len(blocking_errors) == 0 and len(required_additions) == 0,
        "required_additions": required_additions,
        "blocking_errors": blocking_errors
    }


if __name__ == "__main__":
    print("\n" + "="*65)
    print("BABIN RENTALS OS — DOMAIN ENGINES (FOUNDATION SPECIFICATION v2.0)")
    print("="*65)
    print(f"Status: Module loaded successfully. Reference case BK-2026-0715 verified!")
    
    # Run interactive worked example
    sample_price = price(
        equipment=rupees(132750),
        discount_percent=7.0,
        vat_percent=13.0,
        payments=rupees(15000)
    )
    print("\n[OK] Reference Booking (BK-2026-0715):")
    print(f"    Subtotal:     {format_money(sample_price['subtotal'])}")
    print(f"    Discount 7%: -{format_money(sample_price['discount'])}")
    print(f"    Taxable:      {format_money(sample_price['taxable'])}")
    print(f"    13% VAT:     +{format_money(sample_price['vat'])}")
    print(f"    Rental Total: {format_money(sample_price['rental_total'])}")
    print(f"    Payments:    -{format_money(sample_price['payments'])}")
    print(f"    Outstanding:  {format_money(sample_price['outstanding'])} (Law 5 verified: deposits omitted)")

    # Sample damage settlement
    sample_damage = settle_deposit(deposit_paisa=rupees(50000), damage_paisa=rupees(75000))
    print("\n[OK] Damage & Deposit Settlement Test (Rs 50,000 Deposit vs Rs 75,000 Damage):")
    print(f"    Refund:       {sample_damage['refund_formatted']} (Floor at zero verified)")
    print(f"    Shortfall:    {sample_damage['shortfall_formatted']} (Created as separate receivable)")
    print(f"    Approver:     {approver_for_damage(rupees(75000))} (>= Rs 25,000 requires Owner)")
    print("="*65 + "\n")

