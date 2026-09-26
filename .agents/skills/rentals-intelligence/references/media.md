# Media & Storage Solutions Technical Reference

Card types, speed classes, bus interfaces, camera certifications, and data-rate calculations for Babin Rentals storage assets.

---

## 1. Storage Standards by Camera System

### Sony FX3 / A7S III / A7 IV (Dual Slots)
- **Primary Media:** **CFexpress Type A (PCIe Gen 3 x1).** Read speeds up to 800 MB/s, write up to 700 MB/s.
  - *Certified Standard:* **VPG200** (Video Performance Guarantee minimum sustained 200 MB/s).
  - *Requirement:* All 4K 120p All-Intra (600-1200 Mbps) shooting mandates CFexpress Type A.
- **Secondary Media:** **SDXC UHS-II (V90 / V60).**
  - *V90:* Supported for 4K 24p/60p XAVC S-I (up to 600 Mbps).
  - *V60:* Limited to Long-GOP XAVC HS/S formats (up to 200 Mbps).

### RED Komodo 6K (Single Slot)
- **Media Type:** **CFast 2.0 (SATA III interface, 6 Gbps).**
- **Strict Policy:** **RED-Verified Cards ONLY** (RED PRO CFast 512GB or Angelbird AV PRO CF RED Edition).
  - *Failure Risk:* Uncertified consumer CFast cards trigger media-slowdown errors during 6K HQ recording, corrupting R3D clip headers.

### RED Komodo-X 6K (Single Slot)
- **Media Type:** **CFexpress Type B (PCIe Gen 3 x2).**
- **Sustained Write Speed:** Exceeds 800 MB/s sustained.
- **Approved Cards:** RED PRO CFexpress Type B (1TB / 2TB). Standard DSLR CFexpress B cards without high continuous thermal throttling limits will freeze during 6K 80fps bursts.

### DJI Ronin 4D 6K
- **Media Options:**
  1. **DJI PROSSD 1TB:** Proprietary high-speed NVMe SSD required for 6K ProRes RAW recording.
  2. **CFexpress Type B Slot:** Standard ProRes 422 HQ recording.

---

## 2. Recording Time Calculation Table (Per 160GB / 512GB / 1TB)

| Camera | Codec & Mode | Bitrate (Mbps) | 160GB Type A | 512GB CFast | 1TB CFexpress B |
|---|---|---|---|---|---|
| **Sony FX3** | 4K 24p XAVC S-I (All-I) | 240 Mbps | **88 mins** | — | — |
| **Sony FX3** | 4K 60p XAVC S-I (All-I) | 600 Mbps | **35 mins** | — | — |
| **Sony FX3** | 4K 24p XAVC HS (Long-GOP) | 100 Mbps | **213 mins** | — | — |
| **RED Komodo** | 6K 24p REDCODE HQ | 1344 Mbps | — | **50 mins** | — |
| **RED Komodo** | 6K 24p REDCODE MQ | 896 Mbps | — | **76 mins** | — |
| **RED Komodo** | 6K 24p REDCODE LQ | 480 Mbps | — | **142 mins** | — |
| **RED Komodo-X** | 6K 80p REDCODE HQ | 4480 Mbps | — | — | **30 mins** |
| **RED Komodo-X** | 6K 24p REDCODE MQ | 960 Mbps | — | — | **138 mins** |
| **Ronin 4D 6K** | 6K 60p ProRes RAW HQ | 3400 Mbps | — | — | **39 mins** |

---

## 3. Storage Safety & Redundancy SOP
1. **The 3-2-1 Backup Rule:** Always remind DIT / AC that footage must exist in 3 copies across 2 different media types, with 1 copy stored off-site.
2. **Mandatory Card Reader Pairing:** Every memory card rental must ship with its designated USB-C 3.2 Gen 2 reader. Dispatch staff must test the reader cable.
3. **Format Protocol on Set:** RED cards should be formatted **inside the camera body** upon arrival on set, never on a desktop OS.
