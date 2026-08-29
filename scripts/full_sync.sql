BEGIN;
DO $$ DECLARE v_cat_id uuid := '00000000-0000-0000-0000-000000000505'; v_branch uuid := '00000000-0000-0000-0000-000000000001'; v_user uuid := '00000000-0000-0000-0000-000000000101'; v_new_id uuid; BEGIN

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'd6b449cb-587d-4715-940c-59a1aea4911f') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001001', '10x10 Skimmer Frame and Cloth ', 'Generic', 'GRP-10-10-SKM-KIT', '', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'd6b449cb-587d-4715-940c-59a1aea4911f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '9c5f5ca1-06ed-4bbe-81da-b35a54af7342') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001002', '12x12 Skimmer and Cloth', 'Generic', 'GRP-12-12-SKM-KIT', '', 0, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '9c5f5ca1-06ed-4bbe-81da-b35a54af7342', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a7baa008-a745-4191-8195-725a0aa5ed38') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001003', '20x20 skimmer cloth (BLACK)', 'Generic', '20x20 skimmer cloth (BLACK)', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a7baa008-a745-4191-8195-725a0aa5ed38', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'cce65daa-15ba-41a8-967b-95bde015c5c8') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001004', '58mm Nd', 'Generic', '58MM_ND', '', 50, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'cce65daa-15ba-41a8-967b-95bde015c5c8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '26d29a69-ae01-45b7-aa0e-78a969a5ddfe') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001005', '5 in 1 Folded Reflector', 'Generic', 'FLD-RF-5''1', '<p>What’s Included:</p>
<p>• 5-in-1 Reflector Disc</p>
<p>• Carrying Bag / Pouch</p>', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '26d29a69-ae01-45b7-aa0e-78a969a5ddfe', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8251d25c-6914-44ee-b0d0-d1b9589f4647') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001006', '6x6 Skimmer Frame and cloth', 'Generic', 'GRP-66-SKM-KIT', '', 800, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '8251d25c-6914-44ee-b0d0-d1b9589f4647', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'b229700f-7b33-46ab-90da-e8148bb61ae3') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001007', '77mm Close-Up Filter', 'Generic', 'FLTR-CLSUP-77MM', '', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'b229700f-7b33-46ab-90da-e8148bb61ae3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e533aa82-29d3-4d8d-ac90-d0e9b72e47d0') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001008', '7Artisans 37mm Lens', 'Generic', '7AR-37MM-LENS', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'e533aa82-29d3-4d8d-ac90-d0e9b72e47d0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a12ef5c8-424c-49de-9fb8-de7c76ffc56b') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001009', '7Artisans 57mm Lens', 'Generic', '7AR-57MM-LENS', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a12ef5c8-424c-49de-9fb8-de7c76ffc56b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e13c71de-2057-4571-bc44-d5ddc51e5aba') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001010', '8x8 Skimmer Frame and Cloth', 'Generic', 'GRP-8-8-SKM-KIT', '', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'e13c71de-2057-4571-bc44-d5ddc51e5aba', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '485fb5a9-ac6c-4708-98e7-79db576c2e22') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001011', '95mm Polarizer Filter for Tilta Mirage', 'Generic', 'FIL-95-CPL-TIL', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '485fb5a9-ac6c-4708-98e7-79db576c2e22', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '9c072452-b581-4c1f-9f91-d4a59e0a8252') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001012', '99Whr Vmount battery', 'Generic', 'BAT-VN99', '<p>99 W·h V-Mount Battery – Overview<br>A 99 W·h V-Mount battery is a professional lithium-ion power pack that uses the V-Mount (V-Lock) standard — a common mount system for cinema and broadcast gear. The 99 W·h rating refers to the total energy the battery stores (Watt-hours), which affects how long it can power your equipment. These batteries are also usually the maximum size allowed on carry-on luggage for most airlines (also called “airline-friendly”).  <br><br><br>⚡ <br><br>Key Specifications<br>	•	Capacity: ~99 W·h (typically ~6,700 mAh at ~14.8 V)  <br>	•	Voltage: ~14.4–14.8 V — suitable for powering professional cameras &amp; accessories.  <br>	•	Mount: Standard V-Mount / V-Lock interface for secure attachment on cameras, cages, plates, and rigs.</p>', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '9c072452-b581-4c1f-9f91-d4a59e0a8252', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8180759d-d7d0-4409-b95a-4b4fa973fd6f') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001013', 'Accsoon CineView M7 Pro 7" monitor (built in wireless)', 'Generic', 'MON-M7PRO-ACC', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '8180759d-d7d0-4409-b95a-4b4fa973fd6f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8b7192e4-fe23-4499-981f-16fa2210f17c') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001014', 'Accsoon Cineview Nano', 'Generic', 'TX-ACC-NANO', '<p>Accsoon CineView Nano — What’s Included</p>
<p>• HDMI cable × 1</p>
<p>• Magic arm × 1</p>
<p>• NP-F550 battery × 1</p><p>The Accsoon CineView Nano is a compact wireless HDMI video transmitter that lets you send your camera’s live video to up to four smartphones or tablets (iOS/Android) over 5 GHz Wi-Fi for up to ~500 ft (150 m) with very low latency (~60 ms). </p>', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '8b7192e4-fe23-4499-981f-16fa2210f17c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '87857a1e-19a7-46d6-a38d-773d4465e1af') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001015', 'Accsoon cineview Sdi 2', 'Generic', 'VID-TX-RX-CVSDI2-ACC', '<p>Accsoon CineView 2 SDI — What’s Included&nbsp;</p>
<p>• Transmitter × 1</p>
<p>• Receiver × 1</p>
<p>• NP-F batteries × 4</p>
<p>• HDMI cables × 2</p>
<p>• Magic arms × 2</p>
<p></p>', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '87857a1e-19a7-46d6-a38d-773d4465e1af', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7eea3dfe-f379-4537-b940-459b9da9b9c9') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001016', 'Accsoon Cineviw SDI 2 Transmitter(TX)', 'Generic', 'ACC-CINEVIEW-SDI2-TX', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '7eea3dfe-f379-4537-b940-459b9da9b9c9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '2d02da7d-c71a-4dae-bfef-1992c4de5d36') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001017', 'Accsoon CoMo 7/9-Set Headset Intercom - 9', 'Generic', 'ACCSOON_COMO_9_SET_HEADSET_INTERCO', '', 4000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '2d02da7d-c71a-4dae-bfef-1992c4de5d36', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'aebea6ea-e967-4f37-9421-256d10fe0cd7') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001018', 'Accsoon CoMo SE 5-Person Intercom System (Grade B)', 'Generic', 'AUD-COM-COMOSE5-ACC', '<p>What’s Included:</p>
<p>• 1 × Host headset</p>
<p>• 4 × Remote headsets</p>
<p>• Rechargeable batteries (one per headset)</p>
<p>• Battery charger</p>
<p>• Storage boxes &amp; accessories (ear cushions, windscreens, bags) &nbsp;</p>
<p></p>', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'aebea6ea-e967-4f37-9421-256d10fe0cd7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '28590ee0-eef6-48b7-9a85-8559c8e9dcb7') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001019', 'Amaran 200d S LED Video Light', 'Generic', 'LGT-AM200D', '<p>Amaran 200d S — What’s Included:</p>
<p>• Amaran 200d S LED light</p>
<p>• Hyper reflector (Bowens)</p>
<p>• AC power supply &amp; cable</p>
<p>• Carrying case</p>
<p>• 65 cm Softbox</p>
<p>• C-Stand</p>
<p>• Socket / Multiplug</p>
<p></p>', 1000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '28590ee0-eef6-48b7-9a85-8559c8e9dcb7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '57cd9180-ffb8-454c-8104-76c3694a743c') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001020', 'Amaran 300c ', 'Generic', 'LGT-AM300C', '<p>Amaran 300c — What’s Included<br>• Amaran 300c LED light<br>• Hyper reflector (Bowens)<br>• AC power supply &amp; cable<br>• Carrying case<br>• 90 cm Softbox<br>• C-Stand<br>• Socket / Multiplug</p>', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '57cd9180-ffb8-454c-8104-76c3694a743c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8f8bb183-d8dc-420a-86dc-9cb0191da308') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001021', 'Amaran 60d S', 'Generic', 'LGT-60DS-AMR', '<p>What’s Included:<br>• Amaran 60d S LED light<br>• Bowens mount reflector<br>• AC power supply &amp; cable<br>• Carrying bag / pouch</p>', 700, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '8f8bb183-d8dc-420a-86dc-9cb0191da308', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '6ab67b4d-580e-4eee-95cc-d3aa2889dcab') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001022', 'Amaran F22c Light', 'Generic', 'LGT-F22C-AMR', '<p>What’s Included:</p>
<p>• Amaran F22c RGBWW LED Light</p>
<p>• Power Adapter &amp; Cable</p>
<p>• Carrying Bag</p>
<p>• C-Stand (D)</p>
<p>• Socket / Multiplug</p>
<p></p>', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '6ab67b4d-580e-4eee-95cc-d3aa2889dcab', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'c2f45ee7-0a30-4018-9dc5-5ff84bb0c1d9') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001023', 'Amaran PT2c RGBWW LED Pixel Tube Light', 'Generic', 'AMARAN_PT2C_RGBWW_LED_PIXEL_TUBE_LIGHT', '', 750, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'c2f45ee7-0a30-4018-9dc5-5ff84bb0c1d9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '872ac51a-3dbc-4675-bfb3-898e2dcf8a4b') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001024', 'Amaran PT4c RGBWW LED Pixel Tube Light', 'Generic', 'AMARAN_PT4C_RGBWW_LED_PIXEL_TUBE_LIGHT', '', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '872ac51a-3dbc-4675-bfb3-898e2dcf8a4b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '3a0323d2-14c6-4b23-91c7-2b812883a87e') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001025', 'Amaran T2C RGBWW LED Tube Light 25W (2ft)', 'Generic', 'LGT-TUBE2FT', '<p>What’s Included:</p>
<p>• Amaran T2C RGBWW LED Tube Light (2 ft) × 1</p>
<p>• Power adapter &amp; cable × 1</p>
<p>• Tube mounts / clips × 2</p>
<p>• Safety cable / lanyard × 1</p>
<p>• Carry pouch / storage bag × 1</p>
<p></p>', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '3a0323d2-14c6-4b23-91c7-2b812883a87e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'faff66a3-a2c2-4e7a-95bd-a74f98f377fa') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001026', 'Amaran T4C RGBWW LED Tube Light', 'Generic', 'LGT-TUB-T4C-AMR', '<p></p>What’s Included:<br>• Amaran T4C RGBWW LED Tube Light<br>• Power Adapter<br>• Power Cable<br>• Storage Bag / Case<p></p>', 1000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'faff66a3-a2c2-4e7a-95bd-a74f98f377fa', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a471cce0-e85a-420b-aed8-aa5ffa5f2d7f') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001027', 'Angelbird 1TB AV PRO SE CFexpress v4 Type B Memory Card', 'Generic', 'CFX-B-1TB-ANG', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a471cce0-e85a-420b-aed8-aa5ffa5f2d7f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'fac690ec-8e5d-4590-a8ff-e81f02c70471') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001028', 'Aperture LS 1200x light', 'Generic', 'APURTURE-1200X-LIGHT', '<p>The Aperture LS 1200x is a powerful LED light fixture designed for professional film, photography, and event production. With its bright 1200-watt output and daylight-balanced color temperature, it delivers consistent, flicker-free illumination for any creative project.</p><br><strong>Product Details:</strong><ul><li>Output: 1200W LED</li><li>Color Temperature: 5600K daylight</li><li>Dimensions: 24" x 18" x 4"</li><li>Weight: 8 lbs</li><li>Materials: Aluminum housing with tempered glass</li><li>Includes: Power cable, mounting bracket, diffusion panel</li></ul>', 4000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'fac690ec-8e5d-4590-a8ff-e81f02c70471', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'fae2d985-62c2-4241-b341-f21248135f24') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001029', 'Aperture LS 600x light', 'Generic', 'LGT-600X-APU', '<p>What’s Included:<br>• Aputure LS 600x Light<br>• Control Box<br>• Power Cable<br>• Head Cable<br>• Reflector<br>• 120cm Softbox<br>• Jumbo Stand<br>• Socket<br>• Sand Bag<br>• Bowens Mount Cap<br>• Clamp / Controller Clamp<br>• Carrying Case</p>', 3000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'fae2d985-62c2-4241-b341-f21248135f24', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'b4405ee5-3632-4a5e-84e2-066be6441b46') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001030', 'Aputure 400x', 'Generic', 'Aputure 400x', '', 2500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'b4405ee5-3632-4a5e-84e2-066be6441b46', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8d0d1ea2-8de2-4dc9-8be4-04639791fadf') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001031', 'Aputure MC Pro RGB LED Light Panel (Production 8-Light Kit)', 'Generic', 'LGT-MCPRO-APU-KIT8', '', 2500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '8d0d1ea2-8de2-4dc9-8be4-04639791fadf', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '19115b6b-c79a-4539-8e72-b13069b275a5') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001032', 'Arm Rod', 'Generic', 'ARM-ROD', '', 0, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '19115b6b-c79a-4539-8e72-b13069b275a5', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e8af9c60-2a3e-417d-b410-c5024b035e42') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001033', 'Atomos Ninja V+ Kit', 'Generic', 'MON-REC-NV+-ATM-KIT', '', 2500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'e8af9c60-2a3e-417d-b410-c5024b035e42', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '56970926-76fb-403c-ac07-6f75155446e1') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001034', 'Baby boom stand', 'Generic', 'Baby boom stand', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '56970926-76fb-403c-ac07-6f75155446e1', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a3ae6748-df8a-410d-8e88-68bba61a57e2') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001035', 'Blazar Great Joy 1.8x T2.9 Anamorphic lens set (PL) ', 'Generic', 'LEN-BLZ-GREATJOY-SET', '<p>What’s Included:</p>
<p>• 35 mm T2.9 Anamorphic Lens</p>
<p>• 50 mm T2.9 Anamorphic Lens</p>
<p>• 85 mm T2.9 Anamorphic Lens</p>
<p>• Front &amp; Rear Lens Caps</p>
<p>• Lens Case / Carrying Case</p>', 5000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a3ae6748-df8a-410d-8e88-68bba61a57e2', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e5e6965a-62f4-4c25-b1c5-659d323a6315') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001036', 'BLAZAR LENS MANTIS 1.33x Anamorphic 5-Lens Set (ARRI PL)', 'Generic', 'LEN-MANTIS-SET-BLZ', '<p>What’s Included:<br>• Blazar Mantis Anamorphic Lens Set<br>• 25mm Lens<br>• 35mm Lens<br>• 50mm Lens<br>• 75mm Lens<br>• 100mm Lens<br>• Front Lens Caps<br>• Rear Lens Caps<br>• Main Storage Case</p>', 7000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'e5e6965a-62f4-4c25-b1c5-659d323a6315', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '9cac09a6-357b-4dab-b91b-2424fb818f1a') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001037', 'Camera Caretaker ', 'Generic', 'CAMERA-CARETAKER', '', 2000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '9cac09a6-357b-4dab-b91b-2424fb818f1a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'aa174f09-8324-4496-bb52-01ecfa9eaa63') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001038', 'Camera Caretaker - Contact no. 9712052572 (Sunil Lama)', 'Generic', 'Camera Caretaker - Contact no. 9712052572 (Sunil Lama)', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'aa174f09-8324-4496-bb52-01ecfa9eaa63', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '269e3020-27d8-45ae-9591-996dda5fb3b3') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001039', 'Camera Caretaker - Contact no. 9712052574 (Aryan Chaudhary)', 'Generic', 'Camera Caretaker - Contact no. 9712052574 (Aryan Chaudhary)', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '269e3020-27d8-45ae-9591-996dda5fb3b3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7bd28208-35e5-4de8-9963-7758f2b14188') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001040', 'Camera Caretaker - Contact no. 9748249945 (Shisir Parkhi)', 'Generic', 'Camera Caretaker - Contact no. 9748249945 (Shisir Parkhi)', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '7bd28208-35e5-4de8-9963-7758f2b14188', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'bab0d6aa-d904-4f27-b903-e200f5fd4815') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001041', 'Camera Caretaker - Contact no. 9820418147 (Pratik Puri)', 'Generic', 'Camera Caretaker - Contact no. 9820418147 (Pratik Puri)', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'bab0d6aa-d904-4f27-b903-e200f5fd4815', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7e7a9fcd-ca81-4cc4-8e1f-b765136af3a8') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001042', 'Came TV Hydraulic Suspension Car Rig', 'Generic', 'Came TV Hydraulic Suspension Car Rig', '', 3500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '7e7a9fcd-ca81-4cc4-8e1f-b765136af3a8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '4d3cbc55-2e59-473c-80fe-41615b5564fa') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001043', 'Canon Mount Adapter EF-EOS R', 'Generic', 'CAN-EF-EOSR-ADP', '', 1000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '4d3cbc55-2e59-473c-80fe-41615b5564fa', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a72afbb5-a98e-45fc-8ed0-e8f0cae3e779') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001044', 'CFast 512GB Memory Card (RED)', 'Generic', 'CFS-512GB-RED', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a72afbb5-a98e-45fc-8ed0-e8f0cae3e779', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'eb5dc279-c511-47c5-aedd-57a94051500c') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001045', 'CFast Card Reader', 'Generic', 'CFS-REA', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'eb5dc279-c511-47c5-aedd-57a94051500c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'ece10e12-dbda-43fc-9bd2-34d5d76041f0') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001046', 'CFexpress Type B 1TB card (RED)', 'Generic', 'CFX-B-1TB-RED', '', 1500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'ece10e12-dbda-43fc-9bd2-34d5d76041f0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'b23aa65a-e268-41f9-87c2-791a485aa23c') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001047', 'CF express Type B Card Reader ', 'Generic', 'CFX-B-REA', '', 500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'b23aa65a-e268-41f9-87c2-791a485aa23c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '3fb02af4-c5ae-41dd-9f76-7fe9db2f3802') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001048', 'CFexpress Type B Card Reader', 'Generic', 'CFX-B-REA', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '3fb02af4-c5ae-41dd-9f76-7fe9db2f3802', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '752c7c5c-625d-4e0f-aced-2fdf5e901d64') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001049', 'CHIOPT XTREME Zoom Lens 28–85mm T3.2', 'Generic', 'CHP-LNS-28-85MM', '', 5000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '752c7c5c-625d-4e0f-aced-2fdf5e901d64', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '432371b6-4732-4888-9ce0-94170746b759') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001050', 'CHIOPT XTREME Zoom Lens 75–250mm T3.2', 'Generic', 'CHP-LNS-75-250MM', '', 5000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '432371b6-4732-4888-9ce0-94170746b759', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'feb076dd-6d95-429a-9097-a1f97575b11c') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001051', 'Clap Board', 'Generic', 'Clap Board', '<p>A clap board, also known as a film slate, is an essential tool used in film and video production to mark scenes and synchronize audio with video during editing. The clap sound created when the slate closes provides a clear reference point for syncing footage and sound recordings.</p>

<p>Clap boards are commonly used by assistant directors and camera crews to organize scenes, shots, and takes during production. The writable surface allows quick updates for each shot, helping maintain accurate records throughout the shoot.</p>

<p>Ideal for film productions, commercials, music videos, documentaries, and professional video shoots.</p>




<p><b>What’s Included</b></p>


<ul>
<li>Production Clap Board / Film Slate</li>
</ul>', 500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'feb076dd-6d95-429a-9097-a1f97575b11c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '6b57befd-d3f9-47f4-a705-804ec176ed8b') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001052', 'C stand  - Cstand Flag set', 'Generic', 'C stand  - Cstand Flag set', '', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '6b57befd-d3f9-47f4-a705-804ec176ed8b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7b6759dd-cf17-42ec-bbfe-75dfe2bc1b9a') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001053', 'C stand  - Double height ', 'Generic', 'C stand  - Double height ', '', 250, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '7b6759dd-cf17-42ec-bbfe-75dfe2bc1b9a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e6ea3984-b29a-4264-9443-0829a8c54a42') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001054', 'C stand  - Triple height ', 'Generic', 'C stand  - Triple height ', '', 300, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'e6ea3984-b29a-4264-9443-0829a8c54a42', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '75b2ba02-bad4-4cba-8551-59641d857222') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001055', 'Dana Dolly NS-50 Slider System', 'Generic', 'Dana Dolly NS-50 Slider System', '<p>What’s Included:<br>• Dana Dolly Platform<br>• 4x &nbsp;Wheel Trucks<br>• 10x 2ft Rods / Rails<br>• 8x Rod Sockets<br>• Pipe / Rail Support Brackets<br>• Center Plate / Camera Mount<br>• Carrying Case</p>', 3000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '75b2ba02-bad4-4cba-8551-59641d857222', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8095ebef-eb51-4577-a45e-b21184222326') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001056', 'Desview Blade 5 Pro', 'Generic', 'MON-BLADE5PRO-DSV', '<p>What’s Included:<br>• Desview blade OLED 5.5″ Monitor<br>• HDMI Cable<br>• Sun Hood&nbsp;<br>• Monitor Mount / Magic Arm<br>• Power Cable / Batteries (NP-F)x2<br>• Carrying Pouch</p>', 1500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '8095ebef-eb51-4577-a45e-b21184222326', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'f75a5668-f6ae-48ee-b1b3-89e6d0756ead') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001057', 'Desview OLED Director Monitor  - 14 Inch', 'Generic', 'DESVIEW_OLED_INCH_DIRECTOR_MONITOR', '<p><b>Desview OLED Director Monitor Kit with Wireless Video</b></p>
<p>The Desview &nbsp;OLED Director Monitor Kit is a professional monitoring solution designed for directors, DITs, and video village setups. The high-quality OLED display provides excellent color accuracy, deep contrast, and clear image detail, making it ideal for critical on-set monitoring.</p>
<p>This kit includes an Accsoon wireless video system, allowing directors and crew to monitor the camera feed remotely without cables. Powered by V-Mount batteries, the setup offers reliable and portable power for long shooting days.</p>
<p>To make setup easier on set, the kit also includes 3″ magic arms for securely mounting the wireless receiver or accessories to the monitor case.</p>
<p>Compact, durable, and easy to deploy, this director monitor kit is perfect for commercial shoots, documentaries, film productions, and multi-camera setups.</p>
<p><b>What’s Included</b></p>
<ul>
<li>Desview OLED Director Monitor</li>
<li>2× 99Wh V-Mount Batteries</li>
<li>1× V-Mount Battery Charger</li>
</ul>', 2500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'f75a5668-f6ae-48ee-b1b3-89e6d0756ead', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '52c58901-f697-4087-847d-2c0f82be2b07') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001058', 'Desview OLED Director Monitor  - 16 Inch', 'Generic', 'Desview OLED Director Monitor  - 16 Inch', '<p><b>Desview OLED Director Monitor Kit with Wireless Video</b></p>
<p>The Desview &nbsp;OLED Director Monitor Kit is a professional monitoring solution designed for directors, DITs, and video village setups. The high-quality OLED display provides excellent color accuracy, deep contrast, and clear image detail, making it ideal for critical on-set monitoring.</p>
<p>This kit includes an Accsoon wireless video system, allowing directors and crew to monitor the camera feed remotely without cables. Powered by V-Mount batteries, the setup offers reliable and portable power for long shooting days.</p>
<p>To make setup easier on set, the kit also includes 3″ magic arms for securely mounting the wireless receiver or accessories to the monitor case.</p>
<p>Compact, durable, and easy to deploy, this director monitor kit is perfect for commercial shoots, documentaries, film productions, and multi-camera setups.</p>
<p><b>What’s Included</b></p>
<ul>
<li>Desview OLED Director Monitor</li>
<li>2× 99Wh V-Mount Batteries</li>
<li>1× V-Mount Battery Charger</li>
</ul>', 3000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '52c58901-f697-4087-847d-2c0f82be2b07', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'ddaa2fcf-3474-46d1-8ae2-5b29f924dd5a') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001059', 'Desview S14-HDR 14″ Director Monitor Kit (Wireless Video + V-Mount Battery)', 'Generic', 'MON-S14HDR-DSV-KIT', '', 2500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'ddaa2fcf-3474-46d1-8ae2-5b29f924dd5a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'f0e43838-02b7-44c2-a51c-4ca38be680f2') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001060', 'Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") - Desview S14-HDR 14″', 'Generic', 'Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") - Desview S14-HDR 14″', '', 2500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'f0e43838-02b7-44c2-a51c-4ca38be680f2', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '1ca711d2-9392-438c-9bee-2d3e8695835e') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001061', 'Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") -  PortKeys 8″ Monitor', 'Generic', 'Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") -  PortKeys 8″ Monitor', '', 2500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '1ca711d2-9392-438c-9bee-2d3e8695835e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'b810a88a-7810-469b-8301-e138607574ce') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001062', 'Dji Focus pro with Lidar', 'Generic', 'FPRO-LDR-DJI', '<p>What’s Included:<br>• DJI Focus Pro Hand Unit<br>• DJI Focus Pro Motor<br>• DJI LiDAR Range Finder<br>• Motor Rod Mount<br>• Focus Gear Ring<br>• USB-C Cable<br>• Power Cable<br>• Allen Key / Adjustment Tool<br>• Storage Case</p>', 2500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'b810a88a-7810-469b-8301-e138607574ce', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '47bdfbe2-4e5e-4ed1-bd14-6792bcf1da02') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001063', 'Dji High Bright Monitor', 'Generic', 'MON-HBR-DJI', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '47bdfbe2-4e5e-4ed1-bd14-6792bcf1da02', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'c13e73ff-74f2-4b75-821a-a305ad8599f6') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001064', 'Dji Mic Mini', 'Generic', 'Dji Mic Mini', '<p>What’s Included:<br>• DJI Mic Mini Transmitterx2<br>• DJI Mic Mini Receiver<br>• Magnetic Clip<br>• Windscreen<br>• USB-C Charging Cable<br>• 3.5mm Audio Cable<br>• Storage Pouch / Case</p>', 500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'c13e73ff-74f2-4b75-821a-a305ad8599f6', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '499036fe-d75c-479d-8973-d2b35b01b2b3') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001065', 'DJI Osmo Pocket 3 ', 'Generic', 'CAM-OP3-DJI', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '499036fe-d75c-479d-8973-d2b35b01b2b3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'ee85988e-04e0-4ab6-9c39-afc20902b382') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001066', 'DJI Ronin 4D 6K 4-Axis Cinema Camera System (Body Only)', 'Generic', 'CAM-R4D6K-DJI', '<p></p>
<p><b>Overview</b></p>
<p></p>

<p>The DJI Ronin 4D is an all-in-one cinema camera system that combines a full-frame camera, 4-axis stabilization, LiDAR focusing, and wireless video transmission into a single compact unit. Designed for professional filmmaking, it delivers exceptionally smooth camera movement and high-end image quality without the need for complex rigging.</p>

<p>Ideal for dynamic handheld shots, tracking scenes, vehicle work, and cinematic productions.</p>




<p><b>Key Features</b></p>


<ul>
<li>Integrated 4-Axis Stabilization System</li>
<li>Full-Frame Zenmuse X9 Cinema Camera</li>
<li>Advanced LiDAR Focus System</li>
<li>Modular design for professional workflows</li>
</ul>





<p><b>What’s Included</b></p>


<ul>
<li>DJI Ronin 4D Main Body</li>
<li>Zenmuse X9 Camera Module</li>
<li>DL Mount (Lens Mount) or&nbsp;</li>
<li>High-Bright Main body Monitor</li>
<li>Top Handle &amp; Hand Grips</li>
<li>4x V Mount Battery</li>
<li>V mount Battery Charger</li>
<li>Power Adapter &amp; Cables</li>
<li>Carrying Case</li>
</ul>





<p><b>Compatible With</b></p>


<p>Lenses</p>

<ul>
<li>DJI DL Mount Lenses</li>
<li>PL Mount Lenses (with adapter)</li>
<li>E mount Lenses(with adapter)</li>
</ul>


<p>Use Cases</p>

<ul>
<li>Commercial filmmaking</li><li>Advertisement</li><li>Music Video</li>
<li>Narrative films</li>
<li>Action sequences</li>
<li>Documentaries</li>
<li>Vehicle &amp; gimbal shots</li>
</ul>', 13000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'ee85988e-04e0-4ab6-9c39-afc20902b382', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '3a6b6d9d-0e08-4715-88e9-ade5644fee26') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001067', 'DJI Ronin 4D Flex Cable ', 'Generic', 'FLX-CBL-4D-DJI', '<p>What’s Included:<br>• DJI Flex Cable<br>• Front Cap<br>• Rear Cap<br>• Storage Pouch / Zip Bag</p>', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '3a6b6d9d-0e08-4715-88e9-ade5644fee26', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'efd165c5-e278-4e83-b45f-191f4babfad5') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001068', 'DJI RS 3 Gimbal', 'Generic', 'GMB-RS3-DJI', '<p>What’s Included:<br>• DJI RS 3 Gimbal<br>• Tripod/Foot<br>• Camera Riser<br>• Quick-Release Plate<br>• Battery <br>• Storage Pouch / Case</p>', 1250, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'efd165c5-e278-4e83-b45f-191f4babfad5', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '2919876f-71e4-4d8a-a2cc-13f8c50244ca') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001069', 'DJI RS 4 Pro', 'Generic', 'GMB-RS4P-DJI', '<p>What’s Included:<br>• DJI RS 4 Pro Gimbal<br>• Tripod/Foot<br>• Camera Riser<br>• Quick-Release Plate<br>• Battery <br>• Storage Pouch / Case</p>', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '2919876f-71e4-4d8a-a2cc-13f8c50244ca', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'f396fd7f-1d4e-41c8-bda7-6a6bda5e33c8') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001070', 'DJI RS 5 / RS 5 Combo - DJI RS 5', 'Generic', 'DJI RS 5 / RS 5 Combo - DJI RS 5', '<p>What’s Included:<br>• DJI RS 5 Gimbal<br>• Tripod/Foot<br>• Camera Riser<br>• Quick-Release Plate<br>• Battery<br>• Storage Pouch / Case<br>If comobo : RS5 smart handle</p>', 1500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'f396fd7f-1d4e-41c8-bda7-6a6bda5e33c8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a577c664-cdfc-427e-b2ea-9ba3473335e1') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001071', 'DJI RS 5 / RS 5 Combo - DJI RS 5 Combo', 'Generic', 'DJI RS 5 / RS 5 Combo - DJI RS 5 Combo', '<p>What’s Included:<br>• DJI RS 5 Gimbal<br>• Tripod/Foot<br>• Camera Riser<br>• Quick-Release Plate<br>• Battery<br>• Storage Pouch / Case<br>If comobo : RS5 smart handle</p>', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a577c664-cdfc-427e-b2ea-9ba3473335e1', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '90e6d398-3583-4b43-9d9c-fe3c5d24226c') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001072', 'DJI SDR TRANSMISSION COMBO', 'Generic', 'DJI SDR TRANSMISSION COMBO', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '90e6d398-3583-4b43-9d9c-fe3c5d24226c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '3366d2e0-04ca-42a9-b2fe-6e2dee6f2300') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001073', 'D-tap Charger', 'Generic', 'D-TAP-CHRG', '', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '3366d2e0-04ca-42a9-b2fe-6e2dee6f2300', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'b07a5f7e-f268-41a0-9e55-fd25899e8c54') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001074', 'D tap to 12v DC cable', 'Generic', 'DTP-12V-DC', '', 0, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'b07a5f7e-f268-41a0-9e55-fd25899e8c54', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '67b71ce0-5abe-4473-a96e-f7874e881bec') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001075', 'Easy rig', 'Generic', 'EASY-RIG', '<p>What’s Included:<br>• Easyrig&nbsp;<br>• Support Vest<br>• Support Arm<br>• Camera Hook<br>• Carrying Bag / Case<br><br></p>', 2500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '67b71ce0-5abe-4473-a96e-f7874e881bec', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '3dc927d6-8627-47c4-b210-3ceeb9722b38') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001076', 'Easyrig minimax', 'Generic', 'Easyrig minimax', '<p>What’s Included:<br>• Easyrig MiniMax<br>• Support Vest<br>• Support Arm<br>• Camera Hook<br>• Carrying Bag / Case<br><br></p>', 3000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '3dc927d6-8627-47c4-b210-3ceeb9722b38', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e7a075b7-13c8-41ed-972f-a4e8f43239e8') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001077', 'E image 3 gear tripod', 'Generic', 'E image 3 gear tripod', '', 1000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'e7a075b7-13c8-41ed-972f-a4e8f43239e8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7138a261-7cdd-496d-9bcf-37509cb3bc74') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001078', 'FB 310Whr Vmount battery', 'Generic', 'V-MOUNT-310-FB', '', 1000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '7138a261-7cdd-496d-9bcf-37509cb3bc74', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '48a52682-dae3-492d-bc3f-e68f731d58a6') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001079', 'Feelworld 5.5-inch Monitor', 'Generic', 'MON-5.5-FWL', '<p>What’s Included:<br>• Feelworld 5.5″ Monitor<br>• HDMI Cable<br>• Sun Hood <br>• Monitor Mount / Magic Arm<br>• Power Cable / Batteries (NP-F)x2<br>• Carrying Pouch</p>', 500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '48a52682-dae3-492d-bc3f-e68f731d58a6', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'c5eb2876-b4dc-4f56-8454-3c88acc0a75e') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001080', 'Fog Machine  - 1300 Watt', 'Generic', 'Fog Machine  - 1300 Watt', '', 1000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'c5eb2876-b4dc-4f56-8454-3c88acc0a75e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '0dc07857-abc5-4ba3-9135-3b859c95a291') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001081', 'Fog Machine  - 1500 Watt', 'Generic', 'Fog Machine  - 1500 Watt', '', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '0dc07857-abc5-4ba3-9135-3b859c95a291', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '952b5ea3-c84e-431c-87e2-469c814a034b') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001082', 'Fog Machine  - 1800 Watt', 'Generic', 'Fog Machine  - 1800 Watt', '', 2000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '952b5ea3-c84e-431c-87e2-469c814a034b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7083e588-a232-4113-9c6f-be5997f81db9') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001083', 'Godox RS60R Kit 2 RGB LED Video Light (2-Light Kit)', 'Generic', 'GDX-RS60R-KIT2', '', 2000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '7083e588-a232-4113-9c6f-be5997f81db9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '56942370-8a1b-41e5-9324-d05777e322d6') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001084', 'Godox SkyTalk Air intercom system - 3 set', 'Generic', 'Godox SkyTalk Air intercom system - 3 set', '', 1250, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '56942370-8a1b-41e5-9324-d05777e322d6', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'aec318e8-e52c-4ce9-86f3-f37ce68ec8de') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001085', 'Godox SkyTalk Air intercom system - 4 set', 'Generic', 'Godox SkyTalk Air intercom system - 4 set', '', 1600, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'aec318e8-e52c-4ce9-86f3-f37ce68ec8de', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '18bb864e-990c-4cfb-ab62-1f61b4f777af') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001086', 'Godox SkyTalk Air intercom system - 5 set', 'Generic', 'Godox SkyTalk Air intercom system - 5 set', '', 2000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '18bb864e-990c-4cfb-ab62-1f61b4f777af', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'd37a02fc-698f-4dc0-9958-adba8ac7665e') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001087', 'Godox V860III Flash for Sony', 'Generic', 'Godox V860III Flash for Sony', '<p>What’s Included:<br>
• Godox V860III Flash<br>
• Li-ion Battery<br>
• Battery Charger<br>
• Diffuser Cap,<br>
• Storage Pouch / Case</p>', 500, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'd37a02fc-698f-4dc0-9958-adba8ac7665e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '72361de4-e28c-4d0c-8a9d-f1964137715c') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001088', 'Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 35mm', 'Generic', 'Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 35mm', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '72361de4-e28c-4d0c-8a9d-f1964137715c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7682528c-83e8-4a04-a08f-ec6723e7028d') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001089', 'Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 50mm', 'Generic', 'Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 50mm', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '7682528c-83e8-4a04-a08f-ec6723e7028d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'ab474815-88fd-4acb-ae12-7b69441c183a') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001090', 'Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 85mm', 'Generic', 'Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 85mm', '', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'ab474815-88fd-4acb-ae12-7b69441c183a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'afa51c3c-51ee-4b5b-bf35-928b17b81d9f') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001091', 'Grip Head', 'Generic', 'GRIP-HEAD', '<p>What’s Included:</p>
<p>• Grip Head</p>', 100, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'afa51c3c-51ee-4b5b-bf35-928b17b81d9f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '582c8729-6475-4ca4-ae2e-08c3bc62e17b') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001092', 'HDMI to HDMI Cable (SmallRig) - 35cm', 'Generic', 'HDMI to HDMI Cable (SmallRig) - 35cm', '', 0, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '582c8729-6475-4ca4-ae2e-08c3bc62e17b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'b37dbc86-a12c-4489-a3d9-ca520aec08dd') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001093', 'HDMI to HDMI Cable (SmallRig) - 55cm', 'Generic', 'HDMI to HDMI Cable (SmallRig) - 55cm', '', 0, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'b37dbc86-a12c-4489-a3d9-ca520aec08dd', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a0250a1f-7c96-4c85-8d18-13f4953f7a35') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001094', 'Hollyland 8 person comset', 'Generic', 'COM-8P-HOL', '<p>What’s Included:<br>• Hollyland 8-Person Comms Set<br>• 8x Wireless Headsets<br>• Charging Case / Charging Dock<br>• 16x Batteries<br>• Power Adapter<br>• Storage Case</p>', 3500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a0250a1f-7c96-4c85-8d18-13f4953f7a35', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a03374b2-3cd0-45fb-8ff0-ac0926377bee') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001095', 'Hollyland cosmo C1 wireless video transmitter', 'Generic', 'TRN-C1-HOL-KIT', '', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a03374b2-3cd0-45fb-8ff0-ac0926377bee', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '1279a96a-5813-482c-947e-5bc01199a7c4') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001096', 'Honda EU22i Inverter Generator (2200VA)', 'Generic', 'Honda EU22i Inverter Generator (2200VA)', '<p>What’s Included:<br>• Honda EU22i Inverter Generator<br>• Power Cable<br>• Extension Cable<br>• Fuel Cap<br>• Oil Cap<br>• Pull Starter Handle<br>• Carry Handle</p>', 2000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '1279a96a-5813-482c-947e-5bc01199a7c4', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a3e5ecc1-37f5-4599-89ee-312464ad140d') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001097', 'Insta360 X5 8K 360° Action Camera', 'Generic', 'CAM-X5-INS', '<p><b>What’s Included</b></p>


<ul>
<li>Insta360 X5 Camera</li>
<li>Rechargeable Battery</li>
<li>USB-C Charging Cable</li>
<li>128 GB sandisk MicroSd Card</li>
<li>Carry Pouch</li><li>Invisible Stick</li><li>Tri-stick&nbsp;</li>
</ul>





<p><br><b>Good For</b></p>


<ul>
<li>Travel vlogging</li>
<li>Action sports</li>
<li>Documentary footage</li>
<li>Social media content</li>
<li>Creative cinematic shots</li>
</ul>
<p></p>
<p></p>', 3000, 'Serialised', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'a3e5ecc1-37f5-4599-89ee-312464ad140d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '3c6493ce-d0c5-4bfc-ac36-08785a0da8ca') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001098', 'JF DigitalFoto IRON-C100S + IRON-C100G Magic Arm & Super Clamp Combo Kit', 'Generic', 'JFDF-IRON-C100S-C100G', '', 1500, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '3c6493ce-d0c5-4bfc-ac36-08785a0da8ca', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '44f9b5e6-2d68-482d-aa2d-3be8a966423d') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001099', 'Jib Operator ', 'Generic', 'JIB-OPERATOR', '', 3000, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '44f9b5e6-2d68-482d-aa2d-3be8a966423d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'd455e352-d231-4288-aed1-3b106989ee01') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, 'EQ001100', 'Jumbo Stand  - Double Height ', 'Generic', 'Jumbo Stand  - Double Height ', '', 0, 'Quantity', 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', 'd455e352-d231-4288-aed1-3b106989ee01', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '7385d2d4-7c27-4816-af3d-dc4de44463cb') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1001', 'Foton Films', NULL, '+977981101001', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '7385d2d4-7c27-4816-af3d-dc4de44463cb', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '174ef22d-de13-47fe-8d07-0a46252a6bf3') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1002', 'Yogesh', NULL, '+977981101002', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '174ef22d-de13-47fe-8d07-0a46252a6bf3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '26c9a58b-f341-4657-b9ef-b5b156bdb283') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1003', 'Samrat Bhandari', 'samratbhandari112@gmail.com', '+977981101003', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '26c9a58b-f341-4657-b9ef-b5b156bdb283', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '50d69ac7-88e8-4675-bbbc-b409d2cbd456') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1004', 'Saphal Ganejoo', NULL, '+977981101004', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '50d69ac7-88e8-4675-bbbc-b409d2cbd456', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '62c337ce-72b6-4e81-b7ff-7a85d0a04532') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1005', 'Rachit Shrestha', NULL, '+977981101005', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '62c337ce-72b6-4e81-b7ff-7a85d0a04532', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'f00813e8-ed46-4407-9bc6-af0d4fe07ccd') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1006', 'Prashant Adhikari', NULL, '+977981101006', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'f00813e8-ed46-4407-9bc6-af0d4fe07ccd', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '14ddc972-b6b8-458e-b856-9e0b142ff03d') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1007', 'Magan Entertainment', 'maganentertainment22@gmail.com', '+977981101007', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '14ddc972-b6b8-458e-b856-9e0b142ff03d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'b2f62664-88da-47d5-a6b3-236d28c7db77') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1008', 'Kusang', 'thykusang@gmail.com', '+977981101008', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'b2f62664-88da-47d5-a6b3-236d28c7db77', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'ec3a452a-2a35-4089-b25d-2b8dbb250ef0') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1009', 'Samrat Maharjan', 'its.selex@gmail.com', '+977981101009', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'ec3a452a-2a35-4089-b25d-2b8dbb250ef0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4065f51d-b204-476b-9d3b-3c62ddbeafe8') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1010', 'Bishal', 'sbishal270@gmail.com', '+977981101010', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '4065f51d-b204-476b-9d3b-3c62ddbeafe8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '1e74de60-f34d-428b-95e3-7324b7db87ef') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1011', 'Babin Dulal', 'babindulal7@gmail.com', '+977981101011', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '1e74de60-f34d-428b-95e3-7324b7db87ef', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4e7bd146-e2f2-4791-b802-b004a9343ac9') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1012', 'Prashant Yogi', 'uvwxyogi@gmail.com', '+977981101012', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '4e7bd146-e2f2-4791-b802-b004a9343ac9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '042468b7-fe07-4e7b-9d3c-c64dbe8385be') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1013', 'Milan Boaluffy777', NULL, '+977981101013', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '042468b7-fe07-4e7b-9d3c-c64dbe8385be', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a1287182-ef93-47d9-bd54-44e7c6db092f') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1014', 'Rojin Pathak', 'thealchemist692@gmail.com', '+977981101014', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'a1287182-ef93-47d9-bd54-44e7c6db092f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '26b741ff-acdc-4315-900a-05fa4cd41b3f') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1015', 'Dikesh Khadgi Shahi', NULL, '+977981101015', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '26b741ff-acdc-4315-900a-05fa4cd41b3f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a28df6fb-3ec6-44cc-9026-97504898223a') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1016', 'Abin Shakya', 'abinshakya502@gmail.com', '+977981101016', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'a28df6fb-3ec6-44cc-9026-97504898223a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '713b0cd9-d4a9-49aa-b36d-371cef06e680') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1017', 'Fumu The Maker', NULL, '+977981101017', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '713b0cd9-d4a9-49aa-b36d-371cef06e680', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '849e4396-2c34-4e1a-85ff-9348a81dfd5d') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1018', 'Ujjal Joshi', NULL, '+977981101018', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '849e4396-2c34-4e1a-85ff-9348a81dfd5d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'faad02f6-8b08-4dc9-9d0f-1d288aad03de') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1019', 'Manoj Rajbhandari', NULL, '+977981101019', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'faad02f6-8b08-4dc9-9d0f-1d288aad03de', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '70733707-46be-402b-a096-9fdf985c76c6') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1020', 'Shekhar Karki', 'shekharkarki687@gmail.com', '+977981101020', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '70733707-46be-402b-a096-9fdf985c76c6', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4e9e5ccc-96c0-43bd-a947-38f51e6853aa') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1021', 'Yaken Ak', NULL, '+977981101021', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '4e9e5ccc-96c0-43bd-a947-38f51e6853aa', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4aa3af31-b56c-41e3-9389-d17aeef466f3') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1022', 'Prasanna', 'prashnnakunwar32@gmail.com', '+977981101022', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '4aa3af31-b56c-41e3-9389-d17aeef466f3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '50a643ea-5e32-4118-9f00-00b34bb843a5') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1023', 'Pana Films', NULL, '+977981101023', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '50a643ea-5e32-4118-9f00-00b34bb843a5', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'dfc20e63-7e20-41c7-9f31-09d8e59382a8') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1024', 'Saurav Lamichane', 'sauravlamichhane22@gmail.com', '+977981101024', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'dfc20e63-7e20-41c7-9f31-09d8e59382a8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '3440a7eb-47f3-48e5-80ad-5b89fcc6848a') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1025', 'Prabin Rawat', 'prabinrawat@gmail.com', '+977981101025', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '3440a7eb-47f3-48e5-80ad-5b89fcc6848a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'bf40d252-c723-458d-bfb8-689e83a79d0b') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1026', 'Pujan Lama', NULL, '+977981101026', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'bf40d252-c723-458d-bfb8-689e83a79d0b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '53668dcc-88c6-4bc6-bfde-f1d19b8b11b3') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1027', 'Sarad Mahato', 'visualsbysarad@gmail.com', '+977981101027', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '53668dcc-88c6-4bc6-bfde-f1d19b8b11b3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '58f0266e-0fff-4929-813c-4d7a1b8b64f1') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1028', 'Envelope Collective', 'envelopeweddings@gmail.com', '+977981101028', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '58f0266e-0fff-4929-813c-4d7a1b8b64f1', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'da6b7f17-b8d6-4995-b84a-a4e7f041077e') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1029', 'Pana Weddings', NULL, '+977981101029', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'da6b7f17-b8d6-4995-b84a-a4e7f041077e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '88beb37c-f6da-4159-bba3-93664a7e8a48') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1030', 'Shyam khadka', 'shyamkhadka1987@gmail.com', '+977981101030', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '88beb37c-f6da-4159-bba3-93664a7e8a48', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '7b7bd173-fecf-4667-a75d-2b7ba246f7e0') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1031', 'Chintan Raj Bhandari', NULL, '+977981101031', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '7b7bd173-fecf-4667-a75d-2b7ba246f7e0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '72a67d47-154d-4dae-bbc1-edfa477f8ce7') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1032', 'Nakul Sunuwar', 'nakul.snr@gmail.com', '+977981101032', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '72a67d47-154d-4dae-bbc1-edfa477f8ce7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '564c3bf2-6869-4bde-877e-9c39cd8c959c') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1033', 'Amplex Studio', 'amplexphotography@gmail.com', '+977981101033', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '564c3bf2-6869-4bde-877e-9c39cd8c959c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'd281d317-675a-44f1-9cff-31297c83bbcf') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1034', 'Albert', NULL, '+977981101034', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'd281d317-675a-44f1-9cff-31297c83bbcf', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '0b690093-8765-4f41-87fe-3045398f2b72') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1035', 'Aashutosh koirala', 'kaammgmt@gmail.com', '+977981101035', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '0b690093-8765-4f41-87fe-3045398f2b72', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'c0b53427-cf74-4cc2-8e62-721847584f85') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1036', 'Nitesh Khadka', NULL, '+977981101036', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'c0b53427-cf74-4cc2-8e62-721847584f85', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '366f5774-9d43-4b8c-a7b9-69fc6a08b585') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1037', 'Pukar', NULL, '+977981101037', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '366f5774-9d43-4b8c-a7b9-69fc6a08b585', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '64a647d5-3b76-410e-bdfd-b39e09d7239a') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1038', 'Aman', 'aman.verside@gmail.com', '+977981101038', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '64a647d5-3b76-410e-bdfd-b39e09d7239a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '8c265036-1f51-4d64-9bb7-453de28f3f58') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1039', 'Sandesh Thapa Magar', 'sandeshmagar566@gmail.com', '+977981101039', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '8c265036-1f51-4d64-9bb7-453de28f3f58', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '93dadd7a-6f1a-423e-8590-ef6e7d37041f') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1040', 'Birashat Magar', NULL, '+977981101040', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '93dadd7a-6f1a-423e-8590-ef6e7d37041f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '5d6d957b-3a24-4219-8932-59f3ff787b1e') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1041', 'Navin Bogati', 'navinchhettri999@gmail.com', '+977981101041', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '5d6d957b-3a24-4219-8932-59f3ff787b1e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '9d556fd1-4e83-421a-8202-af8a1c7ba2da') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1042', 'Robin', NULL, '+977981101042', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '9d556fd1-4e83-421a-8202-af8a1c7ba2da', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'e1e0849d-8b28-462b-8262-a44a70934bb4') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1043', 'Manoj Raj', 'manose357@gmail.com', '+977981101043', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'e1e0849d-8b28-462b-8262-a44a70934bb4', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '61ca34e7-3e3a-4367-93e5-599e6ce5f16b') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1044', 'Kiran', 'kiranonelama149@gmail.com', '+977981101044', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '61ca34e7-3e3a-4367-93e5-599e6ce5f16b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '7d4b479c-3902-4c18-9eae-b9046952986e') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1045', 'Pratik Puri', 'pratikpuri64@gmail.com', '+977981101045', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '7d4b479c-3902-4c18-9eae-b9046952986e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '0704c7fd-44a4-4e1e-99d3-6d09e6ef9161') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1046', 'Swoyam Manandhar', 'manandharswoyam8@gmail.com', '+977981101046', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '0704c7fd-44a4-4e1e-99d3-6d09e6ef9161', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'cb4ebff4-06b4-4164-b0c9-a4671a8f81c8') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1047', 'Milan Thapa', 'milantp458@gmail.com', '+977981101047', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'cb4ebff4-06b4-4164-b0c9-a4671a8f81c8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'd619c1e5-7cca-4fec-9fc6-489976af6bd1') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1048', 'Mr. Tsering Moktan', 'tseringmok00@gmail.com', '+977981101048', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'd619c1e5-7cca-4fec-9fc6-489976af6bd1', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'e4f38398-75c2-41d1-9968-6558a2feba6f') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1049', 'Gaurab Bhandari', NULL, '+977981101049', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'e4f38398-75c2-41d1-9968-6558a2feba6f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '45a99f2a-7654-4531-b53a-c8a1f633413a') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1050', 'Dijesh Wagle', 'dijeshwagley@gmail.com', '+977981101050', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '45a99f2a-7654-4531-b53a-c8a1f633413a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '7dd1b0cb-2a9c-4cc7-90f2-a639e5c247ee') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1051', 'Aniket Shahi', 'aniket.shahi1818@gmail.com', '+977981101051', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '7dd1b0cb-2a9c-4cc7-90f2-a639e5c247ee', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '1a3af42a-57eb-4c84-a8c3-54467afa2995') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1052', 'Sushant KC', 'mencyguy@gmail.com', '+977981101052', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '1a3af42a-57eb-4c84-a8c3-54467afa2995', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a63f7277-2de2-4a96-8c1d-01b64beb24ab') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1053', 'Sudarsan Khatiwada', NULL, '+977981101053', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'a63f7277-2de2-4a96-8c1d-01b64beb24ab', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '011f49c7-ed89-4d75-ad71-62658e17ac84') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1054', 'Aakash', 'diwas.everestfilm@gmail.com', '+977981101054', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '011f49c7-ed89-4d75-ad71-62658e17ac84', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '30d944e8-6df5-445f-87ee-b83fd01ff0b2') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1055', 'Wedding Tales', 'myweddingtalesnepal@gmail.com', '+977981101055', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '30d944e8-6df5-445f-87ee-b83fd01ff0b2', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '617d645d-173f-43cc-89e8-d1302b09c9e2') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1056', 'G21 Production', NULL, '+977981101056', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '617d645d-173f-43cc-89e8-d1302b09c9e2', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'd7436907-dc88-41bf-9c69-e186a1d0f011') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1057', 'Dheeraj Adhikari', NULL, '+977981101057', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'd7436907-dc88-41bf-9c69-e186a1d0f011', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'e6b63377-d8d4-4c6a-ac44-02cc7566fcff') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1058', 'Saman Maharjan', 'samanmaharjan.info@gmail.com', '+977981101058', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'e6b63377-d8d4-4c6a-ac44-02cc7566fcff', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '2ab16103-13f6-4353-8a1a-334c1858d720') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1059', 'Atish Pokherel', 'jackson.atish525@gmail.com', '+977981101059', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '2ab16103-13f6-4353-8a1a-334c1858d720', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '1febeae2-ef8a-40ca-bf1b-9a9c03cbd8d8') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1060', 'Rajiv', NULL, '+977981101060', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '1febeae2-ef8a-40ca-bf1b-9a9c03cbd8d8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a0faff5a-4d8e-4209-843e-b89365bd7f56') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1061', 'phoenixevents.co', NULL, '+977981101061', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'a0faff5a-4d8e-4209-843e-b89365bd7f56', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a29b6090-5501-4d84-a4c3-1aa6ba06c061') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1062', 'Anupraj Shahi', NULL, '+977981101062', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'a29b6090-5501-4d84-a4c3-1aa6ba06c061', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '0c11d9e9-ae47-4e47-b1c1-46a533bb0758') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1063', 'Diamond Acharya', 'diamondacharya@gmail.com', '+977981101063', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '0c11d9e9-ae47-4e47-b1c1-46a533bb0758', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a5d99be3-d009-4ca0-8c98-2a4656e8d54a') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1064', 'Viewfinder’s Pvt Ltd', NULL, '+977981101064', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'a5d99be3-d009-4ca0-8c98-2a4656e8d54a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'b25ad772-fac1-4bd4-89d1-d8ae218926c9') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1065', 'Baba Dai', NULL, '+977981101065', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'b25ad772-fac1-4bd4-89d1-d8ae218926c9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'b8495781-40e6-4a5f-9cfe-6e0d552aa526') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1066', 'Shrijit chaulagain', NULL, '+977981101066', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'b8495781-40e6-4a5f-9cfe-6e0d552aa526', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '02aedb9d-7785-4f34-9d00-bf022cec161b') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1067', 'Shisir Parki', NULL, '+977981101067', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '02aedb9d-7785-4f34-9d00-bf022cec161b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'af00ba17-3e66-46f6-9fa9-66531d778a37') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1068', 'Maharaj', NULL, '+977981101068', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'af00ba17-3e66-46f6-9fa9-66531d778a37', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '819eae4d-303e-4fc1-858c-bae32fefc73c') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1069', 'Prabin Youjan', 'prabinyon1231@gmail.com', '+977981101069', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '819eae4d-303e-4fc1-858c-bae32fefc73c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'e2f5a019-96d7-4424-8693-805dee0d86d5') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1070', 'Alos', 'b.alosbasnet@gmail.com', '+977981101070', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'e2f5a019-96d7-4424-8693-805dee0d86d5', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'f7e2fb66-801a-46ef-b882-97d1cc951264') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1071', 'Tanmaya', NULL, '+977981101071', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'f7e2fb66-801a-46ef-b882-97d1cc951264', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a65b7ec1-593f-40c3-919a-e9191c0f6588') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1072', 'Sudarsan', NULL, '+977981101072', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'a65b7ec1-593f-40c3-919a-e9191c0f6588', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '42a9af53-3813-4003-9d8e-1515663cf21e') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1073', 'Bisestha Bohora', 'bisesthab@gmail.com', '+977981101073', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '42a9af53-3813-4003-9d8e-1515663cf21e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'db9b58c8-9cbf-4f40-b9bd-37b9c827560b') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1074', 'Apil parajuli', 'approductionmanager@gmail.com', '+977981101074', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'db9b58c8-9cbf-4f40-b9bd-37b9c827560b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '60456636-0a4f-4481-81a6-188048ba2002') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1075', 'Akrist Shakya', 'aakristshakya@gmail.com', '+977981101075', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '60456636-0a4f-4481-81a6-188048ba2002', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'fd054373-98da-44d9-8101-d4ca7a2f6bdd') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1076', 'Sudarshan Thapa', 'thapasudarshan16@gmail.com', '+977981101076', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'fd054373-98da-44d9-8101-d4ca7a2f6bdd', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '86bf2b85-3a37-4547-a53e-014c58ca3573') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1077', 'Bishal Sharma', NULL, '+977981101077', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '86bf2b85-3a37-4547-a53e-014c58ca3573', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '9c43d8d2-62c9-4cd1-b401-422958605adb') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1078', 'Sanjeev Baraili', 'sunzoo2054@gmail.com', '+977981101078', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '9c43d8d2-62c9-4cd1-b401-422958605adb', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'b4e485ac-4ff6-487f-a76c-33cf1a44bddd') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1079', 'Samrik Prazapati', NULL, '+977981101079', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'b4e485ac-4ff6-487f-a76c-33cf1a44bddd', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '96245042-d620-4dfe-aa33-a46e81c288c0') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1080', 'Encore media agency', 'durga.encore@gmail.com', '+977981101080', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '96245042-d620-4dfe-aa33-a46e81c288c0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'cec2cd93-79ed-4d3f-97b7-7ed02428c1de') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1081', 'Nimesh shrestha', 'nimesh.shrestha9@gmail.com', '+977981101081', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'cec2cd93-79ed-4d3f-97b7-7ed02428c1de', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'ef0fc1bb-031e-4217-9933-e6def5321767') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1082', 'Hari Adhikari', 'adhikarihari441@gmai.com', '+977981101082', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'ef0fc1bb-031e-4217-9933-e6def5321767', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'd1b195f6-7f7d-4e32-b28f-cd6f347187fc') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1083', 'Sashank Bohora', NULL, '+977981101083', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'd1b195f6-7f7d-4e32-b28f-cd6f347187fc', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '9c6e3742-c516-4455-8825-b55a5c36db48') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1084', 'Suresh Sonam', NULL, '+977981101084', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '9c6e3742-c516-4455-8825-b55a5c36db48', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'cc3fe06f-6ba8-48b2-b017-47a2c7c0c0bc') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1085', 'Subash Koirala', NULL, '+977981101085', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'cc3fe06f-6ba8-48b2-b017-47a2c7c0c0bc', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'b9697e42-ef2a-4a10-bef3-028db531746d') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1086', 'Zay Karmacharya', 'zayklik@gmail.com', '+977981101086', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'b9697e42-ef2a-4a10-bef3-028db531746d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '88bcbe96-8877-4fa7-9545-7a7e8ca87033') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1087', 'Leushan Rajkarnikar', 'leushan.rajkarnikar1@gmail.com', '+977981101087', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '88bcbe96-8877-4fa7-9545-7a7e8ca87033', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '90c4cdd4-2e48-4fed-a85e-38b2431beab5') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1088', 'Thomas GM', 'thomasgm807@gmail.com', '+977981101088', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '90c4cdd4-2e48-4fed-a85e-38b2431beab5', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4119de9b-1f60-488e-8e2d-02eb53cc2b3f') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1089', 'Anup Kc', NULL, '+977981101089', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '4119de9b-1f60-488e-8e2d-02eb53cc2b3f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '0f88a86e-2642-499c-a76c-6422e2b540c5') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1090', 'Salpa Films pvt ltd', 'rajankathet@gmail.com', '+977981101090', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '0f88a86e-2642-499c-a76c-6422e2b540c5', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '9c9c2b00-36ef-4aa7-bc28-835593bd9934') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1091', 'Shreeshant Joshi', NULL, '+977981101091', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '9c9c2b00-36ef-4aa7-bc28-835593bd9934', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '652ca7ec-686d-488f-804f-7a4c75eec630') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1092', 'Sarun Sharma', 'sarunsh88@gmail.com', '+977981101092', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '652ca7ec-686d-488f-804f-7a4c75eec630', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '5ef9470d-e83c-4396-8dfd-d490f064d34d') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1093', 'Bishwa kiran Poudel', NULL, '+977981101093', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '5ef9470d-e83c-4396-8dfd-d490f064d34d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4669a856-4406-406c-9d57-c79c284b9232') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1094', 'Anshu Chaulagain', 'chaulagaianshu@gmail.com', '+977981101094', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '4669a856-4406-406c-9d57-c79c284b9232', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'f9c7a722-12cd-4ef1-a869-f830678ca936') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1095', 'Abhishek Shrestha', 'aforabishekshrestha@gmail.com', '+977981101095', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'f9c7a722-12cd-4ef1-a869-f830678ca936', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'f5c08417-424e-4a4e-9425-12ebc4dd0ef8') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1096', 'Ramesh shrestha', 'rawmesh96@gmail.com', '+977981101096', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', 'f5c08417-424e-4a4e-9425-12ebc4dd0ef8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '49f58e13-ee6e-42da-9b71-ab2028f68140') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1097', 'Angela', NULL, '+977981101097', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '49f58e13-ee6e-42da-9b71-ab2028f68140', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '93db2783-649b-4d00-ad6e-16209f33197c') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1098', 'Shishir Bishankhe', NULL, '+977981101098', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '93db2783-649b-4d00-ad6e-16209f33197c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '06e7faf9-b527-4582-b883-c919435e2c5c') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1099', 'Narendra chaudhary', 'naren26620@gmail.com', '+977981101099', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '06e7faf9-b527-4582-b883-c919435e2c5c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '9a388c0c-4385-45ab-976d-2ee76c40557c') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), 'C-1100', 'Sanup Dhakal', 'earthsparadisenp@gmail.com', '+977981101100', 'Kathmandu', 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '9a388c0c-4385-45ab-976d-2ee76c40557c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '600a19af-6e17-40cb-bc93-95413919d487') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-897', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '600a19af-6e17-40cb-bc93-95413919d487', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2d33de68-3342-4064-8f20-8d2d2928ad1c') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-896', 'Customer Pickup', '2026-08-28T06:00:00.000000+00:00', '2026-09-02T06:00:00.000000+00:00', 'On Rent')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '2d33de68-3342-4064-8f20-8d2d2928ad1c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a83de4d3-3058-442f-a793-1f0529502052') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-895', 'Customer Pickup', '2026-08-27T06:00:00.000000+00:00', '2026-08-28T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'a83de4d3-3058-442f-a793-1f0529502052', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2145ed3a-28cc-452f-a9f4-ead11ce7e332') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-894', 'Customer Pickup', '2026-08-28T06:00:00.000000+00:00', '2026-08-30T06:00:00.000000+00:00', 'On Rent')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '2145ed3a-28cc-452f-a9f4-ead11ce7e332', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '5db3fd69-c22a-482e-a256-e8746d8d6a73') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-893', 'Customer Pickup', '2026-11-25T12:00:00.000000+00:00', '2026-11-25T22:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '5db3fd69-c22a-482e-a256-e8746d8d6a73', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '4e30732e-9faf-46c2-a593-c0c8b0108fa1') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-892', 'Customer Pickup', '2026-10-11T07:00:00.000000+00:00', '2026-10-11T21:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '4e30732e-9faf-46c2-a593-c0c8b0108fa1', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f13578de-dcd7-4393-b41a-0be4592ef59b') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-891', 'Customer Pickup', '2026-08-27T06:00:00.000000+00:00', '2026-08-28T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f13578de-dcd7-4393-b41a-0be4592ef59b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '068f3e6d-4689-49da-9a9f-cd3d13748bfc') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-890', 'Customer Pickup', '2026-08-27T06:00:00.000000+00:00', '2026-08-28T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '068f3e6d-4689-49da-9a9f-cd3d13748bfc', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '1f0bf975-0a50-4df1-833e-133eb574a8a7') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-889', 'Customer Pickup', '2026-08-27T06:00:00.000000+00:00', '2026-08-28T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '1f0bf975-0a50-4df1-833e-133eb574a8a7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'cf48b48d-7305-4ed2-8090-162b63c8852d') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-888', 'Customer Pickup', '2026-08-29T06:00:00.000000+00:00', '2026-08-30T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'cf48b48d-7305-4ed2-8090-162b63c8852d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '67771ed0-2a60-458c-ac72-d0f7afbd3d6e') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-887', 'Customer Pickup', '2026-08-26T06:00:00.000000+00:00', '2026-08-27T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '67771ed0-2a60-458c-ac72-d0f7afbd3d6e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2407c3fd-c57a-4ee9-8076-d2d956cfa704') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-886', 'Customer Pickup', '2026-08-26T06:00:00.000000+00:00', '2026-08-28T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '2407c3fd-c57a-4ee9-8076-d2d956cfa704', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '93d85ccc-c425-4c53-8f1c-2b031a376d34') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-885', 'Customer Pickup', '2026-08-26T06:00:00.000000+00:00', '2026-08-27T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '93d85ccc-c425-4c53-8f1c-2b031a376d34', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'b0347aa5-ccb7-41c6-9e48-2b4c5e24036b') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-884', 'Customer Pickup', '2026-08-25T06:00:00.000000+00:00', '2026-08-26T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'b0347aa5-ccb7-41c6-9e48-2b4c5e24036b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '88fed58f-1c69-4c09-989c-5cdc8e9315a9') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-883', 'Customer Pickup', '2026-08-26T06:00:00.000000+00:00', '2026-08-27T05:45:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '88fed58f-1c69-4c09-989c-5cdc8e9315a9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '5f819514-949f-4223-9bba-1458c796c651') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-882', 'Customer Pickup', '2026-08-26T06:00:00.000000+00:00', '2026-08-28T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '5f819514-949f-4223-9bba-1458c796c651', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '38947b27-7f2c-43a4-8532-34bb62b83752') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-881', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '38947b27-7f2c-43a4-8532-34bb62b83752', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '51e73747-0c2a-486c-a42f-8aa51bffc435') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-880', 'Customer Pickup', '2026-08-25T06:15:00.000000+00:00', '2026-08-26T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '51e73747-0c2a-486c-a42f-8aa51bffc435', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '6c75c8e4-7f82-4811-952c-2458e040afbf') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-879', 'Customer Pickup', '2026-08-27T06:00:00.000000+00:00', '2026-08-29T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '6c75c8e4-7f82-4811-952c-2458e040afbf', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '8ebd3008-86f6-4b94-92e6-2e47c55eb342') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-878', 'Customer Pickup', '2026-08-25T06:00:00.000000+00:00', '2026-08-26T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '8ebd3008-86f6-4b94-92e6-2e47c55eb342', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'd2c38e0b-8ca0-4877-82dd-22cb2513538f') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-877', 'Customer Pickup', '2026-08-24T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'd2c38e0b-8ca0-4877-82dd-22cb2513538f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '1ec9fb29-d8fe-46b9-aab1-32602c90ffd7') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-876', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '1ec9fb29-d8fe-46b9-aab1-32602c90ffd7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '87a50d42-3a3e-4078-b4ff-96f09dc9d232') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-875', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '87a50d42-3a3e-4078-b4ff-96f09dc9d232', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'ae315376-ebf9-4cdc-86fa-fa1ae60f8465') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-874', 'Customer Pickup', '2026-08-24T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'ae315376-ebf9-4cdc-86fa-fa1ae60f8465', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'beac16fb-8430-40eb-80a4-8a551030450c') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-873', 'Customer Pickup', '2026-08-23T06:00:00.000000+00:00', '2026-08-24T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'beac16fb-8430-40eb-80a4-8a551030450c', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f70a4ef2-e4f0-4866-85f0-e5a129222170') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-872', 'Customer Pickup', '2026-08-23T06:00:00.000000+00:00', '2026-08-24T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f70a4ef2-e4f0-4866-85f0-e5a129222170', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '4e3d0f50-08b9-4319-9351-826340042e6f') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-871', 'Customer Pickup', '2026-08-23T06:00:00.000000+00:00', '2026-08-24T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '4e3d0f50-08b9-4319-9351-826340042e6f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '8aa2268c-1344-491c-a197-83582c1d18c1') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-870', 'Customer Pickup', '2026-08-23T06:00:00.000000+00:00', '2026-08-24T05:45:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '8aa2268c-1344-491c-a197-83582c1d18c1', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a95aa2e5-8268-4413-8017-693765fc05f9') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-869', 'Customer Pickup', '2026-08-23T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'a95aa2e5-8268-4413-8017-693765fc05f9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '746c1a1e-73ec-4bbb-9199-8611fceb8645') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-868', 'Customer Pickup', '2026-08-22T06:00:00.000000+00:00', '2026-08-23T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '746c1a1e-73ec-4bbb-9199-8611fceb8645', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '9e305aa2-a866-4108-9602-d7f9fdb82ffe') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-867', 'Customer Pickup', '2026-08-23T06:00:00.000000+00:00', '2026-08-24T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '9e305aa2-a866-4108-9602-d7f9fdb82ffe', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'b2eb10cd-c505-4476-b694-39c930c2b4ef') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-866', 'Customer Pickup', '2026-08-22T06:00:00.000000+00:00', '2026-08-23T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'b2eb10cd-c505-4476-b694-39c930c2b4ef', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2103eed1-9c3c-4d54-a160-9798ea958b38') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-865', 'Customer Pickup', '2026-08-24T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '2103eed1-9c3c-4d54-a160-9798ea958b38', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '8c93e7ad-c512-4e6a-8c2a-d2403c591cb7') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-864', 'Customer Pickup', '2026-08-22T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '8c93e7ad-c512-4e6a-8c2a-d2403c591cb7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '4d1f291f-d572-4b08-90e8-7884fe669b27') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-863', 'Customer Pickup', '2026-08-22T06:00:00.000000+00:00', '2026-08-23T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '4d1f291f-d572-4b08-90e8-7884fe669b27', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '715bd96f-cf99-42e3-839c-fb1301bf1a77') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-862', 'Customer Pickup', '2026-08-22T06:00:00.000000+00:00', '2026-08-23T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '715bd96f-cf99-42e3-839c-fb1301bf1a77', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '21218b5b-4d3e-4acb-ade3-95de66f65eee') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-861', 'Customer Pickup', '2026-08-22T06:00:00.000000+00:00', '2026-08-23T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '21218b5b-4d3e-4acb-ade3-95de66f65eee', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'e90932f4-344f-4e4e-8821-02cb2e6deb6b') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-860', 'Customer Pickup', '2026-08-22T06:00:00.000000+00:00', '2026-08-23T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'e90932f4-344f-4e4e-8821-02cb2e6deb6b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '022a43d8-9c23-4c87-b54f-e238dbbf34eb') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-859', 'Customer Pickup', '2026-08-20T06:00:00.000000+00:00', '2026-08-22T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '022a43d8-9c23-4c87-b54f-e238dbbf34eb', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '217c0f5d-f3a5-4881-8d9c-6a4dcb2980d9') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-858', 'Customer Pickup', '2026-08-20T06:00:00.000000+00:00', '2026-08-21T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '217c0f5d-f3a5-4881-8d9c-6a4dcb2980d9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '05fadd9d-2935-4bc9-9b7a-ce1a44ccdda4') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-857', 'Customer Pickup', '2026-08-20T06:00:00.000000+00:00', '2026-08-21T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '05fadd9d-2935-4bc9-9b7a-ce1a44ccdda4', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '74c0a5f1-8ac7-4c3c-ae0f-23a43d27f7b6') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-856', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '74c0a5f1-8ac7-4c3c-ae0f-23a43d27f7b6', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '9438fead-0708-46e7-822d-7e0f12a0bfa0') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-855', 'Customer Pickup', '2026-08-23T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '9438fead-0708-46e7-822d-7e0f12a0bfa0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '9954b0bc-b5fa-4223-9cbd-a310f560b786') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-854', 'Customer Pickup', '2026-08-26T06:00:00.000000+00:00', '2026-08-27T05:45:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '9954b0bc-b5fa-4223-9cbd-a310f560b786', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '641a1b83-231e-421e-ba49-d5b29fd9fad0') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-853', 'Customer Pickup', '2026-08-24T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '641a1b83-231e-421e-ba49-d5b29fd9fad0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '141da10c-8f99-4732-bcca-29ff62e6c5d1') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-852', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '141da10c-8f99-4732-bcca-29ff62e6c5d1', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'bcfa53c5-41b2-4306-8bf1-bdfc339499e8') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-851', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'bcfa53c5-41b2-4306-8bf1-bdfc339499e8', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2231b82a-85e6-4627-a8c8-9a72b9c9829e') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-850', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '2231b82a-85e6-4627-a8c8-9a72b9c9829e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '7a428cf6-136c-43a8-ad57-415b39e63568') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-849', 'Customer Pickup', '2026-08-17T06:00:00.000000+00:00', '2026-08-18T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '7a428cf6-136c-43a8-ad57-415b39e63568', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '0cdee545-93ca-4d7a-8bee-a47f90c5277e') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-848', 'Customer Pickup', '2026-08-18T06:00:00.000000+00:00', '2026-08-19T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '0cdee545-93ca-4d7a-8bee-a47f90c5277e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '093c67cd-ef42-4de7-b0e4-1e2335ca55c3') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-847', 'Customer Pickup', '2026-08-18T06:00:00.000000+00:00', '2026-08-19T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '093c67cd-ef42-4de7-b0e4-1e2335ca55c3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f2ee7f7e-859b-4de7-87a7-30a13c8de194') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-846', 'Customer Pickup', '2026-07-30T06:00:00.000000+00:00', '2026-07-31T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f2ee7f7e-859b-4de7-87a7-30a13c8de194', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'dbbce03e-f1d0-4652-a042-4a8bc9bbf943') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-845', 'Customer Pickup', '2026-08-18T06:00:00.000000+00:00', '2026-08-19T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'dbbce03e-f1d0-4652-a042-4a8bc9bbf943', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '3be58d53-37d1-4956-9b7a-50c9e8fb12b2') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-844', 'Customer Pickup', '2026-08-18T06:00:00.000000+00:00', '2026-08-19T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '3be58d53-37d1-4956-9b7a-50c9e8fb12b2', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'aa6264a2-b3df-4b39-a825-04809ddb3142') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-843', 'Customer Pickup', '2026-08-17T06:00:00.000000+00:00', '2026-08-18T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'aa6264a2-b3df-4b39-a825-04809ddb3142', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f369666f-959e-436b-a870-291fb6bfbf89') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-842', 'Customer Pickup', '2026-08-18T06:00:00.000000+00:00', '2026-08-31T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f369666f-959e-436b-a870-291fb6bfbf89', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '374e5b95-0356-4e40-8e36-f7cb4fbcf7aa') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-841', 'Customer Pickup', '2026-08-17T06:00:00.000000+00:00', '2026-08-18T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '374e5b95-0356-4e40-8e36-f7cb4fbcf7aa', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a9800a24-3775-4bca-938f-5ad656fe3b23') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-840', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'a9800a24-3775-4bca-938f-5ad656fe3b23', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '57040385-c7c4-4f0b-9ea7-7976abbea4a4') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-839', 'Customer Pickup', '2026-08-17T06:00:00.000000+00:00', '2026-08-18T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '57040385-c7c4-4f0b-9ea7-7976abbea4a4', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'd94b74f1-ea1f-4bf4-a9c1-f5158eed8b7a') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-838', 'Customer Pickup', '2026-08-18T06:00:00.000000+00:00', '2026-08-19T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'd94b74f1-ea1f-4bf4-a9c1-f5158eed8b7a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '8206822a-8294-4e02-ab56-9a2db482cc50') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-837', 'Customer Pickup', '2026-08-21T06:00:00.000000+00:00', '2026-08-22T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '8206822a-8294-4e02-ab56-9a2db482cc50', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f2eb8b2f-f046-4964-b391-a0d5273f77d0') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-836', 'Customer Pickup', '2026-08-20T06:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f2eb8b2f-f046-4964-b391-a0d5273f77d0', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '8ee11db6-c41f-4b50-a0fb-ffa93f282595') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-835', 'Customer Pickup', '2026-08-18T06:00:00.000000+00:00', '2026-08-20T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '8ee11db6-c41f-4b50-a0fb-ffa93f282595', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '21c31069-bc1a-49c7-ac17-c57b6d9b63d6') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-834', 'Customer Pickup', '2026-08-24T08:00:00.000000+00:00', '2026-08-25T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '21c31069-bc1a-49c7-ac17-c57b6d9b63d6', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2b0cec8f-8bb9-4f3a-bedb-1b6fb7be7bb6') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-833', 'Customer Pickup', '2026-08-16T06:00:00.000000+00:00', '2026-08-21T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '2b0cec8f-8bb9-4f3a-bedb-1b6fb7be7bb6', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '0a5c1f33-59b4-4dc9-a0af-49af4048fe40') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-832', 'Customer Pickup', '2026-08-15T06:00:00.000000+00:00', '2026-08-16T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '0a5c1f33-59b4-4dc9-a0af-49af4048fe40', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '407e23a5-8b12-4288-b381-0e3ab5f19de2') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-831', 'Customer Pickup', '2026-08-19T06:00:00.000000+00:00', '2026-08-20T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '407e23a5-8b12-4288-b381-0e3ab5f19de2', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '7844d836-55c5-478f-bb7c-4e343d66375d') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-830', 'Customer Pickup', '2026-08-14T06:00:00.000000+00:00', '2026-08-30T06:00:00.000000+00:00', 'On Rent')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '7844d836-55c5-478f-bb7c-4e343d66375d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f07b70ff-d355-4c91-92ec-6868cdbf2aae') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-829', 'Customer Pickup', '2026-08-14T06:00:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f07b70ff-d355-4c91-92ec-6868cdbf2aae', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '7b2da252-e86b-4dd8-801c-4be46319b58e') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-828', 'Customer Pickup', '2026-08-14T06:15:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '7b2da252-e86b-4dd8-801c-4be46319b58e', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a77b56ee-8ffb-4051-82cf-3f4028f9cf6a') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-827', 'Customer Pickup', '2026-08-14T06:15:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'a77b56ee-8ffb-4051-82cf-3f4028f9cf6a', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'ffa33898-0ccb-456a-9ecb-5ce578fa0623') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-826', 'Customer Pickup', '2026-08-16T06:00:00.000000+00:00', '2026-08-18T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'ffa33898-0ccb-456a-9ecb-5ce578fa0623', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '93e76e77-9195-486e-ad3a-c1e3dc9c070b') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-825', 'Customer Pickup', '2026-08-27T06:00:00.000000+00:00', '2026-09-03T06:00:00.000000+00:00', 'On Rent')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '93e76e77-9195-486e-ad3a-c1e3dc9c070b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f8b879be-9757-4ad9-a63d-4ff70191bb0f') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-824', 'Customer Pickup', '2026-08-16T06:00:00.000000+00:00', '2026-08-18T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f8b879be-9757-4ad9-a63d-4ff70191bb0f', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a8f81436-f8b2-4b93-b696-4c2aa93c4792') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-823', 'Customer Pickup', '2026-08-14T06:00:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'a8f81436-f8b2-4b93-b696-4c2aa93c4792', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a5e3eef4-1e24-49db-b315-beaa5ff89c45') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-822', 'Customer Pickup', '2026-08-13T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'a5e3eef4-1e24-49db-b315-beaa5ff89c45', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f147d071-33db-4377-bb38-135acce1af03') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-821', 'Customer Pickup', '2026-08-13T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f147d071-33db-4377-bb38-135acce1af03', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '3ca212a6-a85a-4b05-95c9-7bc7c914d495') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-820', 'Customer Pickup', '2026-08-14T06:15:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '3ca212a6-a85a-4b05-95c9-7bc7c914d495', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'b291be80-15a9-4854-8d42-f149d3071706') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-819', 'Customer Pickup', '2026-08-14T10:00:00.000000+00:00', '2026-08-15T10:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'b291be80-15a9-4854-8d42-f149d3071706', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '57ad0dc3-4f71-4445-8d81-1a0de5d39e7d') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-818', 'Customer Pickup', '2026-08-16T06:00:00.000000+00:00', '2026-08-17T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '57ad0dc3-4f71-4445-8d81-1a0de5d39e7d', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '0530b42d-d75e-4ca8-918f-12a564dd2ed3') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-817', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '0530b42d-d75e-4ca8-918f-12a564dd2ed3', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '48091c8b-767e-470f-822e-3e33509fb613') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-816', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '48091c8b-767e-470f-822e-3e33509fb613', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '7dba7a1f-359e-4a49-8a16-0a73e4db3f2b') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-815', 'Customer Pickup', '2026-08-12T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '7dba7a1f-359e-4a49-8a16-0a73e4db3f2b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f2f3a9a9-f64c-4381-9b42-e78e096e2799') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-814', 'Customer Pickup', '2026-08-13T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'f2f3a9a9-f64c-4381-9b42-e78e096e2799', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '5c54c8d1-b092-492a-8b72-a6758d0e6926') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-813', 'Customer Pickup', '2026-08-13T06:15:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '5c54c8d1-b092-492a-8b72-a6758d0e6926', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '7e68b71f-96ba-40fd-873e-39f6c301a686') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-812', 'Customer Pickup', '2026-08-12T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '7e68b71f-96ba-40fd-873e-39f6c301a686', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '01e8e501-7326-4681-a129-dce46fe64700') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-811', 'Customer Pickup', NOW(), NOW(), 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '01e8e501-7326-4681-a129-dce46fe64700', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '187e0ccc-c795-40e8-b75f-f51ebdbd37f7') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-810', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '187e0ccc-c795-40e8-b75f-f51ebdbd37f7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '0baf90c2-116e-4af1-b411-01df088c96f7') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-809', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '0baf90c2-116e-4af1-b411-01df088c96f7', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2cd47007-fa90-49f7-8052-1ff8887bf457') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-808', 'Customer Pickup', '2026-08-11T06:00:00.000000+00:00', '2026-08-12T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '2cd47007-fa90-49f7-8052-1ff8887bf457', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'e52cee21-ff5d-44a8-9580-6cda6800d2bd') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-807', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'e52cee21-ff5d-44a8-9580-6cda6800d2bd', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '36d53af5-953d-4e9e-ac3a-d7f009febac9') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-806', 'Customer Pickup', '2026-08-10T06:15:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '36d53af5-953d-4e9e-ac3a-d7f009febac9', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '091ac502-5095-42c5-b160-f95f1677fdd4') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-805', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '091ac502-5095-42c5-b160-f95f1677fdd4', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'ce8dfdf6-62b9-44df-9be7-604852bbb782') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-804', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'ce8dfdf6-62b9-44df-9be7-604852bbb782', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'd2c8ce3f-cf2b-4606-8525-85d47860b268') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-803', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'd2c8ce3f-cf2b-4606-8525-85d47860b268', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'e8d96051-021e-445d-a1b2-cd46f6d0703b') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-802', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', 'e8d96051-021e-445d-a1b2-cd46f6d0703b', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '61c12952-c5c3-404e-8972-8b204a68e492') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-801', 'Customer Pickup', '2026-08-10T06:15:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '61c12952-c5c3-404e-8972-8b204a68e492', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '32bcc7dd-f448-4985-b1c7-fc6b218245cd') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-800', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '32bcc7dd-f448-4985-b1c7-fc6b218245cd', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '879e757f-b94d-4b20-be0e-0e29c6319b69') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-799', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '879e757f-b94d-4b20-be0e-0e29c6319b69', v_new_id::text);
      END IF;
    

      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '4bbc2f17-9e46-4066-870f-b9c9af3fe59f') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, 'B-798', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Returned')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '4bbc2f17-9e46-4066-870f-b9c9af3fe59f', v_new_id::text);
      END IF;
    
END $$;
COMMIT;