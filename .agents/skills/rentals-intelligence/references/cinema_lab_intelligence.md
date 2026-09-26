# Cinema Lab & Field Intelligence Manual
### Independent Lab Benchmarks: CineD, Newsshooter, Y.M.Cinema & DPReview

This manual provides verified independent laboratory measurements and real-world field test findings from **CineD**, **Newsshooter**, **Y.M.Cinema Magazine**, and **DPReview** for Babin Rentals' cinema fleet. Staff and the RIS LLM engine must use these empirical benchmarks rather than manufacturer marketing claims when consulting clients or evaluating technical risks.

---

## 1. Sensor Readout Speeds & Rolling Shutter Analysis (CineD Labs)

Rolling shutter readout speed determines how straight vertical lines remain during fast camera pans, and whether high-frequency vibrations produce "jello" artifacts.

| Camera | Sensor Type | Rolling Shutter Readout | CineD Lab Assessment | Production Application |
| :--- | :--- | :--- | :--- | :--- |
| **RED Komodo-X** | Super35 CMOS | **0.0 ms (Global Shutter)** | Completely immune to rolling shutter distortion, flash banding, and vibration jello. | **MANDATORY for Car Rigs (Tilta Hydra), helicopter/drone, strobe-heavy clubs, and VFX tracking.** |
| **Sony FX3 / FX3A** | Full-Frame BSI | **8.7 ms** (4K 24p/60p)<br/>**7.3 ms** (4K 120p) | Extremely fast full-frame readout. Minimal skew on fast pans. | Excellent for gimbals (DJI RS 4 Pro), handheld run-and-gun, and fast action sports. |
| **DJI Ronin 4D 6K** | Full-Frame X9-6K | **15.5 ms** (6K FF) | Moderate rolling shutter, mechanically stabilized by the integrated 4-axis gimbal. | Dynamic Steadicam-style tracking, narrative walk-and-talks, one-man cinema crew. |
| **Sony A7 IV** | Full-Frame 33MP | **26.8 ms** (4K FF)<br/>**13.0 ms** (4K S35 Crop) | **High rolling shutter in Full Frame mode.** Significant jello on fast whip-pans. | Best for static tripod interviews, corporate, or used in Super35 crop mode for motion. |

> [!WARNING]
> **Rolling Shutter Warning for Staff:** If a client requests a **Car Rig** or dynamic action shoot, never dispatch the **Sony A7 IV** in full-frame mode (26.8 ms causes severe road vibration jello). Recommend the **RED Komodo-X** (0 ms Global Shutter) or **Sony FX3** (8.7 ms).

---

## 2. Dynamic Range, Usable Latitude & Dual-Native ISOs (CineD & DPReview)

Manufacturer marketing routinely advertises "15+ stops" of dynamic range based on theoretical sensor capacity. CineD standardized IMATEST lab tests measure **usable exposure latitude** at strict Signal-to-Noise Ratios (SNR=2 / SNR=1).

### 2.1 Verified Lab Measurements
* **RED Komodo-X:** **13.0 stops** usable latitude in REDCODE RAW. Exceptionally clean highlight roll-off with 9–10 stops of usable shadow/midtone headroom above the noise floor.
* **Sony FX3 / A7S III:** **12.5 stops** at SNR=2 in S-Log3 / S-Gamut3.Cine.
  * **Dual Native Base ISOs (Cine EI Mode):** **ISO 800** and **ISO 12,800**.
  * *Operational Reality:* At ISO 12,800, the camera switches sensor readout channels to a secondary high-gain circuit, resetting the noise floor to match ISO 800. Enables cinematic low-light wedding receptions and night exteriors without heavy de-noising.
* **DJI Ronin 4D 6K:** **13.1 stops** at SNR=2 in ProRes RAW. Dual Native Base ISOs: **ISO 800** and **ISO 5,000**.
* **Sony A7 IV:** **12.1 stops** at SNR=2 in S-Log3. Dual Base ISOs: **ISO 800** and **ISO 3,200**.

---

## 3. Anamorphic Optical Intelligence (Newsshooter & Y.M.Cinema)

### 3.1 Blazar Mantis 1.33x Anamorphic Series
* **Focal Lengths in Fleet:** 25mm, 35mm, 50mm, 75mm, 100mm, 135mm T3.2.
* **Squeeze Ratio:** **1.33x**.
* **Sensor Math:**
  $$\text{16:9 Aspect Ratio (1.78:1)} \times 1.33\text{ Squeeze} = \mathbf{2.367:1} \approx \mathbf{2.39:1} \text{ Scope}$$
* **Lab Findings (Newsshooter):**
  * Perfect match for 16:9 video sensors (Sony FX3, Sony A7S III, RED Komodo-X 16:9).
  * **100% Sensor Utilization:** Delivers cinematic widescreen without cropping away sensor pixels above or below the frame.
  * Minimal barrel distortion, controlled horizontal blue flares, and classic oval out-of-focus highlights.
  * Linear focus throw allows compatibility with **DJI Focus Pro LiDAR** autofocus tracking.

### 3.2 Great Joy 1.8x Full Frame Anamorphic Series
* **Focal Lengths:** 35mm, 50mm, 85mm T2.9.
* **Squeeze Ratio:** **1.8x**.
* **Sensor Math:** Designed for **Full Frame Open Gate (3:2 / 4:3)** or **RED Komodo 6:5 anamorphic mode**.
* **Lab Findings (Newsshooter & CineD):**
  * Produces deeply pronounced vintage oval bokeh, strong horizontal streak flares (amber/blue), and dramatic anamorphic falloff.
  * **On-Set Monitoring Requirement:** Monitors must support **1.8x de-squeeze preview** (Accsoon CineView M7 Pro or Desview S14-HDR). If previewed unstretched, actors appear uncomfortably compressed.

---

## 4. Heavy Cinema Zoom Engineering: CHIOPT XTREME (Newsshooter)

* **Models in Fleet:** CHIOPT XTREME 28–85mm T3.2 & 75–250mm T3.2.
* **Physical Weight:** **2.9 kg (6.39 lb)** per lens.
* **Front Outer Diameter:** **114mm** (matches standard studio matte boxes).
* **Focus Rotation Throw:** **288 degrees** of smooth rotation.

### 4.1 Critical Engineering Rigging Rules
1. **Mandatory 15mm Baseplate Rod Support Bracket:**
   Due to the 2.9 kg weight and extended physical length, mounting this lens without a rigid rod support bracket exerts severe leverage against the camera's lens mount. On an aluminum or composite mount (Sony FX3 or RED RF mount), camera mount warping or flange destruction will occur.
2. **High-Torque Wireless Focus Motor Mandate:**
   The 288° focus throw features heavy cine-damped grease. Standard lightweight focus motors (e.g., Tilta Nano I) will stall or skip teeth. Staff must bundle **Tilta Nucleus-M** or **DJI Focus Pro Motor (configured to High Torque)**.

---

## 5. Thermal Endurance & Ambient Heat Benchmarks (DPReview)

* **Sony FX3 (Active Internal Fan):**
  * Features an integrated internal cooling fan, magnesium alloy heatsink, and graphite heat spreader.
  * DPReview continuous recording tests demonstrated **unlimited continuous 4K 60p recording** with zero thermal cutouts even at 40°C ambient room temperature.
  * Ideal for long uninterrupted takes (speeches, documentaries, multi-camera corporate panels).
* **Sony A7 IV (Passive Dissipation):**
  * Relies purely on passive heat transfer through the chassis.
  * Oversampling 4K from a 33MP sensor creates significant processor heat.
  * *Thermal Mitigation Protocols:*
    1. Set `Setup ▸ Auto Power OFF Temp ▸ High`.
    2. Articulate LCD screen completely away from the camera backplate.
    3. Avoid leaving the camera running in direct high-altitude sun between takes.
