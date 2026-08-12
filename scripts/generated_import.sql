BEGIN;

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'd6b449cb-587d-4715-940c-59a1aea4911f';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000401', '10x10 Skimmer Frame and Cloth ', 'Generic', 'GRP-10-10-SKM-KIT', '', 1500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'd6b449cb-587d-4715-940c-59a1aea4911f', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '10x10 Skimmer Frame and Cloth ', brand = 'Generic', model = 'GRP-10-10-SKM-KIT', daily_rate = 1500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '9c5f5ca1-06ed-4bbe-81da-b35a54af7342';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000402', '12x12 Skimmer and Cloth', 'Generic', 'GRP-12-12-SKM-KIT', '', 0, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '9c5f5ca1-06ed-4bbe-81da-b35a54af7342', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '12x12 Skimmer and Cloth', brand = 'Generic', model = 'GRP-12-12-SKM-KIT', daily_rate = 0 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a7baa008-a745-4191-8195-725a0aa5ed38';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000403', '20x20 skimmer cloth ', 'Generic', '20x20 skimmer cloth ', '', 2000, 'Serialised', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'a7baa008-a745-4191-8195-725a0aa5ed38', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '20x20 skimmer cloth ', brand = 'Generic', model = '20x20 skimmer cloth ', daily_rate = 2000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'cce65daa-15ba-41a8-967b-95bde015c5c8';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000404', '58mm Nd', 'Generic', '58MM_ND', '', 50, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'cce65daa-15ba-41a8-967b-95bde015c5c8', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '58mm Nd', brand = 'Generic', model = '58MM_ND', daily_rate = 50 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '26d29a69-ae01-45b7-aa0e-78a969a5ddfe';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000405', '5 in 1 Folded Reflector', 'Generic', 'FLD-RF-5''1', '<p>What’s Included:</p>
<p>• 5-in-1 Reflector Disc</p>
<p>• Carrying Bag / Pouch</p>', 500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '26d29a69-ae01-45b7-aa0e-78a969a5ddfe', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '5 in 1 Folded Reflector', brand = 'Generic', model = 'FLD-RF-5''1', daily_rate = 500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8251d25c-6914-44ee-b0d0-d1b9589f4647';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000406', '6x6 Skimmer Frame and cloth', 'Generic', 'GRP-66-SKM-KIT', '', 800, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '8251d25c-6914-44ee-b0d0-d1b9589f4647', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '6x6 Skimmer Frame and cloth', brand = 'Generic', model = 'GRP-66-SKM-KIT', daily_rate = 800 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'b229700f-7b33-46ab-90da-e8148bb61ae3';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000407', '77mm Close-Up Filter', 'Generic', 'FLTR-CLSUP-77MM', '', 500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'b229700f-7b33-46ab-90da-e8148bb61ae3', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '77mm Close-Up Filter', brand = 'Generic', model = 'FLTR-CLSUP-77MM', daily_rate = 500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e533aa82-29d3-4d8d-ac90-d0e9b72e47d0';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000408', '7Artisans 37mm Lens', 'Generic', '7AR-37MM-LENS', '', 2000, 'Serialised', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'e533aa82-29d3-4d8d-ac90-d0e9b72e47d0', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '7Artisans 37mm Lens', brand = 'Generic', model = '7AR-37MM-LENS', daily_rate = 2000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'a12ef5c8-424c-49de-9fb8-de7c76ffc56b';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000409', '7Artisans 57mm Lens', 'Generic', '7AR-57MM-LENS', '', 2000, 'Serialised', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'a12ef5c8-424c-49de-9fb8-de7c76ffc56b', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '7Artisans 57mm Lens', brand = 'Generic', model = '7AR-57MM-LENS', daily_rate = 2000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'e13c71de-2057-4571-bc44-d5ddc51e5aba';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000410', '8x8 Skimmer Frame and Cloth', 'Generic', 'GRP-8-8-SKM-KIT', '', 1500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'e13c71de-2057-4571-bc44-d5ddc51e5aba', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '8x8 Skimmer Frame and Cloth', brand = 'Generic', model = 'GRP-8-8-SKM-KIT', daily_rate = 1500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '485fb5a9-ac6c-4708-98e7-79db576c2e22';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000411', '95mm Polarizer Filter for Tilta Mirage', 'Generic', 'FIL-95-CPL-TIL', '', 1000, 'Serialised', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '485fb5a9-ac6c-4708-98e7-79db576c2e22', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '95mm Polarizer Filter for Tilta Mirage', brand = 'Generic', model = 'FIL-95-CPL-TIL', daily_rate = 1000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '9c072452-b581-4c1f-9f91-d4a59e0a8252';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000412', '99Whr Vmount battery', 'Generic', 'BAT-VN99', '<p>99 W·h V-Mount Battery – Overview<br>A 99 W·h V-Mount battery is a professional lithium-ion power pack that uses the V-Mount (V-Lock) standard — a common mount system for cinema and broadcast gear. The 99 W·h rating refers to the total energy the battery stores (Watt-hours), which affects how long it can power your equipment. These batteries are also usually the maximum size allowed on carry-on luggage for most airlines (also called “airline-friendly”).  <br><br><br>⚡ <br><br>Key Specifications<br>	•	Capacity: ~99 W·h (typically ~6,700 mAh at ~14.8 V)  <br>	•	Voltage: ~14.4–14.8 V — suitable for powering professional cameras &amp; accessories.  <br>	•	Mount: Standard V-Mount / V-Lock interface for secure attachment on cameras, cages, plates, and rigs.</p>', 500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '9c072452-b581-4c1f-9f91-d4a59e0a8252', v_product_id::text);
        ELSE
          UPDATE public.products SET name = '99Whr Vmount battery', brand = 'Generic', model = 'BAT-VN99', daily_rate = 500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8180759d-d7d0-4409-b95a-4b4fa973fd6f';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000413', 'Accsoon CineView M7 Pro 7" monitor (built in wireless)', 'Generic', 'MON-M7PRO-ACC', '', 2000, 'Serialised', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '8180759d-d7d0-4409-b95a-4b4fa973fd6f', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Accsoon CineView M7 Pro 7" monitor (built in wireless)', brand = 'Generic', model = 'MON-M7PRO-ACC', daily_rate = 2000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8b7192e4-fe23-4499-981f-16fa2210f17c';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000414', 'Accsoon Cineview Nano', 'Generic', 'TX-ACC-NANO', '<p>Accsoon CineView Nano — What’s Included</p>
<p>• HDMI cable × 1</p>
<p>• Magic arm × 1</p>
<p>• NP-F550 battery × 1</p><p>The Accsoon CineView Nano is a compact wireless HDMI video transmitter that lets you send your camera’s live video to up to four smartphones or tablets (iOS/Android) over 5 GHz Wi-Fi for up to ~500 ft (150 m) with very low latency (~60 ms). </p>', 500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '8b7192e4-fe23-4499-981f-16fa2210f17c', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Accsoon Cineview Nano', brand = 'Generic', model = 'TX-ACC-NANO', daily_rate = 500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '87857a1e-19a7-46d6-a38d-773d4465e1af';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000415', 'Accsoon cineview Sdi 2', 'Generic', 'VID-TX-RX-CVSDI2-ACC', '<p>Accsoon CineView 2 SDI — What’s Included&nbsp;</p>
<p>• Transmitter × 1</p>
<p>• Receiver × 1</p>
<p>• NP-F batteries × 4</p>
<p>• HDMI cables × 2</p>
<p>• Magic arms × 2</p>
<p></p>', 1500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '87857a1e-19a7-46d6-a38d-773d4465e1af', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Accsoon cineview Sdi 2', brand = 'Generic', model = 'VID-TX-RX-CVSDI2-ACC', daily_rate = 1500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '7eea3dfe-f379-4537-b940-459b9da9b9c9';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000416', 'Accsoon Cineviw SDI 2 Transmitter(TX)', 'Generic', 'ACC-CINEVIEW-SDI2-TX', '', 1000, 'Serialised', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '7eea3dfe-f379-4537-b940-459b9da9b9c9', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Accsoon Cineviw SDI 2 Transmitter(TX)', brand = 'Generic', model = 'ACC-CINEVIEW-SDI2-TX', daily_rate = 1000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '2d02da7d-c71a-4dae-bfef-1992c4de5d36';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000417', 'Accsoon CoMo 7/9-Set Headset Intercom - 9', 'Generic', 'ACCSOON_COMO_9_SET_HEADSET_INTERCO', '', 4000, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '2d02da7d-c71a-4dae-bfef-1992c4de5d36', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Accsoon CoMo 7/9-Set Headset Intercom - 9', brand = 'Generic', model = 'ACCSOON_COMO_9_SET_HEADSET_INTERCO', daily_rate = 4000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'aebea6ea-e967-4f37-9421-256d10fe0cd7';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000418', 'Accsoon CoMo SE 5-Person Intercom System (Grade B)', 'Generic', 'AUD-COM-COMOSE5-ACC', '<p>What’s Included:</p>
<p>• 1 × Host headset</p>
<p>• 4 × Remote headsets</p>
<p>• Rechargeable batteries (one per headset)</p>
<p>• Battery charger</p>
<p>• Storage boxes &amp; accessories (ear cushions, windscreens, bags) &nbsp;</p>
<p></p>', 1500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'aebea6ea-e967-4f37-9421-256d10fe0cd7', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Accsoon CoMo SE 5-Person Intercom System (Grade B)', brand = 'Generic', model = 'AUD-COM-COMOSE5-ACC', daily_rate = 1500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '28590ee0-eef6-48b7-9a85-8559c8e9dcb7';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000419', 'Amaran 200d S LED Video Light', 'Generic', 'LGT-AM200D', '<p>Amaran 200d S — What’s Included:</p>
<p>• Amaran 200d S LED light</p>
<p>• Hyper reflector (Bowens)</p>
<p>• AC power supply &amp; cable</p>
<p>• Carrying case</p>
<p>• 65 cm Softbox</p>
<p>• C-Stand</p>
<p>• Socket / Multiplug</p>
<p></p>', 1000, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '28590ee0-eef6-48b7-9a85-8559c8e9dcb7', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Amaran 200d S LED Video Light', brand = 'Generic', model = 'LGT-AM200D', daily_rate = 1000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '57cd9180-ffb8-454c-8104-76c3694a743c';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000420', 'Amaran 300c ', 'Generic', 'LGT-AM300C', '<p>Amaran 300c — What’s Included<br>• Amaran 300c LED light<br>• Hyper reflector (Bowens)<br>• AC power supply &amp; cable<br>• Carrying case<br>• 90 cm Softbox<br>• C-Stand<br>• Socket / Multiplug</p>', 1500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '57cd9180-ffb8-454c-8104-76c3694a743c', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Amaran 300c ', brand = 'Generic', model = 'LGT-AM300C', daily_rate = 1500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '8f8bb183-d8dc-420a-86dc-9cb0191da308';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000421', 'Amaran 60d S', 'Generic', 'LGT-60DS-AMR', '<p>What’s Included:<br>• Amaran 60d S LED light<br>• Bowens mount reflector<br>• AC power supply &amp; cable<br>• Carrying bag / pouch</p>', 700, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '8f8bb183-d8dc-420a-86dc-9cb0191da308', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Amaran 60d S', brand = 'Generic', model = 'LGT-60DS-AMR', daily_rate = 700 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '6ab67b4d-580e-4eee-95cc-d3aa2889dcab';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000422', 'Amaran F22c Light', 'Generic', 'LGT-F22C-AMR', '<p>What’s Included:</p>
<p>• Amaran F22c RGBWW LED Light</p>
<p>• Power Adapter &amp; Cable</p>
<p>• Carrying Bag</p>
<p>• C-Stand (D)</p>
<p>• Socket / Multiplug</p>
<p></p>', 2000, 'Serialised', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '6ab67b4d-580e-4eee-95cc-d3aa2889dcab', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Amaran F22c Light', brand = 'Generic', model = 'LGT-F22C-AMR', daily_rate = 2000 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = 'c2f45ee7-0a30-4018-9dc5-5ff84bb0c1d9';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000423', 'Amaran PT2c RGBWW LED Pixel Tube Light', 'Generic', 'AMARAN_PT2C_RGBWW_LED_PIXEL_TUBE_LIGHT', '', 750, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', 'c2f45ee7-0a30-4018-9dc5-5ff84bb0c1d9', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Amaran PT2c RGBWW LED Pixel Tube Light', brand = 'Generic', model = 'AMARAN_PT2C_RGBWW_LED_PIXEL_TUBE_LIGHT', daily_rate = 750 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '872ac51a-3dbc-4675-bfb3-898e2dcf8a4b';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000424', 'Amaran PT4c RGBWW LED Pixel Tube Light', 'Generic', 'AMARAN_PT4C_RGBWW_LED_PIXEL_TUBE_LIGHT', '', 1500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '872ac51a-3dbc-4675-bfb3-898e2dcf8a4b', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Amaran PT4c RGBWW LED Pixel Tube Light', brand = 'Generic', model = 'AMARAN_PT4C_RGBWW_LED_PIXEL_TUBE_LIGHT', daily_rate = 1500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '3a0323d2-14c6-4b23-91c7-2b812883a87e';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'EQ000425', 'Amaran T2C RGBWW LED Tube Light 25W (2ft)', 'Generic', 'LGT-TUBE2FT', '<p>What’s Included:</p>
<p>• Amaran T2C RGBWW LED Tube Light (2 ft) × 1</p>
<p>• Power adapter &amp; cable × 1</p>
<p>• Tube mounts / clips × 2</p>
<p>• Safety cable / lanyard × 1</p>
<p>• Carry pouch / storage bag × 1</p>
<p></p>', 500, 'Quantity', 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '3a0323d2-14c6-4b23-91c7-2b812883a87e', v_product_id::text);
        ELSE
          UPDATE public.products SET name = 'Amaran T2C RGBWW LED Tube Light 25W (2ft)', brand = 'Generic', model = 'LGT-TUBE2FT', daily_rate = 500 WHERE id = v_product_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '7385d2d4-7c27-4816-af3d-dc4de44463cb';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-601', 'Foton Films', NULL, '+977981100601', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '7385d2d4-7c27-4816-af3d-dc4de44463cb', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Foton Films', email = NULL, phone = '+977981100601' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '174ef22d-de13-47fe-8d07-0a46252a6bf3';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-602', 'Yogesh', NULL, '+977981100602', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '174ef22d-de13-47fe-8d07-0a46252a6bf3', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Yogesh', email = NULL, phone = '+977981100602' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '26c9a58b-f341-4657-b9ef-b5b156bdb283';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-603', 'Samrat Bhandari', 'samratbhandari112@gmail.com', '+977981100603', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '26c9a58b-f341-4657-b9ef-b5b156bdb283', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Samrat Bhandari', email = 'samratbhandari112@gmail.com', phone = '+977981100603' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '50d69ac7-88e8-4675-bbbc-b409d2cbd456';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-604', 'Saphal Ganejoo', NULL, '+977981100604', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '50d69ac7-88e8-4675-bbbc-b409d2cbd456', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Saphal Ganejoo', email = NULL, phone = '+977981100604' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '62c337ce-72b6-4e81-b7ff-7a85d0a04532';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-605', 'Rachit Shrestha', NULL, '+977981100605', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '62c337ce-72b6-4e81-b7ff-7a85d0a04532', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Rachit Shrestha', email = NULL, phone = '+977981100605' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'f00813e8-ed46-4407-9bc6-af0d4fe07ccd';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-606', 'Prashant Adhikari', NULL, '+977981100606', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', 'f00813e8-ed46-4407-9bc6-af0d4fe07ccd', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Prashant Adhikari', email = NULL, phone = '+977981100606' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '14ddc972-b6b8-458e-b856-9e0b142ff03d';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-607', 'Magan Entertainment', 'maganentertainment22@gmail.com', '+977981100607', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '14ddc972-b6b8-458e-b856-9e0b142ff03d', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Magan Entertainment', email = 'maganentertainment22@gmail.com', phone = '+977981100607' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'b2f62664-88da-47d5-a6b3-236d28c7db77';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-608', 'Kusang', 'thykusang@gmail.com', '+977981100608', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', 'b2f62664-88da-47d5-a6b3-236d28c7db77', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Kusang', email = 'thykusang@gmail.com', phone = '+977981100608' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'ec3a452a-2a35-4089-b25d-2b8dbb250ef0';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-609', 'Samrat Maharjan', 'its.selex@gmail.com', '+977981100609', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', 'ec3a452a-2a35-4089-b25d-2b8dbb250ef0', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Samrat Maharjan', email = 'its.selex@gmail.com', phone = '+977981100609' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4065f51d-b204-476b-9d3b-3c62ddbeafe8';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-610', 'Bishal', 'sbishal270@gmail.com', '+977981100610', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '4065f51d-b204-476b-9d3b-3c62ddbeafe8', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Bishal', email = 'sbishal270@gmail.com', phone = '+977981100610' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '1e74de60-f34d-428b-95e3-7324b7db87ef';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-611', 'babin dulal', 'babindulal7@gmail.com', '+977981100611', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '1e74de60-f34d-428b-95e3-7324b7db87ef', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'babin dulal', email = 'babindulal7@gmail.com', phone = '+977981100611' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4e7bd146-e2f2-4791-b802-b004a9343ac9';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-612', 'Prashant Yogi', 'uvwxyogi@gmail.com', '+977981100612', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '4e7bd146-e2f2-4791-b802-b004a9343ac9', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Prashant Yogi', email = 'uvwxyogi@gmail.com', phone = '+977981100612' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '042468b7-fe07-4e7b-9d3c-c64dbe8385be';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-613', 'Milan Boaluffy777', NULL, '+977981100613', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '042468b7-fe07-4e7b-9d3c-c64dbe8385be', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Milan Boaluffy777', email = NULL, phone = '+977981100613' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a1287182-ef93-47d9-bd54-44e7c6db092f';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-614', 'Rojin Pathak', 'thealchemist692@gmail.com', '+977981100614', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', 'a1287182-ef93-47d9-bd54-44e7c6db092f', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Rojin Pathak', email = 'thealchemist692@gmail.com', phone = '+977981100614' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '26b741ff-acdc-4315-900a-05fa4cd41b3f';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-615', 'Dikesh Khadgi Shahi', NULL, '+977981100615', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '26b741ff-acdc-4315-900a-05fa4cd41b3f', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Dikesh Khadgi Shahi', email = NULL, phone = '+977981100615' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'a28df6fb-3ec6-44cc-9026-97504898223a';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-616', 'Abin Shakya', 'abinshakya502@gmail.com', '+977981100616', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', 'a28df6fb-3ec6-44cc-9026-97504898223a', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Abin Shakya', email = 'abinshakya502@gmail.com', phone = '+977981100616' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '713b0cd9-d4a9-49aa-b36d-371cef06e680';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-617', 'Fumu The Maker', NULL, '+977981100617', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '713b0cd9-d4a9-49aa-b36d-371cef06e680', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Fumu The Maker', email = NULL, phone = '+977981100617' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '849e4396-2c34-4e1a-85ff-9348a81dfd5d';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-618', 'Ujjal Joshi', NULL, '+977981100618', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '849e4396-2c34-4e1a-85ff-9348a81dfd5d', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Ujjal Joshi', email = NULL, phone = '+977981100618' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'faad02f6-8b08-4dc9-9d0f-1d288aad03de';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-619', 'Manoj Rajbhandari', NULL, '+977981100619', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', 'faad02f6-8b08-4dc9-9d0f-1d288aad03de', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Manoj Rajbhandari', email = NULL, phone = '+977981100619' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '70733707-46be-402b-a096-9fdf985c76c6';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-620', 'Shekhar Karki', 'shekharkarki687@gmail.com', '+977981100620', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '70733707-46be-402b-a096-9fdf985c76c6', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Shekhar Karki', email = 'shekharkarki687@gmail.com', phone = '+977981100620' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4e9e5ccc-96c0-43bd-a947-38f51e6853aa';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-621', 'Yaken Ak', NULL, '+977981100621', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '4e9e5ccc-96c0-43bd-a947-38f51e6853aa', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Yaken Ak', email = NULL, phone = '+977981100621' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '4aa3af31-b56c-41e3-9389-d17aeef466f3';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-622', 'Prasanna', 'prashnnakunwar32@gmail.com', '+977981100622', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '4aa3af31-b56c-41e3-9389-d17aeef466f3', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Prasanna', email = 'prashnnakunwar32@gmail.com', phone = '+977981100622' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '50a643ea-5e32-4118-9f00-00b34bb843a5';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-623', 'Pana Films', NULL, '+977981100623', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '50a643ea-5e32-4118-9f00-00b34bb843a5', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Pana Films', email = NULL, phone = '+977981100623' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = 'dfc20e63-7e20-41c7-9f31-09d8e59382a8';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-624', 'Saurav Lamichane', 'sauravlamichhane22@gmail.com', '+977981100624', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', 'dfc20e63-7e20-41c7-9f31-09d8e59382a8', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Saurav Lamichane', email = 'sauravlamichhane22@gmail.com', phone = '+977981100624' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '3440a7eb-47f3-48e5-80ad-5b89fcc6848a';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), 'C-625', 'Prabin Rawat', 'prabinrawat@gmail.com', '+977981100625', 'Kathmandu', 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '3440a7eb-47f3-48e5-80ad-5b89fcc6848a', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = 'Prabin Rawat', email = 'prabinrawat@gmail.com', phone = '+977981100625' WHERE id = v_client_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a8f81436-f8b2-4b93-b696-4c2aa93c4792';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-823', 'Customer Pickup', '2026-08-13T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'a8f81436-f8b2-4b93-b696-4c2aa93c4792', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'a5e3eef4-1e24-49db-b315-beaa5ff89c45';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-822', 'Customer Pickup', '2026-08-13T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'a5e3eef4-1e24-49db-b315-beaa5ff89c45', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f147d071-33db-4377-bb38-135acce1af03';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-821', 'Customer Pickup', '2026-08-13T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'f147d071-33db-4377-bb38-135acce1af03', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '3ca212a6-a85a-4b05-95c9-7bc7c914d495';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-820', 'Customer Pickup', '2026-08-14T06:15:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '3ca212a6-a85a-4b05-95c9-7bc7c914d495', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'b291be80-15a9-4854-8d42-f149d3071706';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-819', 'Customer Pickup', '2026-08-14T10:00:00.000000+00:00', '2026-08-15T10:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'b291be80-15a9-4854-8d42-f149d3071706', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '57ad0dc3-4f71-4445-8d81-1a0de5d39e7d';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-818', 'Customer Pickup', '2026-08-15T06:00:00.000000+00:00', '2026-08-16T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '57ad0dc3-4f71-4445-8d81-1a0de5d39e7d', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '0530b42d-d75e-4ca8-918f-12a564dd2ed3';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-817', 'Customer Pickup', NOW(), NOW(), 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '0530b42d-d75e-4ca8-918f-12a564dd2ed3', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '48091c8b-767e-470f-822e-3e33509fb613';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-816', 'Customer Pickup', NOW(), NOW(), 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '48091c8b-767e-470f-822e-3e33509fb613', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '7dba7a1f-359e-4a49-8a16-0a73e4db3f2b';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-815', 'Customer Pickup', '2026-08-12T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '7dba7a1f-359e-4a49-8a16-0a73e4db3f2b', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'f2f3a9a9-f64c-4381-9b42-e78e096e2799';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-814', 'Customer Pickup', '2026-08-13T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'f2f3a9a9-f64c-4381-9b42-e78e096e2799', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '5c54c8d1-b092-492a-8b72-a6758d0e6926';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-813', 'Customer Pickup', '2026-08-13T06:15:00.000000+00:00', '2026-08-15T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '5c54c8d1-b092-492a-8b72-a6758d0e6926', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '7e68b71f-96ba-40fd-873e-39f6c301a686';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-812', 'Customer Pickup', '2026-08-12T06:00:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'On Rent')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '7e68b71f-96ba-40fd-873e-39f6c301a686', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'On Rent' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '01e8e501-7326-4681-a129-dce46fe64700';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-811', 'Customer Pickup', NOW(), NOW(), 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '01e8e501-7326-4681-a129-dce46fe64700', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '187e0ccc-c795-40e8-b75f-f51ebdbd37f7';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-810', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Returned')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '187e0ccc-c795-40e8-b75f-f51ebdbd37f7', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Returned' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '0baf90c2-116e-4af1-b411-01df088c96f7';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-809', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Returned')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '0baf90c2-116e-4af1-b411-01df088c96f7', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Returned' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '2cd47007-fa90-49f7-8052-1ff8887bf457';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-808', 'Customer Pickup', '2026-08-11T06:00:00.000000+00:00', '2026-08-12T06:00:00.000000+00:00', 'Returned')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '2cd47007-fa90-49f7-8052-1ff8887bf457', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Returned' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'e52cee21-ff5d-44a8-9580-6cda6800d2bd';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-807', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Returned')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'e52cee21-ff5d-44a8-9580-6cda6800d2bd', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Returned' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '36d53af5-953d-4e9e-ac3a-d7f009febac9';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-806', 'Customer Pickup', '2026-08-10T06:15:00.000000+00:00', '2026-08-14T06:00:00.000000+00:00', 'On Rent')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '36d53af5-953d-4e9e-ac3a-d7f009febac9', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'On Rent' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '091ac502-5095-42c5-b160-f95f1677fdd4';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-805', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '091ac502-5095-42c5-b160-f95f1677fdd4', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'ce8dfdf6-62b9-44df-9be7-604852bbb782';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-804', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'ce8dfdf6-62b9-44df-9be7-604852bbb782', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'd2c8ce3f-cf2b-4606-8525-85d47860b268';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-803', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'd2c8ce3f-cf2b-4606-8525-85d47860b268', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = 'e8d96051-021e-445d-a1b2-cd46f6d0703b';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-802', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', 'e8d96051-021e-445d-a1b2-cd46f6d0703b', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '61c12952-c5c3-404e-8972-8b204a68e492';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-801', 'Customer Pickup', '2026-08-10T06:15:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '61c12952-c5c3-404e-8972-8b204a68e492', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '32bcc7dd-f448-4985-b1c7-fc6b218245cd';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-800', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '32bcc7dd-f448-4985-b1c7-fc6b218245cd', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    

      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '879e757f-b94d-4b20-be0e-0e29c6319b69';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_client_id, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'B-799', 'Customer Pickup', '2026-08-10T06:00:00.000000+00:00', '2026-08-11T06:00:00.000000+00:00', 'Booked')
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '879e757f-b94d-4b20-be0e-0e29c6319b69', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = 'Booked' WHERE id = v_booking_id;
        END IF;
      END $$;
    
COMMIT;