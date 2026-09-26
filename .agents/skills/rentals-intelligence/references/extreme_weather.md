# Extreme Weather & Himalayan Operations Manual
### Babin Rentals Pvt. Ltd. — Technical Reference Guide

Filming in Nepal often involves extreme environments—from sub-zero Himalayan altitudes (Mustang, Manang, Khumbu, Langtang) to high-humidity monsoons in the Terai and Kathmandu valley. This document details mandatory equipment handling protocols, physical safety limits, and client briefing rules.

---

## 1. High-Altitude Cold Operations (Above 2,500m / Sub-Zero °C)

Filming locations such as Jomsom (2,700m), Kagbeni (2,800m), Manang (3,519m), Muktinath (3,760m), and Everest Base Camp (5,364m) present severe challenges for electronic cameras, lithium-ion power chemistry, and optical glass.

### 1.1 Lithium-Ion Battery Cold Derating
* **Electro-Chemical Reality:** Below 0°C, lithium-ion electrolyte viscosity increases, drastically raising internal cell resistance. Voltage sags under load, causing camera shutdowns even when the battery displays 30–40% charge.
* **Standard Derating Factor:**
  * **0°C to -10°C:** Deduct **35% to 40%** from rated runtime.
  * **Below -10°C:** Deduct **50%** from rated runtime.
* **Operational Rules:**
  1. **Body Heat Incubation:** Always carry active spares inside an inner down-jacket pocket close to body warmth. Never leave batteries in exterior backpack compartments or uninsulated pelican cases overnight.
  2. **TB50 / TB51 Smart Batteries (DJI Ronin 4D / Inspire):** Enable built-in self-heating routines prior to powering on the craft/rig. Do not initialize motor calibration until internal battery core temperature reaches $\ge 15^\circ\text{C}$.
  3. **V-Mount Cold Discharge:** If using V-Mount batteries (e.g., FX3 rig or Komodo-X), power up the rig and let it idle for 3 minutes before hitting record. The baseline electronics draw gently warms the battery core.

---

### 1.2 Teahouse Acclimatization & Condensation Prevention (The "Fungus Killer")
The single most common cause of permanent optical damage in Nepal cinema production is **thermal shock condensation**. Bringing freezing cold lenses (-10°C) straight into a warm, humid, stove-heated Himalayan teahouse causes immediate moisture condensation inside sealed optical groups.

* **Mandatory Acclimatization Protocol:**
  1. **Before Entering Teahouse / Heated Room:** Seal all cameras and lenses inside their airtight Pelican / hard cases **outside in the cold**.
  2. **Latched Isolation:** Bring the sealed cases indoors, but **do not unlatch or open them for a minimum of 45 to 60 minutes**.
  3. **Equilibration:** Allow the thermal gradient to equalize gradually across the case walls.
  4. **Post-Acclimatization Check:** Open the case inside the room and inspect front and rear elements. If any fogging appears, do not wipe with cloth (which smears microscopic grit into anti-reflective coatings); let it clear naturally in the room with silica gel packs adjacent.

---

### 1.3 Portable Generator Altitude De-Rating (Lighting & Charging)
Cinema HMI and LED lights (e.g., Aputure 600x, 400x, Amaran 300c) require substantial continuous wattage. At high altitudes, naturally aspirated generator engines lose power due to decreased oxygen density.

* **De-Rating Formula:**
  $$\text{Loss Rate} \approx 3.5\% \text{ power reduction per } 1,000 \text{ feet } (305\text{m}) \text{ above sea level}$$
* **Himalayan Generator Output Table:**

| Location | Altitude | Oxygen Loss | 3.0 kVA Generator Output | Safe Continuous Load |
| :--- | :--- | :--- | :--- | :--- |
| **Kathmandu** | 1,400m (4,600 ft) | ~16% | ~2,520 W | 2,000 W (e.g., 2× 600x or 300c + charging) |
| **Jomsom / Kagbeni**| 2,800m (9,186 ft) | ~32% | ~2,040 W | 1,600 W (1× 600x or 2× 300c) |
| **Manang / Muktinath**| 3,700m (12,140 ft)| ~42% | ~1,740 W | 1,300 W (Max 1× 600x OR multi-Amaran) |
| **Khumbu / Dingboche**| 4,400m (14,435 ft)| ~50% | ~1,500 W | 1,100 W (Strictly smaller fixtures only) |

* **Warning for Staff:** Never promise a client that a single 3kVA Honda generator will run an Aputure 600x (720W draw) plus rapid battery charging stations simultaneously above 3,000m.

---

### 1.4 High-Altitude Wind, Sand & Glacial Silt (Mustang & Manang)
The Kali Gandaki valley in Mustang experiences intense 35–50 km/h windstorms daily between 11:00 AM and 5:00 PM, carrying microscopic abrasive sand and powdered limestone.

* **Mitigations:**
  1. **Zero Open-Sensor Lens Swaps:** Forbid lens swaps outdoors in active wind. Swaps must occur inside vehicles or sealed tents.
  2. **Screw-on Protection / Matte Box:** Mandatory UV / clear filter or Tilta Mirage matte box with front glass on all lenses (especially expensive CHIOPT or Blazar Mantis optics).
  3. **Port Caps & Tape:** Keep all unused 12G-SDI, HDMI, and timecode ports covered with rubber caps or gaffer tape.
  4. **Cleaning Sequence:** Never wipe dusty gear with a microfiber cloth dry. Use a rocket air blower first to blast abrasive particles off, followed by optical solution.

---

## 2. Monsoon Operations (June – September)

The summer monsoon in Nepal brings relative humidity above 90% and torrential rain.

### 2.1 Fee Structure & Protection Kits
* **Rain Protection Kit:** `NPR 500` flat per rental package (includes heavy-duty clear rain covers, dry-bag outer liners, and desiccant sets).
* **Fungus / Wet Return Cleaning Fee:** `NPR 5,000` mandatory penalty if gear is returned with internal moisture, water droplets inside battery wells, or early signs of fungal bloom.

### 2.2 Monsoon Dispatch Checklist
* [ ] Verify airtight O-ring seal on all Pelican cases.
* [ ] Minimum 2× large silica gel packets placed inside each camera and lens compartment.
* [ ] Inspect cable connectors and battery terminals for dielectric cleanliness.
* [ ] Client briefing: In the event of sudden rain, power down the camera body immediately before slipping on rain covers; active fan ports (FX3 / Komodo-X) draw atomized moisture if running exposed.

---

## 3. Extreme Heat & Valley Dust Operations (March – May)
* **Thermal Shutdown Mitigation:** When shooting outdoors in 35°C+ ambient heat (Terai or mid-day Kathmandu sun), avoid leaving black cinema camera bodies in direct sunlight between takes. Provide an umbrella or white reflective cloth.
* **Fan Profiles:**
  * Sony FX3: Set Fan Control to `Always On` in 4K 60p/120p modes.
  * RED Komodo-X: Set Fan Profile to `Adaptive Preview Quiet Record` to prevent sensor heat saturation during extended recording.
