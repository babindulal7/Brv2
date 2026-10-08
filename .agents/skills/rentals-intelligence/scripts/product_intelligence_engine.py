#!/usr/bin/env python3
"""
product_intelligence_engine.py
Babin Rentals OS - External Product Intelligence, Compatibility & Care Engine
Implements standardized RIS function contracts for B&H, OEM, care profiles,
diagnostics triage (Level A/B/C), and substitution recommendations.
"""

import sys
import json
from pathlib import Path
from typing import Dict, List, Any, Optional

DATA_DIR = Path(__file__).parent.parent / "data"

def load_json(filename: str) -> dict:
    filepath = DATA_DIR / filename
    if not filepath.exists():
        return {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

# Cache datastores
SPECS = load_json("product_specs.json")
COMPAT_GRAPH = load_json("compatibility_graph.json")
ACCESSORY_DEPS = load_json("accessory_dependencies.json").get("dependencies", {})
CARE_PROFILES = load_json("equipment_care_profiles.json")
RENTAL_PATTERNS = load_json("rental_patterns.json")

def normalize_product_id(name_or_id: str) -> str:
    """Matches a natural product name to canonical ID or key in SPECS."""
    query = name_or_id.upper().replace("-", "_").replace(" ", "_")
    if query in SPECS:
        return query
    for key, data in SPECS.items():
        name = data.get("canonical_model", "").upper()
        if key in query or query in key or query in name or name in query:
            return key
    return query

def get_product_intelligence(product_id: str) -> Dict[str, Any]:
    """Returns normalized product specs, category, and status."""
    key = normalize_product_id(product_id)
    if key in SPECS:
        prod = SPECS[key]
        name = prod.get("canonical_model", key)
        brand = prod.get("brand", "OEM")
        weight_kg = (prod.get("operational_weight_g") or prod.get("body_weight_g", 1000)) / 1000.0
        return {
            "found": True,
            "product_key": key,
            "canonical_id": f"BRPI-{brand.upper().replace(' ', '')}-{key.replace('_', '-')}",
            "name": name,
            "category": prod.get("product_type"),
            "brand": brand,
            "weight_kg": weight_kg,
            "power": prod.get("power_draw", {}),
            "media": prod.get("approved_media", []),
            "mount": prod.get("lens_mount"),
            "status": prod.get("status", "CURRENT"),
            "care_category": "camera" if "Camera" in prod.get("product_type", "") else "accessory"
        }
    return {
        "found": False,
        "product_key": product_id,
        "error": f"Product '{product_id}' not found in Babin Rentals specifications."
    }


def get_compatibility(product_a: str, product_b: str) -> Dict[str, Any]:
    """
    Checks compatibility, mount adapters, or hard conflicts between two products.
    """
    key_a = normalize_product_id(product_a)
    key_b = normalize_product_id(product_b)
    
    relationships = COMPAT_GRAPH.get("relationships", [])
    
    # 1. Check direct relationships
    for rel in relationships:
        src = rel.get("source", "")
        tgt = rel.get("target", "")
        relation = rel.get("relation", "")
        props = rel.get("properties", {})
        
        # Check conflicts
        if relation == "CONFLICTS_WITH":
            if (src in key_a and tgt in key_b) or (src in key_b and tgt in key_a) or \
               (src in product_a.upper() and tgt in product_b.upper()) or \
               (src in product_b.upper() and tgt in product_a.upper()):
                return {
                    "compatible": False,
                    "status": "HARD_CONFLICT_REJECT",
                    "reason": props.get("reason", "Incompatible equipment combination."),
                    "relation": relation
                }
                
        # Check adaptation
        if relation == "ADAPTS_TO":
            if (src in key_a and key_b in tgt) or (src in key_b and key_a in tgt) or \
               ("PL" in product_a.upper() and "E_MOUNT" in tgt) or \
               ("CHIOPT" in product_a.upper() and "E_MOUNT" in tgt):
                return {
                    "compatible": True,
                    "status": "ADAPTER_REQUIRED",
                    "required_adapter": tgt,
                    "auto_attach": True,
                    "notes": props.get("supports_lenses", [])
                }

    # Custom rule for Ronin 4D + external gimbal
    if ("RONIN_4D" in key_a and "RS" in key_b) or ("RONIN_4D" in key_b and "RS" in key_a):
        return {
            "compatible": False,
            "status": "HARD_CONFLICT_REJECT",
            "reason": "Ronin 4D integrates internal 4-axis motorized stabilization; external gimbal is forbidden."
        }

    # Custom rule for PL lens on E-mount
    if ("CHIOPT" in key_a or "ATHENA" in key_a) and ("FX3" in key_b or "A7" in key_b):
        return {
            "compatible": True,
            "status": "ADAPTER_REQUIRED",
            "required_adapter": "PL_TO_E_ADAPTER",
            "auto_attach": True,
            "notes": "PL lens mounted to Sony E-mount body requires PL-to-E mount adapter."
        }

    # General compatibility
    return {
        "compatible": True,
        "status": "COMPATIBLE",
        "notes": f"No known incompatibilities between {product_a} and {product_b}."
    }

def get_required_dependencies(product_id: str) -> List[Dict[str, Any]]:
    """Returns mandatory accessory dependencies for an item."""
    key = normalize_product_id(product_id)
    deps = ACCESSORY_DEPS.get(key, {})
    return deps.get("required", [])

def get_product_care_profile(category_or_product: str) -> Dict[str, Any]:
    """Returns dispatch checks, return checks, storage rules, and hard HOLD triggers."""
    cat_query = category_or_product.lower().replace("-", "_").replace(" ", "_")
    
    # Map common aliases
    if "camera" in cat_query or "fx3" in cat_query or "komodo" in cat_query or "ronin4d" in cat_query:
        cat = "camera"
    elif "lens" in cat_query or "zoom" in cat_query or "prime" in cat_query:
        cat = "lens"
    elif "gimbal" in cat_query or "rs4" in cat_query or "rs3" in cat_query:
        cat = "gimbal"
    elif "light" in cat_query or "600x" in cat_query or "300c" in cat_query:
        cat = "lighting"
    elif "battery" in cat_query or "v_mount" in cat_query:
        cat = "battery"
    elif "wireless" in cat_query or "m7" in cat_query or "monitor" in cat_query:
        cat = "wireless_video"
    elif "grip" in cat_query or "stand" in cat_query or "tripod" in cat_query:
        cat = "grip"
    else:
        cat = cat_query
        
    categories = CARE_PROFILES.get("categories", {})
    if cat in categories:
        return {
            "found": True,
            "category": cat,
            "profile": categories[cat]
        }
    return {
        "found": False,
        "category": cat,
        "error": f"No dedicated care profile for category '{cat}'."
    }


def diagnose_issue(symptoms: List[str], product_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Triages reported symptoms into Level A (Staff Safe), Level B (Tech Service), or Level C (Stop Use).
    """
    symptoms_text = " ".join(symptoms).lower()
    
    # Level C triggers (STOP USE / Factory Service)
    level_c_keywords = [
        "smoke", "burnt smell", "burning", "water", "wet", "rain ingress",
        "swollen", "bulging", "leaking", "spark", "short circuit",
        "cracked mount", "cracked element", "shattered", "blown sdi",
        "driver ic", "unresponsive boot"
    ]
    for kw in level_c_keywords:
        if kw in symptoms_text:
            return {
                "diagnostic_level": "LEVEL_C",
                "urgency": "CRITICAL_STOP_USE",
                "quarantine_required": True,
                "status": "HOLD_FACTORY_SERVICE_REQUIRED",
                "matched_trigger": kw,
                "action": "Immediately power down, quarantine in red case, and log incident report for owner/factory review. Do not dispatch."
            }
            
    # Level B triggers (Trained Tech / Hold)
    level_b_keywords = [
        "mount play", "loose mount", "sensor spot", "dust on sensor", "fungus",
        "haze", "gritty focus", "stiff iris", "motor jitter", "calibration error",
        "fan noise", "overheating", "thermal warning", "intermittent port"
    ]
    for kw in level_b_keywords:
        if kw in symptoms_text:
            return {
                "diagnostic_level": "LEVEL_B",
                "urgency": "MODERATE_TECH_INSPECTION",
                "quarantine_required": True,
                "status": "HOLD_FOR_TECH_INSPECTION",
                "matched_trigger": kw,
                "action": "Place item on HOLD. Route to authorized internal technician for optical/electrical bench testing."
            }
            
    # Level A triggers (Staff Safe troubleshooting)
    return {
        "diagnostic_level": "LEVEL_A",
        "urgency": "LOW_STAFF_SAFE",
        "quarantine_required": False,
        "status": "STAFF_SAFE_CHECKS",
        "action": "Perform standard Level A checks: swap cable with known-good studio reference, swap battery/media, reboot unit, and verify menu settings."
    }

def get_substitutes(product_id: str) -> List[Dict[str, Any]]:
    """Returns direct inventory substitutes when gear is booked or in maintenance."""
    key = normalize_product_id(product_id).upper()
    
    # Specific curated substitution rules
    sub_map = {
        "SIGMA_24_70": [
            {"product_key": "tamron_28_75_g2", "name": "Tamron 28-75mm f/2.8 G2", "tradeoff": "Slightly narrower wide end (28mm vs 24mm), lighter weight, lower rate"},
            {"product_key": "sony_24_105_g", "name": "Sony FE 24-105mm f/4 G OSS", "tradeoff": "f/4 aperture (1 stop slower), broader telephoto reach"}
        ],
        "SONY_FX3": [
            {"product_key": "sony_a7s_iii", "name": "Sony A7S III", "tradeoff": "Identical sensor & codecs; EVF included, lacks built-in cooling fan & top audio handle"},
            {"product_key": "sony_a7_iv", "name": "Sony A7 IV", "tradeoff": "Higher resolution (33MP), slight 4K60 crop, excellent hybrid backup"}
        ],
        "DJI_RS_4": [
            {"product_key": "dji_rs3_pro", "name": "DJI RS 3 Pro", "tradeoff": "Previous gen 4.5kg payload; identical motor stability for standard cinema rigs"}
        ],
        "APUTURE_600X": [
            {"product_key": "aputure_300c", "name": "Aputure 300c RGBWW", "tradeoff": "Lower power (300W vs 600W), adds full RGB color capability"}
        ]
    }
    
    for sub_key, items in sub_map.items():
        if sub_key in key or key in sub_key:
            return items
    return []


def calculate_attach_rate(trigger_item: str, attach_item: str) -> float:
    """Calculates conditional attach rate from empirical rental patterns."""
    top_pairs = RENTAL_PATTERNS.get("top_bundle_pairs", [])
    t_clean = trigger_item.lower()
    a_clean = attach_item.lower()
    
    for pair in top_pairs:
        p1 = pair.get("product_1", "").lower()
        p2 = pair.get("product_2", "").lower()
        if (t_clean in p1 and a_clean in p2) or (t_clean in p2 and a_clean in p1):
            count = pair.get("co_occurrence_count", 0)
            # Estimate attach rate based on 60 typical orders
            return round(min(count / 50.0, 0.95), 2)
            
    # Default category heuristics
    if "fx3" in t_clean and "battery" in a_clean:
        return 0.74
    if "komodo" in t_clean and "monitor" in a_clean:
        return 0.82
    return 0.25

if __name__ == "__main__":
    print("Testing product_intelligence_engine.py...")
    # 1. Product Intelligence
    intel = get_product_intelligence("Sony FX3A")
    print(f"Product: {intel['name']} | Canonical ID: {intel['canonical_id']}")
    
    # 2. Compatibility
    compat1 = get_compatibility("CHIOPT 28-85mm", "Sony FX3A")
    print(f"CHIOPT on FX3: {compat1['status']} (Req: {compat1.get('required_adapter')})")
    
    compat2 = get_compatibility("Ronin 4D", "DJI RS 4 Pro")
    print(f"Ronin 4D + RS4: {compat2['status']} (Reason: {compat2.get('reason')})")
    
    # 3. Care Profile
    care = get_product_care_profile("camera")
    print(f"Camera Return Checks count: {len(care['profile']['return_checks'])}")
    
    # 4. Diagnostics Triage
    diag_c = diagnose_issue(["intermittent HDMI video feed", "burnt smell coming from port"])
    print(f"Burnt Port Diagnosis: {diag_c['diagnostic_level']} -> {diag_c['status']}")
    
    diag_a = diagnose_issue(["video flickering slightly on monitor"])
    print(f"Flicker Diagnosis: {diag_a['diagnostic_level']} -> {diag_a['status']}")
    
    # 5. Substitutes
    subs = get_substitutes("Sigma 24-70")
    print(f"Sigma 24-70 Substitutes: {[s['name'] for s in subs]}")
