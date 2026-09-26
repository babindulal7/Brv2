# B&H Deep Research & Intelligence Changelog

## Version 2.0.0 — B&H & Manufacturer Integration
**Date:** 2026-09-26  
**Scope:** Complete fleet enrichment across Cameras, Lenses, Lighting, Support, Monitoring, Audio, Power, and Media.

---

### What Was Added (External Intelligence)
1. **Verified Technical Specifications (`data/product_specs.json`):**
   - Exact sensor dimensions, operational weights, codec bitrates, dynamic range, and power draws for Sony FX3, A7S III, A7 IV, RED Komodo, RED Komodo-X, and DJI Ronin 4D.
   - Optical specifications for Blazar Mantis, Blazar Great Joy, NiSi Athena, CHIOPT Xtreme Zooms, Sigma Art, and Samyang V-AF lenses.
   - Photometrics, CCT ranges, and 230V amperage figures for Aputure LS 600x Pro, 400x, and amaran series.
2. **Hardware Compatibility Graph (`data/compatibility_graph.json`):**
   - 20+ typed relationships (`USES_MEDIA`, `USES_BATTERY`, `ADAPTS_TO`, `REQUIRES`, `CONFLICTS_WITH`).
   - Hard blocks on incompatible pairings (e.g. Ronin 4D on RS4; Komodo 6K direct HDMI).
3. **Physical Payload Matrix (`data/payload_matrix.json`):**
   - Gram-level weights for camera bodies, lenses, cages, monitors, batteries, matte boxes, and motors.
   - Real-world rig calculations with 30% tripod headroom and dynamic gimbal stability ratings.
4. **Power & Battery Runtime Calculator (`data/power_matrix.json`):**
   - Wattage metrics with 0.85 conservative efficiency factor.
   - Runtime estimations for 99Wh V-Mount, NP-FZ100, NP-F970, and TB50 across all bodies.
5. **Media Storage Runtime Matrix (`data/media_matrix.json`):**
   - Precise MB/s and Mbps calculation per resolution, frame rate, and codec.
   - Recording time estimations for 80GB, 160GB, 320GB, 512GB, and 1TB/2TB media.
6. **Electrical Circuit Load Planner (`data/lighting_matrix.json`):**
   - Single-socket 15A threshold (2,760W safe load, 3,450W max).
   - Multi-circuit split and cinema generator recommendation triggers.
7. **Accessory Dependency Engine (`data/accessory_dependencies.json`):**
   - Classified dependencies into Technically Required, Production Required, Workflow Recommended, Convenience, and Optional.
8. **Replacement Value & Landed Cost Baseline (`data/replacement_values.json`):**
   - Multi-component formula (USD MSRP + freight + 15% customs + 13% VAT + local friction) reflecting Kathmandu market realities.
9. **Failure Signals & Prevention Rules (`data/external_issue_signals.json`):**
   - SDI ESD shock prevention protocol on RED cameras.
   - 15mm rod enforcement on CHIOPT zooms to prevent mount cracking.
   - Antenna audit checkpoints for wireless video transmitters.

---

### What Was Kept Intact (Source of Truth Guarantee)
- **ZERO Babin rental prices modified.** (Babin rate card remains 100% authoritative).
- **ZERO Babin discounts changed.** (Student, college letter, woman DoP rules unchanged).
- **ZERO deposit risk multipliers modified.** (High 25%, Medium 15%, Low 8% intact).
- **ZERO customer data or history overwritten.**
- **ZERO change to Babin SOPs, chain of custody, or advance rules.**
