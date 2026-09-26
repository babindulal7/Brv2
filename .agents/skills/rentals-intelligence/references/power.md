# Power, Batteries & Chargers Technical Reference

Standardized battery chemistries, capacities, charging timelines, airline limits, and D-Tap distribution protocols for Babin Rentals.

---

## 1. Battery Systems Breakdown

### SmallRig VB99 Mini V-Mount Battery (99Wh)
- **Capacity:** 99 Watt-hours (14.8V nominal, 6,700 mAh).
- **Airline Safety:** **100% TSA / IATA compliant** for carry-on luggage (under the 100Wh international restriction threshold).
- **Output Interfaces:**
  - 1x D-Tap (14.8V 14A max discharge).
  - 1x USB-C Bi-directional PD 65W (can fast-charge laptops, phones, or be recharged via 65W GaN wall charger).
  - 1x USB-A (Quick Charge up to 24W).
  - 1x 8V DC Out (powers mirrorless dummy batteries).
  - 1x 12V DC Out (powers monitors, wireless video).
- **Recharge Time:** ~2.5 hours via 65W USB-C PD; ~3.0 hours via standard D-Tap charger.

### Sony NP-FZ100
- **Capacity:** 16.4 Watt-hours (7.2V, 2,280 mAh).
- **Compatibility:** Sony FX3, FX3A, A7S III, A7 IV.
- **Recharge Time:** ~2 hours per battery on Sony dual charger.

### Sony NP-F Series (NP-F970 / NP-F750)
- **NP-F970:** 47.5 Watt-hours (7.4V, 6,600 mAh). Standard power source for on-camera monitors, wireless video TX/RX, and small LED tubes.

### DJI TB50 Intelligent Battery
- **Capacity:** 97.58 Watt-hours (22.8V, 4,280 mAh).
- **Compatibility:** DJI Ronin 4D 6K, DJI Ronin 2.
- **Features:** Built-in self-heating system for sub-zero operations in mountain locations.

---

## 2. Power Runtime Calculation Formula

To calculate operational battery runtime with production safety margin:

$$\text{Runtime Hours} = \frac{\text{Battery Watt-Hours} \times 0.85}{\text{Total Rig Wattage}}$$

*Note: The 0.85 multiplier accounts for inverter DC-DC conversion losses, internal battery resistance, and safety reserve before low-voltage cutoff.*

### Practical Runtimes on a Single 99Wh V-Mount:
1. **Sony FX3 Solo Rig (~15W draw):** $(99 \times 0.85) / 15 = \mathbf{5.61\text{ hours}}$.
2. **RED Komodo-X Rig (~45W draw):** $(99 \times 0.85) / 45 = \mathbf{1.87\text{ hours}}$.
3. **Accsoon CineView M7 Pro Monitor (~10W draw):** $(99 \times 0.85) / 10 = \mathbf{8.41\text{ hours}}$.

---

## 3. Power Cable Safety Law (Reverse Polarity & ESD Warning)
- **D-Tap Cables:** D-Tap connectors are shaped like a trapezoid to enforce polarity, but force can crack the socket. Reversing positive/negative (+/-) pins instantly fries monitor logic boards.
- **Order of Power Connection on RED:**
  1. Plug in battery and power cables to monitor and camera FIRST.
  2. Plug in SDI signal cables SECOND.
  3. Power on camera and monitor.
  *(Prevents ground loop electrostatic discharge from frying the 12G-SDI port).*
