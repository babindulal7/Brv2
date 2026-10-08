# Continuous Lighting & Grip Technical Reference

Photometrics, power draws, electrical socket rules, and rigging safety for Babin Rentals lighting assets.

---

## 1. High-Output Point Source Fixtures

### Aputure LS 600x Pro (Bi-Color COB)
- **Power Consumption:** 720W Maximum.
- **Electrical Draw (230V AC):** 3.13 Amps continuous.
- **Photometrics:**
  - *Hyper Reflector (5600K):* ~18,510 lux @ 3m, ~5,610 lux @ 5m.
  - *F10 Fresnel Spot (15°):* ~29,300 lux @ 3m.
- **Color Accuracy:** CRI 96+, TLCI 98+, SSI (D56) 74.
- **Weather Protection:** IP54 weatherproof sealing across lamp head and control box.
- **Battery Operation:**
  - Dual 14.4V V-Mount: Runs at up to 50% power output.
  - Dual 26V / 28.8V High-Voltage V-Mount: Runs at 100% full power.
- **Mount & Rigging:** Standard Bowens S-Mount. Junior Pin (28mm / 1-1/8") receiver on heavy-duty yoke.
  - *Safety Mandate:* Must be mounted on a Combo Junior Stand or heavy steel C-stand. Always counterweight base with **minimum 2x 10kg sandbags**.

### amaran 300c (RGBWW Full Color COB)
- **Power Consumption:** 360W Maximum.
- **Electrical Draw (230V AC):** 1.57 Amps.
- **Photometrics:** ~26,580 lux @ 1m with 55° Hyper Reflector.
- **Color Capabilities:** 2500K - 7500K CCT range + 360° HSI full color gamut.
- **Mounting:** Bowens S-Mount. 5/8" Baby Pin receiver.
- **Power Supply:** 48V DC power brick. Can be powered in the field via Aputure 2-Bay Battery Power Station (2x 14.4V V-Mount).

### amaran 200d S / 60d S
- **200d S:** 221W max draw (0.96A @ 230V). 5600K daylight. 55,800 lux @ 1m with reflector.
- **60d S:** 78W max draw (0.34A @ 230V). Ultra-compact handheld size. Powered by 2x NP-F970 or D-Tap V-Mount.

---

## 2. Tube & Soft Fixtures

### amaran T4c (4ft) & T2c (2ft) RGBWW Pixel Tubes
- **Output:** 40W (T4c) / 25W (T2c). Full RGB color tuning, pixel effects, internal diffusion.
- **Battery Life:** Removable battery grip provides ~100 minutes at 100% output. Can run continuously off AC adapter.

### Aputure MC Pro (8-Light Production Kit)
- **Output:** 5W per fixture (40W total array). IP65 waterproof rating per unit.
- **Charging Hardcase:** Houses and inductively charges all 8 lights simultaneously. Power draw: 120W AC.
- **Control:** Sidus Link app via Bluetooth Mesh or LumenRadio CRMX.

---

## 3. Electrical Load Planning Law (Nepal 230V Standard)

Standard electrical circuits in Kathmandu residential and commercial buildings are divided into:
1. **5A / 6A Light Sockets:** Maximum continuous safe load is ~920W to 1,150W.
2. **15A Power Sockets (Heavy Three-Pin):** Maximum continuous safe load (80% continuous rating) is **2,760 Watts** (breaker trips at 3,450W).

### Multi-Fixture Rules:
- Running 1x LS 600x Pro (720W) + 2x amaran 300c (720W) + 2x amaran 200d (442W) = **1,882 Watts (8.18A)** → **SAFE on a single 15A socket.**
- Adding a 1000W Fog Machine (1,000W) pushes total to **2,882 Watts (12.53A)** → **DANGER (Exceeds 80% safe load).**
  - *System Instruction:* Prompt staff to split the fog machine onto a separate breaker circuit, or require an on-site generator.
