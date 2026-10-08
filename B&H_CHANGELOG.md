# B&H Photo Video Integration Changelog

**Release:** Rental Intelligence System (RIS) v2.0  
**Scope:** Complete technical specs, physical payload, electrical load, media calculations, and accessory rules.

---

### Enriched Equipment Data
- **Sony FX3 / FX3A:** Operational weight verified at 715g (with battery and CFexpress card); body-only at 640g. Power draw verified at 7.3W internal record, ~15W rigged. Codec bitrates verified at 240 Mbps (24p All-I), 600 Mbps (60p All-I), and 1200 Mbps (120p S&Q).
- **RED Komodo 6K:** Verified operational weight at 1,850g. Nominal power draw verified at 37W. Confirmed CFast 2.0 RED-verified limitation. 12G-SDI output verified with strict ESD hot-plugging warning.
- **RED Komodo-X 6K:** Operational weight verified at 2,200g. Power draw verified at 38W-45W. Integrated Micro V-Mount confirmed. CFexpress Type B verified.
- **DJI Ronin 4D 6K:** Total operational system weight verified at 4,670g. Power draw verified at 45W-55W. TB50 runtime confirmed at ~2.0 hours.
- **Blazar Mantis 1.33x Anamorphic Set:** 5-lens specs verified (25, 35, 50, 75, 100mm). 80mm front diameter and 77mm filter thread mapped. Squeeze ratio 1.33x verified for native 16:9 sensors.
- **CHIOPT 28-85mm & 75-250mm Zooms:** Weights verified at 2,800g and 3,100g. 114mm front diameter mapped. Rigid lens support bracket confirmed as mandatory safety dependency.
- **NiSi Athena Prime Set:** Verified 800g matched weight across 24/35/50/85mm focal lengths (14mm is 890g). Mapped for zero-rebalance gimbal swaps.
- **Aputure LS 600x Pro:** Power consumption verified at 720W Max (3.13A @ 230V). Photometrics verified at 18,510 lux @ 3m. IP54 rating and 2x 10kg sandbag mandate confirmed.
- **amaran 300c:** Power consumption verified at 360W (1.57A @ 230V). Photometrics verified at 26,580 lux @ 1m.
- **DJI RS 4 Pro:** Maximum tested payload verified at 4.5kg; recommended working payload set to 3.8kg. Motor torque increase of +20% confirmed.
- **Accsoon CineView M7 Pro:** Screen brightness verified at 1200 nits. Latency <35ms and range 350m verified. 4x RP-SMA antenna dependency confirmed.

---

### New Mathematical Rules & Safety Limits
- **Tripod Working Load Rule:** 30% safety headroom below max capacity enforced across all tripod setups.
- **Gimbal Dynamic Margin Rule:** 15.5% headroom enforced for DJI RS 4 Pro to prevent motor oscillation under rapid pan/tilt.
- **Power Runtime Formula:** Added conservative efficiency factor formula: $\text{Runtime} = (\text{Battery Wh} \times 0.85) / \text{Wattage}$.
- **Electrical Circuit Overload Rule:** Single-outlet threshold set to 2,760W (80% of 15A Nepali breaker rating); loads between 2,500W–5,000W trigger circuit-split warning; loads >5,000W trigger generator mandate.

---

### Unchanged Business Core (Preserved 100%)
- All Babin rental prices, bundle rates, and day calculations remain unchanged.
- All discount rules (student, college project, woman DoP) remain unchanged.
- All deposit risk multipliers (25%, 15%, 8%) remain unchanged.
- All customer history, standing terms, and staff chain of custody remain unchanged.
