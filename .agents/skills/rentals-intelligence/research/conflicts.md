# Technical Conflicts & Discrepancy Log

This document records conflicts discovered during B&H Photo Video research, manufacturer manual reconciliation, and Babin field experience.

---

### Conflict 1: Sony FX3 Operational Weight Discrepancy
- **Existing Babin Value:** 640 grams
- **B&H Technical Specs:** 715 grams (1.57 lb)
- **Manufacturer Manual (Sony):** 640g (Body Only); 715g (with NP-FZ100 battery & CFexpress card); 1,015g (with XLR Top Handle unit attached).
- **Reason:** Previous internal logs noted body-only bare weight, whereas real-world payload calculations must consider operational weight with battery and card.
- **Resolution:** Adopted two distinct fields: `body_weight_g: 640` and `operational_weight_g: 715`. Added `top_handle_xlr_g: 300` as an optional rigged accessory.

---

### Conflict 2: DJI RS 4 Pro Maximum Payload vs Real-World Production Headroom
- **Manufacturer Claimed Spec:** 4.5 kg (10.0 lb)
- **B&H Listing:** "Tested Payload 10 lb"
- **Babin Field Reality & Review Consensus:** Operating at >3.8kg with front-heavy cine primes or anamorphic lenses causes motor oscillation, high-temperature warnings, and axis shudder during rapid pan/tilt tracking.
- **Resolution:** Defined `max_tested_payload_g: 4500` and `recommended_operational_payload_g: 3800`. Anything between 3.8kg and 4.5kg triggers `SAFE_BUT_NEAR_LIMIT` advisory in the payload engine, recommending Tilta Ring Grip or Easyrig support.

---

### Conflict 3: RED Komodo 6K Video Output Confusion
- **External Customer Assumption:** Requesting standard HDMI cable for Komodo 6K rentals.
- **B&H Specs / RED Technical Manual:** RED Komodo 6K has NO HDMI output port on the body. It features a single 12G-SDI female BNC output.
- **Resolution:** Enforced hard compatibility block in `compatibility_graph.json` and `complete_kit()`: Selecting RED Komodo 6K + HDMI-only monitor automatically triggers a blocking warning requiring either an SDI monitor (Accsoon M7 Pro / Desview) or an active SDI-to-HDMI micro-converter.

---

### Conflict 4: Sigma 24-70mm Art Generation Ambiguity
- **Catalog Name:** "Sigma 24-70mm f2.8"
- **B&H Listings:** Gen 1 (835g, 82mm filter) vs Gen 2 Art II (745g, HLA motor, aperture ring).
- **Verification against Babin SKU:** Babin Rentals operates the **Gen II Art** version (`SIG-24-70-E-II`).
- **Resolution:** Updated weight to 745g and cataloged HLA autofocus tracking profile in `product_specs.json`.
