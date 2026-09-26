#!/usr/bin/env python3
"""
validate_booking.py - Babin Rentals Rental Intelligence System (RIS) Validation Engine

Deterministic Layer 1 validation script for bookings, equipment compatibility,
payload safety, power budget, media requirements, and financial quote calculations.

Strictly aligned with Babin Rentals OS (Foundation Specification v2.0):
- Integer Paisa arithmetic & Foundation §2.8 reference case assertion
- Law 5: Deposits are liabilities (never touch Rental Total or Outstanding)
- Law 10: Discount gate (10% threshold, 25% cap, 10-char reason, named approver)
- Canonical Six Stages & Four Jobs

Usage:
    python validate_booking.py --items "Sony FX3A" "Tamron 70-180" --days 3
    python validate_booking.py --json-file booking.json
"""

import sys
import os
import json
import argparse
from pathlib import Path

# Add current script directory to path so os_engine imports cleanly
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from os_engine import (
    Paisa, rupees, to_rupees, round_half_up, grouped, format_money, price, validate_discount,
    calculate_late_fee, validate_late_fee_waiver, validate_damage_report,
    settle_deposit, CANONICAL_STAGES, STAGE_METADATA, OPERATIONAL_JOBS
)

SKILL_DIR = SCRIPT_DIR.parent
DATA_DIR = SKILL_DIR / "data"

def load_json(filename):
    p = DATA_DIR / filename
    if p.exists():
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

PRODUCT_SPECS = load_json("product_specs.json")
COMPATIBILITY = load_json("compatibility_graph.json")
PAYLOAD_MATRIX = load_json("payload_matrix.json")
POWER_MATRIX = load_json("power_matrix.json")
MEDIA_MATRIX = load_json("media_matrix.json")
REPLACEMENT_VALUES = load_json("replacement_values.json")
OS_LAWS = load_json("os_laws.json")

# Verified hard deposits from Babin Rentals codebase
FLAT_RATE_DEPOSITS = {
    "komodo-x": 150000,
    "komodo": 150000,
    "blazar mantis": 75000,
    "mantis": 75000,
    "great joy": 75000,
    "chiopt": 50000,
    "ronin 4d": 100000,
}

# Standard rate lookup fallback (NPR per day)
STANDARD_RATES = {
    "fx3": 3500,
    "fx3a": 3500,
    "komodo": 8000,
    "komodo-x": 10000,
    "ronin 4d": 10000,
    "a7s iii": 3000,
    "a7 iv": 2500,
    "a7v": 2500,
    "chiopt": 6000,
    "blazar mantis": 5000,
    "great joy": 4500,
    "nisi athena": 4000,
    "sigma 24-70": 1500,
    "tamron 70-180": 1200,
    "sony 70-200": 2000,
    "dji rs 4 pro": 2500,
    "dji rs 3 pro": 2000,
    "dji rs 3": 1500,
    "accsoon m7": 2000,
    "accsoon cineview": 1200,
    "amaran 300c": 2200,
    "amaran 200d": 1500,
    "aputure 600x": 4500,
    "aputure 400x": 3500,
    "99whr v-mount": 600,
    "dji mic": 800,
    "dji mic mini": 700,
    "tripod": 800,
    "studio assist": 1500,
}

def estimate_item_rate(item_name):
    low = item_name.lower()
    for k, v in STANDARD_RATES.items():
        if k in low:
            return v
    return 1000

def validate_booking(items, days=1, client_flag=None, standing_discount_pct=0,
                     is_woman_dop=False, has_valid_id=False, has_letter=False,
                     discount_reason=None, approver_name=None,
                     shoot_type=None, shoot_hours=8):
    errors = []
    warnings = []
    required_additions = []
    
    names_lower = [i.lower() for i in items]
    
    def has_any(keywords):
        return any(any(kw in n for kw in keywords) for n in names_lower)

    # 1. HARD CONFLICT REJECTIONS (§24)
    has_ronin_4d = has_any(["ronin 4d"])
    has_ext_gimbal = has_any(["rs 3", "rs 4", "rs 5", "rs3", "rs4", "rs5", "gimbal"])
    if has_ronin_4d and has_ext_gimbal:
        errors.append("HARD CONFLICT (§24): DJI Ronin 4D contains an integrated 4-axis gimbal. External gimbal MUST be removed.")

    has_chiopt = has_any(["chiopt"])
    has_rods = has_any(["rod", "baseplate", "support"])
    if has_chiopt and not has_rods:
        errors.append("HARD CONFLICT (§24): CHIOPT cine zoom (2.8kg) requires 15mm rods and lens support to prevent camera mount destruction.")
        required_additions.append("15mm Rods & Lens Support Bracket")

    has_glimmer = has_any(["glimmer", "diffusion filter"])
    has_matte_box = has_any(["mirage", "matte box"])
    if has_glimmer and not has_matte_box:
        errors.append("HARD CONFLICT (§24): Glimmer glass filter requires Tilta Mirage matte box to mount.")
        required_additions.append("Tilta Mirage Matte Box")

    has_red = has_any(["komodo", "red"])
    if has_red and not has_ronin_4d:
        has_red_media = has_any(["cfexpress type b", "cfexpress b", "cfast", "angelbird"])
        if not has_red_media:
            errors.append("HARD CONFLICT (§24): RED Komodo / Komodo-X requires RED-approved CFexpress Type B media.")
            required_additions.append("RED-Approved CFexpress Type B Card (512GB/1TB)")
        has_reader = has_any(["reader"])
        if not has_reader:
            errors.append("MISSING ACCESSORY (§R4): RED camera requires a high-speed card reader.")
            required_additions.append("CFexpress Type B Card Reader")
        has_vmount = has_any(["v-mount", "vmount", "battery"])
        if not has_vmount:
            errors.append("POWER REQUIREMENT (§R4): RED camera requires V-Mount power solution.")
            required_additions.append("99Whr / 150Whr V-Mount Batteries (Min 2x)")

    # 2. PL LENS ACCESSORY VALIDATION
    has_pl_lens = has_any(["nisi athena", "meike", "great joy", "blazar", "mantis", "chiopt", "simera"])
    if has_pl_lens:
        if not has_any(["nucleus", "focus", "lidar"]):
            warnings.append("RECOMMENDATION: Manual PL cine lenses require a follow focus (Nucleus-M II / Nano II / DJI Focus Pro).")
            required_additions.append("Wireless Follow Focus Motor")
        if not has_any(["monitor", "m7", "desview", "feelworld"]):
            warnings.append("RECOMMENDATION: Cinema lenses benefit from an external monitor for critical focus check.")
        if not has_any(["adapter", "pl-e", "pl to e", "pl to rf", "rf-pl"]):
            warnings.append("MOUNT ADAPTER CHECK: Ensure lens mount adapter (PL->E or PL->RF) matches the camera body.")
            required_additions.append("PL to E / PL to RF Mount Adapter")

    # 3. LIGHTING SUPPORT
    has_lights = has_any(["amaran", "aputure", "600x", "300c", "200d", "light"])
    if has_lights and not has_any(["c-stand", "stand", "c stand"]):
        warnings.append("SAFETY NOTICE (§R4): Studio lights require heavy-duty C-stands and sandbags.")
        required_additions.append("C-Stand with Sandbag")

    # 4. PAYLOAD & RIG WEIGHT CALCULATION
    total_camera_weight_kg = 0.0
    for item in items:
        low = item.lower()
        if "fx3" in low: total_camera_weight_kg += 0.915
        elif "komodo-x" in low: total_camera_weight_kg += 1.19
        elif "komodo" in low: total_camera_weight_kg += 1.0
        elif "ronin 4d" in low: total_camera_weight_kg += 4.67
        elif "a7s" in low or "a7" in low: total_camera_weight_kg += 0.658
        elif "chiopt" in low: total_camera_weight_kg += 2.80
        elif "blazar" in low or "mantis" in low: total_camera_weight_kg += 1.10
        elif "nisi" in low: total_camera_weight_kg += 0.88
        elif "v-mount" in low: total_camera_weight_kg += 0.65
        elif "monitor" in low or "m7" in low: total_camera_weight_kg += 0.55
        elif "matte box" in low: total_camera_weight_kg += 0.35

    # Check against gimbal if present
    if has_ext_gimbal and not has_ronin_4d:
        gimbal_limit = 4.5 if has_any(["rs 4 pro", "rs 3 pro"]) else 3.0
        if total_camera_weight_kg > gimbal_limit:
            errors.append(f"GIMBAL PAYLOAD OVERLOAD: Rig weight ({total_camera_weight_kg:.2f}kg) exceeds gimbal capacity ({gimbal_limit}kg).")
        elif total_camera_weight_kg > gimbal_limit * 0.85:
            warnings.append(f"GIMBAL PAYLOAD WARNING: Rig weight ({total_camera_weight_kg:.2f}kg) is within 15% of gimbal limit ({gimbal_limit}kg). Micro-jitter may occur.")

    # 5. FINANCIAL QUOTE ENGINE (Powered by os_engine)
    daily_subtotal_rs = sum(estimate_item_rate(i) for i in items)
    
    # Multi-day rate logic: Day 1-4 standard, Day 5+ gets 10% discount on incremental days
    if days >= 5:
        base_days_cost = daily_subtotal_rs * 4
        extra_days = days - 4
        extra_days_cost = (daily_subtotal_rs * 0.90) * extra_days
        total_subtotal_rs = base_days_cost + extra_days_cost
        multi_day_discount_rs = (daily_subtotal_rs * 0.10) * extra_days
    else:
        total_subtotal_rs = daily_subtotal_rs * days
        multi_day_discount_rs = 0

    # Discount application & Law 10 Validation
    applied_discount_pct = 0.0
    discount_source = "None"
    
    if standing_discount_pct > 0:
        applied_discount_pct = float(standing_discount_pct)
        discount_source = f"Standing Client Discount ({standing_discount_pct}%)"
    elif client_flag == "college_project" and has_letter:
        applied_discount_pct = 20.0
        discount_source = "College Project with Letter (20%)"
    elif client_flag == "student" and has_valid_id:
        applied_discount_pct = 10.0
        discount_source = "Student with Valid ID (10%)"
        
    if is_woman_dop:
        applied_discount_pct += 5.0
        discount_source += " + Woman Director/DoP (5%)"

    # Law 10 Gate Check
    discount_check = validate_discount(
        percent=applied_discount_pct,
        reason=discount_reason,
        approver_name=approver_name
    )
    if not discount_check["valid"]:
        errors.append(f"LAW 10 DISCOUNT GATE FAILED: {discount_check['error']}")

    # Caretaker evaluation
    needs_caretaker = False
    caretaker_reason = ""
    if total_subtotal_rs >= 50000:
        needs_caretaker = True
        caretaker_reason = "Total booking value >= NPR 50,000"
    elif has_any(["red", "komodo", "ronin 4d", "mantis", "great joy", "chiopt", "nisi athena"]):
        needs_caretaker = True
        caretaker_reason = "Package contains high-risk cinema glass or cinema bodies"

    caretaker_fee_rs = (2000 * days) if needs_caretaker else 0

    # Exact financial engine calculation in integer Paisa
    pricing = price(
        equipment=rupees(total_subtotal_rs),
        services=rupees(caretaker_fee_rs),
        discount_percent=applied_discount_pct,
        vat_percent=13.0,
        payments=0
    )

    final_payable_rs = int(to_rupees(pricing["rental_total"]))

    # Security deposit calculation (Law 5: Liability, separate from rental total)
    calculated_deposit_rs = 0
    deposit_basis = "None"
    for item in items:
        low = item.lower()
        for k, amt in FLAT_RATE_DEPOSITS.items():
            if k in low:
                if amt > calculated_deposit_rs:
                    calculated_deposit_rs = amt
                    deposit_basis = f"Flat Rate Policy ({k.upper()}: Rs {grouped(amt)})"

    if calculated_deposit_rs == 0:
        calculated_deposit_rs = max(10000, int(final_payable_rs * 0.25))
        deposit_basis = "Standard 25% Rental Basis Fallback"

    # Advance payment tiers (§R1)
    if final_payable_rs < 5000:
        advance_required_rs = final_payable_rs
        advance_rule = "Full payment required before release"
    elif final_payable_rs < 10000:
        advance_required_rs = 5000
        advance_rule = "Minimum NPR 5,000 advance required"
    else:
        advance_required_rs = int(final_payable_rs * 0.50)
        advance_rule = "Minimum 50% advance required"

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "required_additions": required_additions,
        "rig_weight_kg": round(total_camera_weight_kg, 2),
        "quote": {
            "rental_days": days,
            "daily_subtotal_paisa": rupees(daily_subtotal_rs),
            "gross_subtotal_paisa": pricing["subtotal"],
            "multi_day_discount_paisa": rupees(multi_day_discount_rs),
            "policy_discount_pct": applied_discount_pct,
            "policy_discount_source": discount_source,
            "discount_paisa": pricing["discount"],
            "taxable_paisa": pricing["taxable"],
            "vat_13_pct_paisa": pricing["vat"],
            "caretaker_required": needs_caretaker,
            "caretaker_reason": caretaker_reason,
            "caretaker_fee_paisa": rupees(caretaker_fee_rs),
            "rental_total_paisa": pricing["rental_total"],
            "security_deposit_paisa": rupees(calculated_deposit_rs),
            "deposit_basis": deposit_basis,
            "advance_required_paisa": rupees(advance_required_rs),
            "advance_rule": advance_rule,
        }
    }

def main():
    parser = argparse.ArgumentParser(description="Validate Babin Rentals booking kit and calculate quote (OS Engine Aligned)")
    parser.add_argument("--items", nargs="+", help="List of equipment item names")
    parser.add_argument("--days", type=int, default=1, help="Rental duration in days")
    parser.add_argument("--client-flag", choices=["student", "college_project"], default=None)
    parser.add_argument("--standing-discount", type=int, default=0, help="Standing client discount percentage")
    parser.add_argument("--is-woman-dop", action="store_true", help="Flag if director or DoP is female (5% discount)")
    parser.add_argument("--has-valid-id", action="store_true", help="Verified student ID")
    parser.add_argument("--has-letter", action="store_true", help="Verified college recommendation letter")
    parser.add_argument("--discount-reason", type=str, default=None, help="Reason for discount > 10% (Law 10)")
    parser.add_argument("--approver-name", type=str, default=None, help="Authorizing Manager/Owner approver (Law 10)")
    parser.add_argument("--json-file", type=str, help="Path to input JSON file containing booking details")

    args = parser.parse_args()

    items = args.items or []
    days = args.days
    client_flag = args.client_flag
    standing_discount = args.standing_discount
    is_woman = args.is_woman_dop
    has_id = args.has_valid_id
    has_letter = args.has_letter
    discount_reason = args.discount_reason
    approver_name = args.approver_name

    if args.json_file:
        with open(args.json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            items = data.get("items", items)
            days = data.get("days", days)
            client_flag = data.get("client_flag", client_flag)
            standing_discount = data.get("standing_discount", standing_discount)
            is_woman = data.get("is_woman_dop", is_woman)
            has_id = data.get("has_valid_id", has_id)
            has_letter = data.get("has_letter", has_letter)
            discount_reason = data.get("discount_reason", discount_reason)
            approver_name = data.get("approver_name", approver_name)

    if not items:
        print("Error: No equipment items specified. Use --items or --json-file.")
        sys.exit(1)

    result = validate_booking(
        items=items,
        days=days,
        client_flag=client_flag,
        standing_discount_pct=standing_discount,
        is_woman_dop=is_woman,
        has_valid_id=has_id,
        has_letter=has_letter,
        discount_reason=discount_reason,
        approver_name=approver_name
    )

    print("\n" + "="*65)
    print("BABIN RENTALS OS — RENTAL INTELLIGENCE SYSTEM VALIDATION REPORT")
    print("="*65)
    print(f"Status: {'VALID' if result['is_valid'] else 'BLOCKED (Errors Detected)'}")
    print(f"Estimated Rig Weight: {result['rig_weight_kg']} kg")

    if result['errors']:
        print("\n[!] CRITICAL BLOCKING ERRORS:")
        for err in result['errors']:
            print(f"  - {err}")

    if result['warnings']:
        print("\n[*] WARNINGS & RECOMMENDATIONS:")
        for warn in result['warnings']:
            print(f"  - {warn}")

    if result['required_additions']:
        print("\n[+] MANDATORY AUTO-COMPLETION ADDITIONS:")
        for req in result['required_additions']:
            print(f"  - {req}")

    q = result['quote']
    print("\n" + "-"*65)
    print(f"FINANCIAL BREAKDOWN ({q['rental_days']} Days) — Foundation v2.0 Invariants")
    print("-"*65)
    print(f"Daily Subtotal:        {format_money(q['daily_subtotal_paisa'])}")
    print(f"Gross Subtotal:        {format_money(q['gross_subtotal_paisa'])}")
    if q['multi_day_discount_paisa'] > 0:
        print(f"Multi-Day 10% Disc:   -{format_money(q['multi_day_discount_paisa'])}")
    if q['discount_paisa'] > 0:
        print(f"Policy Discount:      -{format_money(q['discount_paisa'])} ({q['policy_discount_source']})")
    print(f"Net Taxable:           {format_money(q['taxable_paisa'])}")
    print(f"13% VAT:               {format_money(q['vat_13_pct_paisa'])}")
    if q['caretaker_required']:
        print(f"Camera Caretaker:     +{format_money(q['caretaker_fee_paisa'])} ({q['caretaker_reason']})")
    print(f"RENTAL TOTAL:          {format_money(q['rental_total_paisa'])}")
    print(f"\nSECURITY DEPOSIT:      {format_money(q['security_deposit_paisa'])} [{q['deposit_basis']}]")
    print(f"                       (Law 5: Held as liability; strictly excluded from rental total)")
    print(f"ADVANCE REQUIRED:      {format_money(q['advance_required_paisa'])} [{q['advance_rule']}]")
    print("="*65 + "\n")

if __name__ == "__main__":
    main()
