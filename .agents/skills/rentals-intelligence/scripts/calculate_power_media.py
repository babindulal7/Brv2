#!/usr/bin/env python3
"""
calculate_power_media.py - Babin Rentals Power & Media Calculation Engine

Computes exact battery requirements (V-Mount, NP-FZ100, TB50) and media storage cards
based on camera body, recording codec, total shooting hours, and ambient temperature (Himalayan cold derating).

Usage:
    python calculate_power_media.py --camera "RED Komodo-X" --hours 10 --temp -5 --codec "REDCODE HQ 6K"
    python calculate_power_media.py --camera "Sony FX3A" --hours 8 --codec "XAVC S-I 4K 24p"
"""

import sys
import argparse
import math

# Baseline power draws (Watts)
CAMERA_DRAWS = {
    "fx3": 7.3,
    "fx3a": 7.3,
    "a7s iii": 7.5,
    "a7 iv": 7.5,
    "komodo": 28.0,
    "komodo-x": 37.0,
    "ronin 4d": 55.0,
}

# Standard rig accessory additions (Watts)
ACCESSORY_DRAWS = {
    "monitor_5inch": 6.5,     # Feelworld / Desview
    "monitor_7inch": 14.0,    # Accsoon M7 / Desview 7"
    "wireless_tx": 7.5,       # Accsoon CineView / Hollyland
    "wireless_focus": 3.0,    # Nucleus / Focus Pro motor idle+pull avg
}

# Bitrates in Megabits per second (Mbps)
CODEC_BITRATES = {
    "xavc s-i 4k 24p": 240,       # Sony FX3 / A7S III
    "xavc s-i 4k 60p": 600,       # Sony FX3
    "xavc hs 4k 24p": 100,        # Sony H.265
    "redcode hq 6k": 2240,        # RED Komodo-X (280 MB/s)
    "redcode mq 6k": 1440,        # RED Komodo-X (180 MB/s)
    "redcode lq 6k": 880,         # RED Komodo-X (110 MB/s)
    "prores 422 hq 4k": 880,      # Ronin 4D / Ninja V
    "prores raw 6k": 2000,        # Ronin 4D 6K RAW
}

def calculate_plan(camera_name, hours, ambient_temp=20, codec="xavc s-i 4k 24p", monitor=True, wireless=True):
    cam_key = "fx3"
    for k in CAMERA_DRAWS:
        if k in camera_name.lower():
            cam_key = k
            break

    base_draw = CAMERA_DRAWS[cam_key]
    rig_draw = base_draw
    if monitor:
        rig_draw += ACCESSORY_DRAWS["monitor_7inch"] if "komodo" in cam_key else ACCESSORY_DRAWS["monitor_5inch"]
    if wireless:
        rig_draw += ACCESSORY_DRAWS["wireless_tx"]

    # Inverter / conversion efficiency
    effective_draw = rig_draw / 0.85

    # Cold temperature derating from references/extreme_weather.md
    temp_derating_factor = 1.0
    temp_note = "Normal operational temperature (15°C to 25°C)"
    if ambient_temp <= -10:
        temp_derating_factor = 0.50
        temp_note = "Extreme Himalayan sub-zero cold (< -10°C): 50% capacity derate applied"
    elif ambient_temp <= 0:
        temp_derating_factor = 0.60
        temp_note = "Freezing Himalayan cold (0°C to -10°C): 40% capacity derate applied"
    elif ambient_temp <= 10:
        temp_derating_factor = 0.85
        temp_note = "Cold mountain morning (0°C to 10°C): 15% capacity derate applied"

    # Battery capacity definitions (Wh)
    vmount_99_wh = 99.0 * temp_derating_factor
    np_fz100_wh = 16.4 * temp_derating_factor

    # Runtime calculation
    vmount_runtime_hours = vmount_99_wh / effective_draw
    vmounts_needed = math.ceil(hours / vmount_runtime_hours) + 1 # +1 safety buffer

    np_fz100_runtime_hours = np_fz100_wh / base_draw
    np_fz100_needed = math.ceil(hours / np_fz100_runtime_hours) + 1 if "fx3" in cam_key or "a7" in cam_key else 0

    # Media calculation
    matched_bitrate = 240
    for c, br in CODEC_BITRATES.items():
        if c in codec.lower():
            matched_bitrate = br
            break

    # Mbps to GB per hour: (bitrate_mbps * 3600 seconds) / (8 * 1000)
    gb_per_hour = (matched_bitrate * 3600) / 8000.0
    total_data_gb = gb_per_hour * hours

    # Recommended card capacity
    if "komodo" in cam_key:
        card_size = 512
        card_type = "CFexpress Type B (RED Approved)"
    elif "ronin" in cam_key:
        card_size = 1000
        card_type = "DJI PROSSD 1TB"
    else:
        card_size = 160 if "s-i" in codec.lower() else 128
        card_type = "CFexpress Type A / V90 SDXC"

    cards_needed = math.ceil(total_data_gb / (card_size * 0.90)) # 10% formatting reserve

    return {
        "camera": camera_name,
        "hours": hours,
        "ambient_temp": ambient_temp,
        "temp_note": temp_note,
        "codec": codec,
        "rig_power_draw_w": round(rig_draw, 1),
        "effective_power_draw_w": round(effective_draw, 1),
        "vmount_runtime_hours": round(vmount_runtime_hours, 2),
        "vmounts_required": vmounts_needed,
        "np_fz100_runtime_hours": round(np_fz100_runtime_hours, 2) if np_fz100_needed else None,
        "np_fz100_required": np_fz100_needed if np_fz100_needed else None,
        "codec_bitrate_mbps": matched_bitrate,
        "data_rate_gb_per_hour": round(gb_per_hour, 1),
        "total_day_data_gb": round(total_data_gb, 1),
        "card_type": card_type,
        "card_size_gb": card_size,
        "cards_required": max(2, cards_needed),
    }

def main():
    parser = argparse.ArgumentParser(description="Calculate power runtime and media card requirements for Babin Rentals")
    parser.add_argument("--camera", type=str, default="Sony FX3A", help="Camera body name")
    parser.add_argument("--hours", type=float, default=8.0, help="Planned continuous shooting hours")
    parser.add_argument("--temp", type=float, default=20.0, help="Expected ambient temperature in Celsius")
    parser.add_argument("--codec", type=str, default="XAVC S-I 4K 24p", help="Target recording codec")
    parser.add_argument("--no-monitor", action="store_true", help="Omit monitor from power calculation")
    parser.add_argument("--no-wireless", action="store_true", help="Omit wireless transmitter from power calculation")

    args = parser.parse_args()

    res = calculate_plan(
        camera_name=args.camera,
        hours=args.hours,
        ambient_temp=args.temp,
        codec=args.codec,
        monitor=not args.no_monitor,
        wireless=not args.no_wireless
    )

    print("\n" + "="*60)
    print("BABIN RENTALS — POWER & MEDIA RUNTIME SPECIFICATION")
    print("="*60)
    print(f"Target Camera:     {res['camera']}")
    print(f"Shooting Schedule: {res['hours']} Hours")
    print(f"Ambient Temp:      {res['ambient_temp']}°C ({res['temp_note']})")
    print(f"Recording Codec:   {res['codec']} ({res['codec_bitrate_mbps']} Mbps)")
    print("-"*60)
    print("POWER BUDGET ANALYSIS:")
    print(f"  Rig Continuous Draw: {res['rig_power_draw_w']} W (Effective Load: {res['effective_power_draw_w']} W)")
    print(f"  Runtime per 99Wh V-Mount: ~{res['vmount_runtime_hours']} Hours")
    print(f"  --> MANDATORY V-MOUNT PACK: {res['vmounts_required']}x 99Wh Units (includes 1 spare buffer)")
    if res['np_fz100_required']:
        print(f"  Alternative (Internal NP-FZ100): {res['np_fz100_required']}x Batteries (~{res['np_fz100_runtime_hours']}h each)")
    print("-"*60)
    print("MEDIA & STORAGE PLANNING:")
    print(f"  Data Generation Rate: {res['data_rate_gb_per_hour']} GB / Hour")
    print(f"  Total Estimated Day:  {res['total_day_data_gb']} GB")
    print(f"  Target Card Standard: {res['card_type']} ({res['card_size_gb']}GB)")
    print(f"  --> MANDATORY CARDS:  {res['cards_required']}x Cards (Continuous rotation / A-B roll)")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
