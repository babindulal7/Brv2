-- =============================================================================
-- 0099 — `create_booking` could not write a discounted booking at all.
--
-- TWO independent defects on the same eight lines, each of which alone refuses
-- every discounted booking. The first was found by reading; the second by
-- running `check:lifecycle` L1 (R-27) against a real Postgres as a real
-- Coordinator, ten minutes after the first was fixed — which is the whole
-- argument for that script in one paragraph.
--
-- ## Defect 1 — an audit class that is not in the enum
--
-- ## The defect, reproduced before it was fixed
--
-- PGlite, full chain from scratch, 8 Sep 2026. The same payload twice — once
-- bare, once carrying one 10% `Manual` discount:
--
--     select create_booking('{… lines:[1 line] …}');
--     -> {"booking_no": "900", "stage": "Quote", "line_count": 1}
--
--     select create_booking('{… lines:[1 line], discounts:[{percent:10}] …}');
--     -> ERROR:  invalid input value for enum audit_event_class: "data change"
--
-- Every discounted booking has been refused since `0063` introduced the
-- discount loop, through `0065`, `0070` and `0071`, each of which carried the
-- literal forward verbatim. The booking, its lines and its units all roll back
-- with it: the caller gets no booking at all, not a booking missing a discount.
--
-- ## Why nothing caught it
--
-- `audit_event_class` (`0001_enums.sql`) has exactly six members —
--
--     status change | money movement | discount | override | session | cancellation
--
-- — "the six event classes the log must capture" (Foundation §10). `'data
-- change'` is not one of them and never was. Postgres cannot reject an unknown
-- enum label at `create function` time: the literal sits inside a plpgsql body
-- and is only cast when the line executes. So the chain builds green, the file
-- reads plausibly, and the failure waits for the first discounted booking.
--
-- 2,834 unit tests were green over this. They exercise `createRental` against
-- the mock client in `src/lib/mock/client.ts`, which has its own audit path and
-- never casts to the enum — the seam that `RULINGS-2026-09-08` R-27 exists to
-- close. `check:lifecycle` L1 is this exact call.
--
-- ## The fix
--
-- One literal: `'data change'` -> `'discount'`. Not a new enum member. A row
-- recording that a discount was applied to a booking is a discount event; the
-- class was named for this and RLS masks on it (`0077`: Warehouse does not see
-- money-movement rows). Adding a seventh member to satisfy a typo would widen a
-- Foundation-locked contract that every masking policy reads.
--
-- Everything else in this function is `0071` **verbatim** — extracted
-- mechanically from that file and re-emitted with the single literal replaced,
-- so the diff between the two files is one line and nothing was retyped.
--
-- ## Defect 2 — `INSERT ... RETURNING` applies the SELECT policy
--
-- With the enum fixed, the same call still failed — for Coordinator and
-- Warehouse, and not for Owner:
--
--     set role authenticated;
--     set app.current_user_id = <a Coordinator>;
--     insert into audit_events (…) values (…);              -- ok
--     insert into audit_events (…) values (…) returning id;  -- ERROR
--       new row violates row-level security policy for table "audit_events"
--
-- The write is permitted (`audit_events_insert` is `with check (true)` for
-- `authenticated`); the READ BACK is not. Postgres applies a table's SELECT
-- policies to the rows a `RETURNING` clause hands back, and
-- `audit_events_select` admits `Owner · Admin · Manager` only — Foundation §10,
-- deliberately. So `returning id into v_audit_id` turned a legal insert into a
-- refusal for precisely the two roles that take bookings: the Coordinator at the
-- booking desk and Warehouse.
--
-- Fixed by minting the key in the function and inserting it, so nothing is read
-- back. Not by widening `audit_events_select` — that would open the audit log to
-- six more roles to satisfy one function's convenience, and B-1 forbids
-- resolving a conflict by widening.
--
-- ## Applying this
--
-- ⚠ NOT APPLIED to the live project. Live stands at `0001`–`0078` plus `0089`
-- (ledger re-read 8 Sep 2026); this file's predecessors `0063`/`0065`/`0070`/
-- `0071` ARE live, so live carries the defect today and a discounted booking
-- fails on production right now. Fixing that is a one-function replace with no
-- table touched and no data migration, but per CLAUDE.md it still waits for
-- explicit approval.
-- =============================================================================
--
-- ✅ **APPLIED TO PRODUCTION, 8 Sep 2026.** The line above was true when it was
-- written and is superseded, not deleted (Law 3 applies to prose here too).
-- Babin lifted N-5 in writing — "now apply everything" — and a concurrent
-- session applied `0079`-`0103` to `sxguwvgoserhdolewibb` in filename order
-- through the MCP `apply_migration` channel, each file whole with its own
-- `begin;`/`commit;`. Its PROGRESS.md entry carries the live measurements.
-- Verify against `supabase_migrations.schema_migrations` before trusting THIS
-- line too; headers in this directory have been wrong before, including this
-- one, twice.

begin;

create or replace function create_booking(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_uuid   uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id    uuid;
  v_existing_no    text;
  v_existing_stage text;
  v_booking_id    uuid;
  v_booking_no    text;
  v_actor         uuid := (p_payload ->> 'created_by')::uuid;
  v_branch        uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines         jsonb;
  v_line          jsonb;
  v_discount      jsonb;
  v_audit_id      uuid;
  v_line_count    integer := 0;
  v_unit_count    integer := 0;
  v_pending       jsonb;
  v_next          jsonb;
  v_parent_key    uuid;
  v_parent_id     uuid;
  v_wrote         integer;
  v_line_id       uuid;
  v_unit          jsonb;
  v_asset_product uuid;
  v_dupe_assets   integer;
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  -- Named columns only, carried forward from 0065: under 0062 a select-star
  -- here would 42501 on the ungranted `deposit_required` for every role.
  select id, booking_no, stage::text
    into v_existing_id, v_existing_no, v_existing_stage
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id', v_existing_id,
      'booking_no', v_existing_no,
      'stage',      v_existing_stage,
      'replayed',   true
    );
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    p_payload ->> 'project',
    (p_payload ->> 'pickup_at')::timestamptz,
    (p_payload ->> 'return_at')::timestamptz,
    (p_payload ->> 'delivery_type')::delivery_type,
    p_payload ->> 'pickup_location',
    p_payload ->> 'return_location',
    (p_payload ->> 'quote_expires_at')::timestamptz,
    coalesce((p_payload ->> 'deposit_required')::numeric, 0),
    v_actor,
    v_actor
  )
  returning id into v_booking_id;

  -- ── Lines, in dependency order ───────────────────────────────────────────
  -- `days` is passed through, never defaulted here (Law 9), and every line is
  -- validated BEFORE the first insert so a bad line later in the array cannot
  -- leave a half-built tree behind. The transaction would roll it back anyway;
  -- validating first is what makes the error name the line rather than a
  -- constraint.
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    -- D5 pre-validation: the units array, when present, must be coherent with
    -- the line it rides on. Checked before the first insert for the same
    -- reason as `days`.
    if jsonb_array_length(coalesce(v_line -> 'units', '[]'::jsonb))
         > coalesce((v_line ->> 'qty')::integer, 1) then
      raise exception
        'create_booking: line % carries more units (%) than its qty (%). Nothing was created.',
        v_line ->> 'client_uuid',
        jsonb_array_length(v_line -> 'units'),
        coalesce((v_line ->> 'qty')::integer, 1);
    end if;
    for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
    loop
      if v_unit ->> 'client_uuid' is null then
        raise exception 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)';
      end if;
      if v_unit ->> 'asset_id' is null then
        raise exception 'create_booking: a unit entry on line % names no asset_id', v_line ->> 'client_uuid';
      end if;
    end loop;
  end loop;

  -- One physical unit cannot be assigned twice on one booking, and no schema
  -- constraint says so (`booking_line_units` has no unique on asset_id).
  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) as l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) as u;
  if v_dupe_assets > 0 then
    raise exception
      'create_booking: the same physical unit appears % extra time(s) across this booking''s units. Nothing was created.',
      v_dupe_assets;
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_wrote := 0;
    v_next := '[]'::jsonb;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;
      v_parent_id  := (v_line ->> 'parent_line_id')::uuid;

      if v_parent_key is not null then
        -- Resolve against the rows written for THIS booking only. Scoping to
        -- the booking is what stops a payload pointing a child at some other
        -- booking's line, which the self-FK alone would happily accept.
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          -- Parent not written yet. Defer; a later pass picks it up.
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
      end if;

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by
      )
      values (
        (v_line ->> 'client_uuid')::uuid,
        v_booking_id,
        (v_line ->> 'line_type')::booking_line_type,
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        (v_line ->> 'days')::integer,
        coalesce((v_line ->> 'rate')::numeric, 0),
        coalesce((v_line ->> 'discount_amount')::numeric, 0),
        coalesce((v_line ->> 'is_included')::boolean, false),
        (v_line ->> 'service_basis')::service_basis,
        (v_line ->> 'supplier_id')::uuid,
        (v_line ->> 'supplier_cost')::numeric,
        (v_line ->> 'markup_amount')::numeric,
        v_line ->> 'line_note',
        coalesce((v_line ->> 'sort_order')::integer, v_line_count),
        v_actor
      )
      returning id into v_line_id;

      -- ── D5: the creation-time unit assignment ──────────────────────────
      -- One row per unit entry, qty 1 each — the serial chips of spec §10.2.
      -- Removing one later is a DELETE of that row, not an edit of the line.
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        -- A serial from another product on this line is a mis-scan; the FK
        -- alone would accept it, so it is refused by name here.
        if v_line ->> 'product_id' is not null then
          select product_id into v_asset_product
            from product_units
           where id = (v_unit ->> 'asset_id')::uuid;
          if v_asset_product is null then
            raise exception 'create_booking: unit % on line % names no known product_unit',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
          if v_asset_product <> (v_line ->> 'product_id')::uuid then
            raise exception
              'create_booking: unit % belongs to a different product than line %. Nothing was created.',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
        end if;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (
          (v_unit ->> 'client_uuid')::uuid,
          v_line_id,
          (v_unit ->> 'asset_id')::uuid,
          1,
          v_actor
        );
        v_unit_count := v_unit_count + 1;
      end loop;

      v_line_count := v_line_count + 1;
      v_wrote := v_wrote + 1;
    end loop;

    if v_wrote = 0 then
      raise exception
        'create_booking: % line(s) name a parent_client_uuid that is not on this booking (or the parents form a cycle). Nothing was created.',
        jsonb_array_length(v_next);
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  -- Each needs an `audit_events` row FIRST, because `audit_event_id` is NOT
  -- NULL. This ordering is the reason the whole operation must be one
  -- transaction and cannot be four PostgREST calls.
  --
  -- `audit_client_uuid` is the audit ROW's own Law 8 key and is distinct from
  -- the discount's. 0063 read it and nothing sent it, so `audit_events.
  -- client_uuid` (NOT NULL) rejected every discounted booking. A generated
  -- fallback keeps the write possible for a caller that has not been updated;
  -- `createRental` now sends one so the key is the caller's, as Law 8 wants.
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    v_audit_id := gen_random_uuid();

    insert into audit_events (
      id, client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      v_audit_id,
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
      -- 0099: this was 'data change', which `audit_event_class` has never
      -- had. Every discounted booking raised 22P02 right here and rolled the
      -- whole create — header, lines, units — back with it. A row recording
      -- that a discount was applied is a discount event; 'discount' is one of
      -- the six Foundation §10 classes and is what the 0077 masking policies
      -- read.
      'discount',
      'Rentals',
      'Rentals',
      'Create',
      'Informational',
      'Success',
      'booking_discounts',
      v_booking_id,
      v_actor,
      v_branch,
      v_discount ->> 'reason',
      jsonb_build_object(
        'discount_source', v_discount ->> 'discount_source',
        'percent',         v_discount ->> 'percent',
        'booking_no',      v_booking_no
      )
      -- 0099, second defect: the id is MINTED HERE and inserted, where this
      -- said `returning id into v_audit_id`.
      --
      -- `INSERT ... RETURNING` applies the table's SELECT policy to the row it
      -- gives back, and `audit_events_select` admits Owner, Admin and Manager
      -- only. So the RETURNING refused the write for exactly the two roles whose
      -- job this is:
      --
      --     as Coordinator: ERROR  new row violates row-level security policy
      --                            for table "audit_events"
      --     as Owner:       ok
      --
      -- The same INSERT without RETURNING succeeded as Coordinator, which is what
      -- isolates the cause to the read-back and not to the write. Widening
      -- `audit_events_select` would have been the wrong fix twice over: it makes
      -- the audit log readable by roles Foundation §10 keeps it from, and B-1
      -- says a conflict is never resolved by widening. Minting the key removes
      -- the read instead of granting it.
    );

    insert into booking_discounts (
      client_uuid, booking_id, branch_id, discount_source, percent,
      reason, approver_id, applied_by, coupon_id, audit_event_id
    )
    values (
      (v_discount ->> 'client_uuid')::uuid,
      v_booking_id,
      v_branch,
      (v_discount ->> 'discount_source')::discount_source,
      (v_discount ->> 'percent')::numeric,
      v_discount ->> 'reason',
      (v_discount ->> 'approver_id')::uuid,
      v_actor,
      (v_discount ->> 'coupon_id')::uuid,
      v_audit_id
    );
  end loop;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_no', v_booking_no,
    'stage',      'Quote',
    'line_count', v_line_count,
    'unit_count', v_unit_count,
    'replayed',   false
  );
end;
$$;
comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + optional per-line unit assignments + '
  'discounts) in a single transaction. SECURITY INVOKER — every insert faces '
  'its own RLS policy. Idempotent on bookings.client_uuid (Law 8): a replay '
  'returns the existing booking and writes nothing, including no sequence '
  'advance. Lines are inserted in dependency order so a bundle child may name '
  'its parent by that parent''s client_uuid (parent_client_uuid). Per D5 '
  '(ruled 30 Aug 2026) a line may carry units[] — serials assigned at '
  'creation, one booking_line_units row each; absent means unit-less, and '
  'Pack confirms or fills. Reservation with the GiST defence still happens at '
  'Confirm, not here. Prices nothing — src/lib/money.ts owns pricing (Law 1). '
  '0099: the discount audit row is class ''discount''; it was ''data change'', '
  'which is not a member of audit_event_class, so every discounted booking was '
  'refused outright.';

-- ── Post-conditions ─────────────────────────────────────────────────────────
-- Proves the literal is gone from the DEPLOYED body, not from the file.
-- `pg_get_functiondef` reads what the server actually holds, which is the only
-- thing a later reader can trust — this repo has shipped migrations whose
-- headers described a body the server did not have.
do $chk$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_booking';

  if v_def is null then
    raise exception 'POST-CONDITION 1 FAILED: public.create_booking(jsonb) does not exist after this migration.';
  end if;

  -- The literal survives in the explanatory comment beside the fix, so the test
  -- is for the LITERAL IN A VALUE POSITION, not for the words anywhere.
  if position('      ''data change'',' in v_def) > 0 then
    raise exception 'POST-CONDITION 2 FAILED: the deployed create_booking body still writes the audit class ''data change''.';
  end if;
  if position('      ''discount'',' in v_def) = 0 then
    raise exception 'POST-CONDITION 3 FAILED: the deployed create_booking body does not write ''discount'' as the audit class.';
  end if;

  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'audit_event_class' and e.enumlabel = 'discount'
  ) then
    raise exception 'POST-CONDITION 4 FAILED: audit_event_class has no ''discount'' member — this fix assumed one of the six Foundation classes and it is gone.';
  end if;

  if (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'audit_event_class') <> 6 then
    raise exception 'POST-CONDITION 5 FAILED: audit_event_class no longer holds exactly six members. Foundation §10 locks the six; a seventh means the 0077 masking policies need re-reading.';
  end if;

  -- POST-CONDITION 6 — behavioural, and as the role that could not do it.
  -- Structural checks would have passed over defect 2 entirely: the body reads
  -- correctly, the enum is right, and the failure only exists under a policy.
  -- So this runs the real call, as a real Coordinator, and undoes itself by
  -- aborting the subtransaction it ran in (bookings refuse DELETE — Law 3).
  declare
    v_coordinator uuid;
    v_branch      uuid;
    v_client      uuid;
    v_product     uuid;
    v_result      jsonb;
    v_ran         boolean := false;
  begin
    select id into v_coordinator from users where primary_role = 'Coordinator' and is_active limit 1;
    select id into v_branch      from branches limit 1;
    select id into v_client      from clients limit 1;
    select id into v_product     from products limit 1;

    if v_coordinator is null or v_branch is null or v_client is null or v_product is null then
      raise notice '0099: no Coordinator / branch / client / product here; the behavioural check was skipped.';
    else
      begin
        perform set_config('app.current_user_id', v_coordinator::text, true);
        set local role authenticated;

        v_result := create_booking(jsonb_build_object(
          'client_uuid',   gen_random_uuid(),
          'created_by',    v_coordinator,
          'branch_id',     v_branch,
          'client_id',     v_client,
          'pickup_at',     '2099-12-01T04:00:00Z',
          'return_at',     '2099-12-03T04:00:00Z',
          'delivery_type', 'Babin Delivery',
          'lines', jsonb_build_array(jsonb_build_object(
            'client_uuid', gen_random_uuid(),
            'line_type',   'Equipment',
            'product_id',  v_product,
            'description', '0099 post-condition line',
            'qty', 1, 'days', 2, 'rate', 3500
          )),
          'discounts', jsonb_build_array(jsonb_build_object(
            'client_uuid',       gen_random_uuid(),
            'audit_client_uuid', gen_random_uuid(),
            'client_id',         v_client,
            'discount_source',   'Manual',
            'percent',           10,
            'reason',            'Repeat client, agreed on the phone'
          ))
        ));

        reset role;

        if v_result ->> 'booking_id' is null then
          raise exception 'POST-CONDITION 6 FAILED: create_booking returned no booking_id for a discounted booking.';
        end if;
        if not exists (
          select 1 from booking_discounts where booking_id = (v_result ->> 'booking_id')::uuid
        ) then
          raise exception 'POST-CONDITION 6 FAILED: the discounted booking was created with no booking_discounts row.';
        end if;

        v_ran := true;
        raise exception using errcode = 'P0001', message = '__0099_rollback_probe__';
      exception when others then
        reset role;
        if sqlerrm <> '__0099_rollback_probe__' then
          raise exception
            'POST-CONDITION 6 FAILED: a Coordinator could not create a discounted booking — %', sqlerrm;
        end if;
      end;

      if not v_ran then
        raise exception 'POST-CONDITION 6 FAILED: the behavioural probe did not complete.';
      end if;
    end if;
  end;

  raise notice '0099 post-conditions passed: create_booking writes its discount audit row as class ''discount'' without reading it back, audit_event_class still holds exactly the six Foundation classes, and a COORDINATOR can create a discounted booking.';
end;
$chk$;

commit;
