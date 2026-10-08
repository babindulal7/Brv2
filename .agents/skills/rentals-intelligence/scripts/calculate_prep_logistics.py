#!/usr/bin/env python3
"""
calculate_prep_logistics.py - Babin Rentals OS Preparation & Logistics Engine (Brain v4)

Learned from Babin Rentals Products App specifications:
1. Preparation Time Intelligence: Calculates minutes required to inspect, test, and prep kit.
2. Logistical Delivery Load: Classifies shipment into Small, Medium, Heavy, Vehicle, or 2-Staff.
3. Staff Mistake Prevention: Flags high-risk accessory omissions (gimbal plates, readers, antennas, sandbags).
4. Client Skill Gate Validation: Checks beginner/intermediate safety against cinema/car rig hardware.
"""

import sys
import os
import json
import argparse
from typing import Dict, Any, List, Tuple

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

def load_json(filename: str) -> Dict[str, Any]:
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

PATTERNS = load_json("rental_patterns.json")

def estimate_prep_time(items: List[str]) -> Dict[str, Any]:
    """
    Estimates staging and QC testing minutes based on kit composition.
    """
    benchmarks = PATTERNS.get("preparation_time_benchmarks", {})
    names_lower = [i.lower().replace("_", " ") for i in items]
    
    def has_any(keywords):
        return any(any(kw.replace("_", " ") in item for kw in keywords) for item in names_lower)
        
    category = "small_package"
    if has_any(["car rig", "float", "x-jib"]):
        category = "movement_car_rig"
    elif has_any(["komodo", "ronin 4d", "red"]) and len(items) >= 4:
        category = "cinema_package"
    elif has_any(["600x", "300c", "c-stand", "skimmer"]) and len(items) >= 3:
        category = "lighting_package"
    elif has_any(["fx3", "a7iv", "a7s", "gimbal", "rs 3", "rs 4"]):
        category = "camera_kit"
        
    bench = benchmarks.get(category, {
        "minutes_min": 15,
        "minutes_max": 30,
        "description": "Standard inventory checkout",
        "qc_tasks": ["Physical condition inspection", "Serial number verification"]
    })
    
    # Scale slightly if item count is large
    item_scaling = max(0, (len(items) - 5) * 5)
    total_min = bench["minutes_min"] + item_scaling
    total_max = bench["minutes_max"] + item_scaling
    
    return {
        "package_category": category,
        "prep_minutes_min": total_min,
        "prep_minutes_max": total_max,
        "summary": f"{total_min}-{total_max} mins ({bench['description']})",
        "mandatory_qc_tasks": bench["qc_tasks"]
    }

def estimate_delivery_load(items: List[str]) -> Dict[str, Any]:
    """
    Determines logistical delivery load and vehicle requirements for Kathmandu.
    """
    matrix = PATTERNS.get("delivery_load_matrix", {})
    names_lower = [i.lower().replace("_", " ") for i in items]
    
    def has_any(keywords):
        return any(any(kw.replace("_", " ") in item for kw in keywords) for item in names_lower)
        
    count = len(items)
    
    if has_any(["car rig", "skimmer frame", "dana dolly", "generator"]) or count >= 12:
        tier = "TWO_STAFF_REQUIRED"
    elif has_any(["komodo", "ronin 4d", "studio assist", "600x"]) or count >= 8:
        tier = "VEHICLE_REQUIRED"
    elif has_any(["c-stand", "300c", "jumbo stand"]) or count >= 5:
        tier = "HEAVY"
    elif has_any(["tripod", "rs 4", "rs 3", "hardcase", "pelican"]) or count >= 3:
        tier = "MEDIUM"
    else:
        tier = "SMALL"
        
    info = matrix.get(tier, {
        "transport_mode": "STANDARD",
        "staff_required": 1,
        "criteria": "General dispatch",
        "case_limit": "Standard"
    })
    
    return {
        "delivery_tier": tier,
        "transport_mode": info["transport_mode"],
        "staff_required": info["staff_required"],
        "criteria": info["criteria"],
        "packaging_volume": info["case_limit"]
    }

def predict_staff_mistakes(items: List[str]) -> List[Dict[str, str]]:
    """
    Flags high-frequency warehouse omissions and pre-handover reminders.
    """
    triggers = PATTERNS.get("staff_mistake_triggers", [])
    names_lower = [i.lower().replace("_", " ") for i in items]
    
    warnings = []
    for trig in triggers:
        kw_list = trig["trigger_gear"]
        if any(any(kw.replace("_", " ") in item for kw in kw_list) for item in names_lower):
            warnings.append({
                "omission_risk": trig["critical_omission"],
                "instruction": trig["warning_message"]
            })
            
    return warnings

def validate_client_skill_gate(items: List[str], skill_level: str = "BEGINNER") -> Dict[str, Any]:
    """
    Checks if client skill level is adequate for the selected equipment.
    Blocks beginners from renting cinema bodies or heavy car rigs without Caretaker/briefing.
    """
    skill_clean = (skill_level or "BEGINNER").upper()
    rules = PATTERNS.get("client_skill_gate_rules", {})
    names_lower = [i.lower().replace("_", " ") for i in items]
    
    def has_any(keywords):
        return any(any(kw.replace("_", " ") in item for kw in keywords) for item in names_lower)
        
    cine_keywords = ["red", "komodo", "ronin 4d", "chiopt", "mantis", "great joy", "car rig", "float"]
    has_cinema_gear = has_any(cine_keywords)
    
    if skill_clean == "BEGINNER" and has_cinema_gear:
        return {
            "allowed": False,
            "status": "GUARDRAIL_BLOCKED",
            "message": "Beginner client selected Professional Cinema / Rigging gear.",
            "action_required": "Mandate Camera Caretaker (NPR 2,000/day) or require 15-minute operational briefing before handover."
        }
        
    return {
        "allowed": True,
        "status": "APPROVED",
        "message": f"Kit matches {skill_clean} operator skill profile.",
        "action_required": "Proceed with standard checklist."
    }

def evaluate_kit_logistics(items: List[str], skill_level: str = "BEGINNER") -> Dict[str, Any]:
    """
    Comprehensive evaluation combining prep time, delivery load, staff mistakes, and skill gates.
    """
    prep = estimate_prep_time(items)
    delivery = estimate_delivery_load(items)
    mistakes = predict_staff_mistakes(items)
    skill_check = validate_client_skill_gate(items, skill_level)
    
    return {
        "items": items,
        "prep_time": prep,
        "logistics": delivery,
        "staff_mistake_warnings": mistakes,
        "skill_gate": skill_check
    }

def main():
    parser = argparse.ArgumentParser(description="Babin Rentals Prep Time & Logistics Calculator")
    parser.add_argument("--items", nargs="+", required=True, help="List of equipment items")
    parser.add_argument("--skill", default="BEGINNER", choices=["BEGINNER", "INTERMEDIATE", "PROFESSIONAL", "EXPERT"], help="Client skill level")
    args = parser.parse_args()
    
    res = evaluate_kit_logistics(args.items, args.skill)
    
    print("=" * 75)
    print(" BABIN RENTALS OS - PREPARATION, LOGISTICS & SAFETY AUDIT (BRAIN v4)")
    print("=" * 75)
    print(f"Items Analyzed: {len(res['items'])}")
    print(f"\n1. PREPARATION TIME:")
    print(f"   Category:     {res['prep_time']['package_category'].upper()}")
    print(f"   Estimated:    {res['prep_time']['summary']}")
    print(f"   Mandatory QC:")
    for task in res['prep_time']['mandatory_qc_tasks']:
        print(f"     * {task}")
        
    print(f"\n2. DELIVERY & TRANSPORT LOGISTICS:")
    print(f"   Tier:         {res['logistics']['delivery_tier']}")
    print(f"   Transport:    {res['logistics']['transport_mode']}")
    print(f"   Staff Needed: {res['logistics']['staff_required']}")
    print(f"   Packaging:    {res['logistics']['packaging_volume']}")
    
    print(f"\n3. STAFF MISTAKE WARNINGS ({len(res['staff_mistake_warnings'])} flagged):")
    if res['staff_mistake_warnings']:
        for w in res['staff_mistake_warnings']:
            print(f"   [!] {w['omission_risk']}: {w['instruction']}")
    else:
        print("   [OK] No high-frequency accessory omission risks detected.")
        
    print(f"\n4. CLIENT SKILL GATE:")
    print(f"   Status:       [{res['skill_gate']['status']}]")
    print(f"   Note:         {res['skill_gate']['message']}")
    print(f"   Action:       {res['skill_gate']['action_required']}")
    print("=" * 75)

if __name__ == "__main__":
    main()
