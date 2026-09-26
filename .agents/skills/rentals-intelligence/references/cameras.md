# Camera Systems Technical Reference Guide

This reference provides technical verification, hardware quirks, power requirements, and media rules for all camera bodies in the Babin Rentals fleet.

---

## 1. Sony FX3 / FX3A (Cinema Line)
- **Sensor:** Full-Frame 12.1MP BSI Exmor R CMOS (Dual Base ISO 800 / 12,800 S-Log3).
- **Mount:** Sony E-mount (Flange focal distance: 18mm).
- **Physical Weight:** 640g bare body; 715g operational (with battery and card); 1,015g with XLR top handle.
- **Recording Formats:**
  - *XAVC S-I 4K (All-Intra 4:2:2 10-bit):* 240 Mbps (24p), 600 Mbps (60p).
  - *XAVC S-I S&Q (All-Intra 120p):* 1200 Mbps (Requires CFexpress Type A VPG200 certified cards; SD cards will drop frames).
  - *External RAW:* 16-bit 4.2K ProRes RAW via full-size HDMI to Atomos Ninja V+.
- **Power Consumption:** 7.3W (4K 60p internal record); rigged average ~15W.
  - *NP-FZ100 (16.4Wh):* ~1.9 hours runtime.
  - *99Wh V-Mount:* ~5.6 to 6.5 hours runtime.
- **Critical Quirk:** No built-in ND filter. Must always be quoted with either a variable ND filter (Tilta Mirage VND) or 4x5.65 matte box with FSND/IRND filters.
- **Included Top Handle:** Contains physical XLR audio inputs. When removing top handle for gimbal work, standard 3.5mm mic input on body remains operational.

---

## 2. RED Komodo 6K
- **Sensor:** Super35 19.9MP Global Shutter CMOS (27.03 x 14.26 mm). No rolling shutter artifacts on whip-pans or propeller blades.
- **Mount:** Integrated Canon RF Mount. Accepts mechanical RF lenses, Canon RF-to-EF adapters, and RF-to-PL adapters.
- **Media Requirement:** CFast 2.0 (RED-verified ONLY). 512GB card yields approx 50 mins in 6K HQ, 76 mins in 6K MQ.
- **Video Output:** 1x 12G-SDI female BNC port. **Zero HDMI ports on body.**
  - *Mandatory Rule:* Never connect HDMI monitors without an active SDI-to-HDMI micro-converter.
  - *ESD Danger:* Power cable must be connected before SDI cable. Hot-plugging SDI under active battery power can fry the SDI transceiver chip.
- **Power:** 37W continuous. Dual BP-9XX battery slots on rear or V-Mount battery plate via 2-pin LEMO 0B DC input (11-17V).

---

## 3. RED Komodo-X 6K
- **Sensor:** Super35 19.9MP Global Shutter CMOS with doubled frame rates (6K 80fps, 4K 120fps).
- **Mount:** Reinforced Locking RF Mount with positive locking ring (eliminates lens wiggle on follow-focus torque).
- **Media Requirement:** CFexpress Type B (RED PRO ONLY). Standard commercial PC CFexpress B cards will cause write halts during R3D encoding.
- **Power:** Native Micro V-Mount battery plate on camera rear. Draws ~38W-45W.
- **Audio:** 5-pin 00B LEMO input with professional +48V phantom power.

---

## 4. DJI Ronin 4D 6K
- **System:** 4-Axis stabilized cinema camera (active vertical Z-axis stabilization motor).
- **Sensor:** Full-Frame Zenmuse X9-6K (Dual Base ISO 800 / 5000).
- **Internal ND:** Motorized 9-stop physical ND filters (ND 0.3 to ND 2.7).
- **Mount:** Interchangeable DL Mount (included), Sony E-Mount unit, Leica M-Mount unit.
- **Weight:** 4.67 kg (Full operational body with gimbal and battery).
- **Power:** DJI TB50 Intelligent Battery (97.58Wh). Continuous runtime ~2.0 hours.
- **Critical Rule:** Ronin 4D integrates its own gimbal; never attach to external gimbals (RS3/RS4 Pro). For jib, crane, or car-rig use, rent the **DJI Ronin 4D Flex Cable** to detach the sensor head (1.8kg) from the main body.
