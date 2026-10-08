-- =============================================================================
-- 0128_transition_cinema_assets_to_serialized.sql — AUD-020 (P2)
--
-- Transition Key Cinema Assets to Serialized Mode:
-- 1. Inserts/updates top-tier cinema cameras and cinema lenses with
--    tracking_mode = 'Serialised'.
-- 2. Seeds physical product_units for each cinema asset with unique asset tags,
--    serials, barcodes, and warehouse locations.
-- 3. Synchronizes products.total_quantity to match active unit counts.
-- =============================================================================

do $$
declare
  v_branch_id uuid;
  v_warehouse_id uuid;
  v_zone_cam_id uuid;
  v_zone_lens_id uuid;
  v_cat_cam_id uuid;
  v_cat_lens_id uuid;
  v_creator_id uuid;
  r record;
  v_unit_idx integer;
  v_tag text;
  v_sn text;
  v_zone_id uuid;
begin
  -- Resolve primary branch and warehouse
  select id into v_branch_id from branches where branch_code = 'BR-KTM-01' limit 1;
  if v_branch_id is null then
    select id into v_branch_id from branches order by created_at limit 1;
  end if;

  select id into v_warehouse_id from warehouses where warehouse_code = 'WH-KTM-MAIN' limit 1;
  if v_warehouse_id is null then
    select id into v_warehouse_id from warehouses order by created_at limit 1;
  end if;

  select id into v_zone_cam_id from storage_zones where code = 'ZONE-CAM-A' limit 1;
  select id into v_zone_lens_id from storage_zones where code = 'ZONE-LENS-B' limit 1;

  select id into v_cat_cam_id from inventory_categories where code = 'camera' limit 1;
  select id into v_cat_lens_id from inventory_categories where code = 'lens' limit 1;

  select id into v_creator_id from users where email = 'warehouse@babinrentals.com' limit 1;
  if v_creator_id is null then
    select id into v_creator_id from users order by created_at limit 1;
  end if;

  -- 1. Ensure the 14 cinema products exist in products with tracking_mode = 'Serialised'
  insert into products (
    client_uuid, asset_code, name, category_id, brand, model,
    tracking_mode, status, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
  ) values
    (gen_random_uuid(), 'EQ000066', 'DJI Ronin 4D 6K 4-Axis Cinema Camera System', v_cat_cam_id, 'DJI', 'Ronin 4D 6K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 12000.00, 1100000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000128', 'RED KOMODO 6K Cinema Camera (Body Only)', v_cat_cam_id, 'RED', 'KOMODO 6K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 15000.00, 1200000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000129', 'RED Komodo X 6k Cinema Camera (Body Only)', v_cat_cam_id, 'RED', 'Komodo X 6K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 18000.00, 1500000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000130', 'RED V-Raptor 8K VV Cinema Camera (Body Only)', v_cat_cam_id, 'RED', 'V-Raptor 8K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 25000.00, 2400000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000189', 'Sony BURANO 8K Digital Cinema Camera (Body Only)', v_cat_cam_id, 'Sony', 'BURANO 8K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 30000.00, 3200000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000191', 'Sony FX3 Cinema Line Camera (Body Only)', v_cat_cam_id, 'Sony', 'ILME-FX3', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 4500.00, 550000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000192', 'Sony FX30 Cinema Line Camera (Body Only)', v_cat_cam_id, 'Sony', 'ILME-FX30', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 3000.00, 320000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000193', 'Sony FX6 Cinema Camera (Body Only)', v_cat_cam_id, 'Sony', 'ILME-FX6', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 8000.00, 950000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000035', 'Blazar Great Joy 1.8x T2.9 Anamorphic lens set (PL)', v_cat_lens_id, 'Blazar', 'Great Joy 1.8x Set', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 10000.00, 1200000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000036', 'BLAZAR LENS MANTIS 1.33x Anamorphic 5-Lens Set (ARRI PL)', v_cat_lens_id, 'Blazar', 'MANTIS 1.33x Set', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 14000.00, 1800000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000049', 'CHIOPT XTREME Zoom Lens 28–85mm T3.2', v_cat_lens_id, 'CHIOPT', 'XTREME 28-85mm T3.2', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 6000.00, 650000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000050', 'CHIOPT XTREME Zoom Lens 75–250mm T3.2', v_cat_lens_id, 'CHIOPT', 'XTREME 75-250mm T3.2', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 6000.00, 650000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000112', 'Meike Full Frame lens set (PL Mount)', v_cat_lens_id, 'Meike', 'FF Cine Set PL', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 7500.00, 800000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000113', 'NiSi ATHENA PRIME Cinema Lens Series', v_cat_lens_id, 'NiSi', 'ATHENA PRIME 5-Lens Set', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 9000.00, 1100000.00, 1, true, true, v_creator_id)
  on conflict (asset_code) do update
  set tracking_mode = 'Serialised'::product_tracking_mode,
      category_id = excluded.category_id;

  -- 2. Seed 2 physical units for each cinema asset if not already present
  for r in
    select p.id, p.asset_code, p.name, p.replacement_value, c.code as cat_code
    from products p
    left join inventory_categories c on c.id = p.category_id
    where p.asset_code in (
      'EQ000066', 'EQ000128', 'EQ000129', 'EQ000130', 'EQ000189', 'EQ000191', 'EQ000192', 'EQ000193',
      'EQ000035', 'EQ000036', 'EQ000049', 'EQ000050', 'EQ000112', 'EQ000113'
    )
  loop
    v_zone_id := case when r.cat_code = 'lens' then coalesce(v_zone_lens_id, v_zone_cam_id) else coalesce(v_zone_cam_id, v_zone_lens_id) end;

    for v_unit_idx in 1..2 loop
      v_tag := r.asset_code || '-U0' || v_unit_idx;
      v_sn  := 'SN-' || r.asset_code || '-0' || v_unit_idx;

      insert into product_units (
        client_uuid,
        product_id,
        serial_no,
        asset_tag,
        barcode,
        qr_code,
        status,
        condition,
        branch_id,
        warehouse_id,
        storage_zone_id,
        replacement_value,
        created_by
      ) values (
        gen_random_uuid(),
        r.id,
        v_sn,
        v_tag,
        v_tag,
        'https://babinrentals.com/qr/' || v_tag,
        'In Stock'::inventory_state,
        'Good'::unit_condition,
        v_branch_id,
        v_warehouse_id,
        v_zone_id,
        coalesce(r.replacement_value, 1500000.00),
        v_creator_id
      )
      on conflict (asset_tag) do nothing;
    end loop;

    -- 3. Synchronize total_quantity to count of non-retired units
    update products
    set total_quantity = (
      select count(*)
      from product_units
      where product_id = r.id and status <> 'Retired'
    )
    where id = r.id;
  end loop;
end;
$$;
