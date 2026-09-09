-- =============================================================================
-- 0096 — `create_invoice(jsonb)`: the one transaction that makes a Draft exist.
--
-- DRAFT — **NOT APPLIED**, and it cannot be applied before
-- `0086_invoice_write_rights_and_draft_without_number.sql`, which makes
-- `invoices.invoice_no` nullable and gives `invoice_lines` a write policy at
-- all. Verify the ledger (`supabase_migrations.schema_migrations`) before
-- trusting this header; headers in this directory have been wrong before.
--
-- Closes the write half of **DB-03** and the whole of **DATA-01**
-- (REMEDIATION_AUDIT_2026-09-05, ISSUE-003 option B / ISSUE-008 option B).
--
-- ## Why a function and not three PostgREST calls
--
-- `src/actions/finance/createInvoice.ts` wrote the header, then looped one
-- `invoice_lines` insert per booking line. PostgREST gives a browser no
-- transaction, so a failure between the header and the last line leaves a
-- header with some of its lines and totals that under-bill the job — and its
-- own error text told the operator to *void it rather than retry*, which is an
-- admission that the shape cannot be made safe from the client side. Both
-- close gates read `outstanding_amount`, so a header with no lines reads as
-- fully paid and a rental closes unbilled.
--
-- One function call is one transaction. Either the whole invoice exists or none
-- of it does. This is the shape `create_booking` (0063) already established and
-- the shape the audit's recommended architecture names for every verb.
--
-- ## SECURITY DEFINER, and why not INVOKER
--
-- `create_booking` is SECURITY INVOKER and that is the better default: each
-- insert faces its own RLS policy as the calling user, so the policy set is the
-- gate and the function cannot quietly out-rank it. This function cannot be
-- written that way, and the reason is measured, not assumed. Probed on the live
-- project (`sxguwvgoserhdolewibb`) on 7 Sep 2026:
--
--   1. **The money columns are not readable from the base tables by anybody.**
--      0062 revoked table-level SELECT on `booking_lines` and
--      `booking_transport` and granted back only the non-money columns, so
--      `has_column_privilege('authenticated','booking_lines','rate','SELECT')`
--      is false for **every** signed-in session, Owner included. Every user of
--      this application is the same Postgres role, `authenticated`, so there is
--      no grant that could distinguish them. That is DATA-01.
--
--   2. **The masking views — the invoker-rights route — do not cover the ruled
--      role set.** `booking_lines_v` and `booking_crew_lines_v` are gated on
--      `auth_is_staff()` and would serve all four R-05 roles. But
--      `booking_transport_v` ends in
--
--        where auth_user_role() = any (array['Owner','Admin','Coordinator',
--                                            'Warehouse','Driver'])
--
--      and the base table's only SELECT policy, `booking_transport_driver_read`,
--      carries the identical list. **Manager and Accounts are in neither** —
--      two of the four roles R-05 names. An invoker-rights snapshot raised by a
--      Manager or by Accounts would read zero transport rows, bill no delivery
--      and no fuel, and say nothing: a silent under-bill on an invoice that
--      looks entirely normal. It could not even detect the omission, because
--      counting the rows it is missing needs the same refused read.
--
--      A silent under-bill is the one outcome worse than a refusal, so invoker
--      rights are not available here until that policy and that view are
--      re-cut. Re-cutting them is a Law 6 grant-contract change (SEC-04 /
--      DB-02), not this migration's business.
--
-- So: definer rights, and **the role check below is the gate that RLS would
-- otherwise be**. It is stated in one place, first, before anything is read or
-- written, and it names the same four roles as 0086's four policies. Those
-- policies are not thereby decoration — they still govern every direct
-- PostgREST write to both tables, which is the path DB-03 was filed against.
--
-- Two consequences of definer rights are handled deliberately:
--
--   · **EXECUTE is not public.** A definer function inherits `PUBLIC` execute by
--     default, which would hand `anon` — the key that ships in the browser
--     bundle — a route into `invoices`. Revoked below, granted to
--     `authenticated` only.
--   · **A money-blind session is refused, not zeroed.** `auth_can_view_money()`
--     is checked explicitly even though the R-05 set already implies it. Under
--     definer rights a Warehouse caller would read real numbers rather than the
--     views' `NULL`s, and under any future invoker variant it would read `NULL`s
--     that `coalesce` to zero. Both are wrong in the same direction — an
--     invoice for nothing — and both are refused by name here.
--
-- ## Idempotent on `client_uuid` (Law 8)
--
-- `invoices_client_uuid_key` is a unique constraint. This function looks first,
-- and if an invoice already carries the key it returns that invoice with
-- `replayed: true` and **writes nothing at all** — not a line, not a second
-- header. A replay reads the totals back as they stand, so the caller gets the
-- same answer it got the first time.
--
-- Each line reuses its SOURCE row's `client_uuid` as its own key
-- (`invoice_lines.client_uuid` is UNIQUE), which is what
-- `src/actions/finance/createInvoice.ts` already did. That makes the line set
-- deterministic for a given booking and is why R-03 below refuses a second
-- invoice on the same booking rather than colliding halfway through it.
--
-- ## This function prices NOTHING and mints NOTHING
--
-- Law 1: the pricing order lives in `src/lib/money.ts` and the stored figures
-- are derived by `recalculate_invoice_totals`, which fires on every
-- `invoice_lines` write. The header is inserted with its money columns at their
-- zero defaults and the totals are re-read afterwards, so this function never
-- becomes a second writer for a number the trigger owns. `discount_amount` in
-- particular is never written (R-17 — it is derived from `discount_percent`).
--
-- ⚠ The live trigger rounds to 2 dp and hardcodes `0.13` where `lib/money.ts`
-- rounds to the whole rupee and reads the rate from the row. That disagreement
-- is MONEY-03 and its fix is `0098_invoice_totals_match_engine`; this function
-- returns whatever the trigger computed, so it inherits the fix for free and
-- adds no third opinion.
--
-- R-15: `next_document_number('invoice')` is **not** called. A Draft carries no
-- number, so an abandoned draft burns no identifier and leaves no gap in the
-- issued sequence, which Nepal IRD sequencing forbids. The number is minted by
-- `issue_invoice` (SPEC-P0-1 §3.3), which is not written yet.
--
-- ## A Draft with no lines is permitted
--
-- Deliberately. SPEC-P0-1 §3.1 creates the Draft and §3.2 appends to it for the
-- whole rental (R-02, R-03) — damage and late fees arrive at return — so a
-- Draft is empty between its creation and its first line. Refusing to *issue* a
-- Draft that never gained a line belongs to `issue_invoice`, where a figure
-- becomes final and a tax number is minted. Out of scope here; see the same
-- note in 0086.
-- =============================================================================

begin;

create or replace function create_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_uuid  uuid    := (p_payload ->> 'client_uuid')::uuid;
  v_actor        uuid    := (p_payload ->> 'created_by')::uuid;
  v_booking_no   text    := nullif(btrim(coalesce(p_payload ->> 'booking_no', '')), '');
  v_booking_key  uuid    := (p_payload ->> 'booking_id')::uuid;
  v_vat_rate     numeric := (p_payload ->> 'vat_rate')::numeric;
  v_notes        text    := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  v_role         system_role;
  v_existing     invoices%rowtype;
  v_booking_id   uuid;
  v_resolved_no  text;
  v_client_id    uuid;
  v_branch_id    uuid;
  v_cancelled    timestamptz;
  v_terms        text;
  v_term_days    integer;
  v_due_date     date;
  v_discounts    integer;
  v_percent      numeric := 0;
  v_prior        record;
  v_invoice_id   uuid;
  v_line_count   integer := 0;
  v_written      integer;
  v_totals       invoices%rowtype;
begin
  -- ── Rights, first, before anything is read ────────────────────────────────
  -- R-05: Owner · Admin · Manager · Accounts may raise an invoice. This is the
  -- gate, because definer rights mean RLS will not be. It repeats 0086's four
  -- policies on purpose; the post-conditions below prove the two agree by
  -- calling this function as a Coordinator and as Warehouse.
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'create_invoice: this session (%) may not raise an invoice. R-05 gives that to Owner, Admin, Manager and Accounts. Nothing was created.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- Law 6. Redundant while auth_can_view_money() excludes exactly the roles
  -- R-05 omits, and kept so that it stays true if either definition moves. A
  -- money-blind caller is refused by name rather than billing zero.
  if not auth_can_view_money() then
    raise exception
      'create_invoice: this session cannot read money (Law 6), so the invoice it raised would bill nothing. Nothing was created.'
      using errcode = '42501';
  end if;

  if v_client_uuid is null then
    raise exception 'create_invoice: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_invoice: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written ────────────────────────
  select * into v_existing from invoices where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'invoice_id',      v_existing.id,
      'invoice_no',      v_existing.invoice_no,
      'status',          v_existing.status,
      'booking_id',      v_existing.booking_id,
      'booking_no',      (select booking_no from bookings where id = v_existing.booking_id),
      'client_id',       v_existing.client_id,
      'due_date',        v_existing.due_date,
      'line_count',      (select count(*) from invoice_lines where invoice_id = v_existing.id),
      'subtotal',        v_existing.subtotal,
      'discount_amount', v_existing.discount_amount,
      'taxable_amount',  v_existing.taxable_amount,
      'vat_amount',      v_existing.vat_amount,
      'total',           v_existing.total_amount,
      'replayed',        true
    );
  end if;

  -- ── The booking this bills ────────────────────────────────────────────────
  -- Either key is accepted; `booking_no` is what the operator saw on screen and
  -- what the action holds, `booking_id` is what a server-side caller holds.
  if v_booking_key is null and v_booking_no is null then
    raise exception 'create_invoice: an invoice must name the booking it bills (booking_id or booking_no).';
  end if;

  select b.id, b.booking_no, b.client_id, b.branch_id, b.cancelled_at
    into v_booking_id, v_resolved_no, v_client_id, v_branch_id, v_cancelled
    from bookings b
   where (v_booking_key is not null and b.id = v_booking_key)
      or (v_booking_key is null and b.booking_no = v_booking_no);

  if not found then
    raise exception
      'create_invoice: no booking % exists, so there is nothing to invoice and nothing was created.',
      coalesce(v_booking_key::text, v_booking_no);
  end if;

  -- A cancelled booking is not invoiced from here. Whether a cancellation
  -- carries a fee is explicitly unruled (PLAN.md §4.16), so this refuses rather
  -- than deciding it — the same position `createInvoice.ts` took.
  if v_cancelled is not null then
    raise exception
      'create_invoice: booking % was cancelled on %. Whether a cancellation carries a fee is an open ruling (PLAN.md §4.16), so nothing was created.',
      v_resolved_no, v_cancelled::date;
  end if;

  -- ── R-03 · one invoice per rental ─────────────────────────────────────────
  -- Checked after the replay check, so a genuine retry of the same press is a
  -- replay and only a SECOND intent is refused. Refuses on ANY existing
  -- invoice including a voided one, which is stricter than SPEC-P0-1 §3.1's
  -- "no non-Void invoice": the line keys are the booking rows' own client_uuids
  -- (see the header), so a second invoice over the same booking would collide
  -- on invoice_lines_client_uuid_key partway through. Re-invoicing after a void
  -- needs its own key strategy and its own ruling; refusing is the honest
  -- interim. TODO(decision) — re-invoicing a booking whose only invoice was
  -- voided (MONEY-07).
  -- Aliased so the record's field names are unmistakable; an unaliased
  -- `status::text` is still called `status`, which reads like the column and is
  -- not one.
  select invoice_no as prior_no, status::text as prior_status into v_prior
    from invoices where booking_id = v_booking_id limit 1;
  if found then
    raise exception
      'create_invoice: booking % already has an invoice (%, %). One invoice per rental — damage and late fees append as lines to the existing Draft, and corrections after issue are Void + Credit Note. Nothing was created.',
      v_resolved_no, coalesce(v_prior.prior_no, 'a Draft'), v_prior.prior_status;
  end if;

  -- ── The due date, from the client's payment terms ─────────────────────────
  -- `clients.payment_terms` is an enum whose labels ARE the rule; this is not a
  -- policy decision restated in SQL. NOT NULL DEFAULT 'Immediate', so the
  -- coalesce is a belt, and Immediate (due today) is the safe direction: it is
  -- visible and correctable, where a wrong 30 grants credit nobody agreed to.
  select payment_terms::text into v_terms from clients where id = v_client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := current_date + v_term_days;

  -- ── The booking's discount (R-17 — a percentage, never an amount) ─────────
  -- `booking_discounts` has no unique constraint on booking_id, so more than
  -- one row is representable; nothing rules how two of them combine on an
  -- invoice (the stacking trigger governs the booking, not the bill). Rather
  -- than pick one silently, this refuses and says so.
  -- TODO(decision) — how several booking_discounts rows combine into
  -- invoices.discount_percent. Live carries no such booking today.
  select count(*) into v_discounts from booking_discounts where booking_id = v_booking_id;
  if v_discounts > 1 then
    raise exception
      'create_invoice: booking % carries % discount rows and no rule says how they combine into one invoice percentage. Nothing was created.',
      v_resolved_no, v_discounts;
  end if;
  if v_discounts = 1 then
    select percent into v_percent from booking_discounts where booking_id = v_booking_id;
  end if;

  -- ── The header ────────────────────────────────────────────────────────────
  -- `invoice_no` and `issue_date` are OMITTED, not set to null: the column list
  -- is what documents the intent (R-15). 0086 makes both nullable and adds
  -- `invoices_issued_together` so a half-issued row cannot exist.
  -- The money columns keep their zero defaults; the trigger owns them.
  insert into invoices (
    client_uuid, booking_id, client_id, branch_id, status,
    due_date, currency, discount_percent, vat_rate, notes,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_id,
    v_client_id,
    v_branch_id,
    'Draft',
    v_due_date,
    'NPR',
    coalesce(v_percent, 0),
    -- numeric(5,4) — a FRACTION, not a percentage. 13% arrives as 0.1300.
    coalesce(v_vat_rate, 0.1300),
    v_notes,
    v_actor,
    v_actor
  )
  returning id into v_invoice_id;

  -- ── The lines: a snapshot, not a join ─────────────────────────────────────
  -- SPEC-P0-1 §3.1: the rate card is pinned per booking, so the figures are
  -- COPIED here and never re-derived from `products` afterwards.
  --
  -- `line_total` carries each line's NET figure, because
  -- `recalculate_invoice_totals` derives the subtotal as `sum(line_total)`. The
  -- booking-level percentage is applied on top by the trigger from the header's
  -- `discount_percent`; `invoice_lines.discount_percent` stays 0, because the
  -- line's own discount is already inside its total and counting it twice would
  -- discount twice.

  -- (1) Equipment and bundles, from `booking_lines`.
  -- The mapping is `LINE_KIND_BY_TYPE` from createInvoice.ts, moved next to the
  -- enums it maps. Every member of `booking_line_type` is named and the CASE
  -- has **no ELSE on purpose**: if `booking_line_type` ever grows a member,
  -- this yields NULL, `invoice_lines.line_kind` is NOT NULL, and the whole
  -- transaction aborts with nothing written. That is the safe direction. The
  -- TypeScript it replaces fell through a `?? 'Equipment Rental'`, so an
  -- accessory or an ad-hoc line was billed as equipment rental with nothing
  -- said about it.
  -- ⚠ `line_kind` has no `Damage` and no `Missing` member, so a damage charge
  -- cannot become an invoice line at all. That is MONEY-08; widening the enum
  -- is a ruling (it decides deposit-versus-invoice precedence too) and is NOT
  -- done here.
  -- Law 3 keeps a voided booking line in its table; a voided line is not
  -- billable, so it is kept off the bill.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bl.client_uuid,
    v_invoice_id,
    (case bl.line_type
       when 'Equipment'   then 'Equipment Rental'
       when 'Bundle'      then 'Equipment Rental'
       when 'Accessory'   then 'Equipment Rental'
       when 'Manual item' then 'Equipment Rental'
       when 'Service'     then 'Services'
       when 'Sub-rental'  then 'Sub-Rental'
     end)::line_kind,
    -- `booking_lines.description` is nullable and `invoice_lines.description`
    -- is NOT NULL. The line type is the honest fallback: it says what the
    -- charge is for without inventing a product name nobody typed.
    coalesce(nullif(btrim(bl.description), ''), bl.line_type::text),
    greatest(1, bl.qty),
    greatest(1, bl.days),
    bl.rate,
    greatest(0, greatest(1, bl.qty) * greatest(1, bl.days) * bl.rate - coalesce(bl.discount_amount, 0)),
    0,
    coalesce(bl.sort_order, 0)
  from booking_lines bl
  where bl.booking_id = v_booking_id
    and bl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (2) Crew, from `booking_crew_lines` — a different table, which is why it
  -- was billed to nobody until 4 Sep. Overtime, accommodation and meals are
  -- per-engagement totals, not per day; folding them into the unit rate keeps
  -- quantity × days × rate equal to the crew member's true cost, which is the
  -- arithmetic the recalc trigger applies to every line without exception.
  --
  -- `line_total` is computed EXACTLY (day_rate × days + extras) rather than
  -- from the divided unit rate, and that distinction earns its keep:
  -- `unit_rate` is `numeric(14,2)`, so a gaffer at 8000 × 3 days plus 4000 of
  -- extras stores a unit rate of 9333.33 whose product with days is 27,999.99
  -- — a rupee short of the 28,000 owed. `line_total` is what
  -- `recalculate_invoice_totals` sums, so the bill is exact and only the
  -- displayed per-day rate carries the rounding. Verified against the same
  -- reference figures the TypeScript suite used to pin (28,000 / 18,000 /
  -- 4,200), so this snapshot bills what its predecessor billed.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    cl.client_uuid,
    v_invoice_id,
    'Crew Charges'::line_kind,
    coalesce(
      nullif(btrim(concat_ws(' - ', nullif(btrim(cl.name), ''), cl.crew_role::text)), ''),
      'Crew'
    ),
    1,
    greatest(1, cl.days),
    cl.day_rate
      + (coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0))
        / greatest(1, cl.days),
    cl.day_rate * greatest(1, cl.days)
      + coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0),
    0,
    1000 + (row_number() over (order by cl.created_at, cl.id))::integer - 1
  from booking_crew_lines cl
  where cl.booking_id = v_booking_id
    and cl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (3) Transport, from `booking_transport`. A row carrying no charge is a
  -- logistics record, not a bill line, so it is skipped rather than billed at
  -- zero. `booking_transport` has no `voided_at` column — there is nothing to
  -- exclude on.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bt.client_uuid,
    v_invoice_id,
    'Transport'::line_kind,
    case
      when nullif(btrim(coalesce(bt.vehicle, '')), '') is not null
        then 'Transport - ' || btrim(bt.vehicle)
      else 'Transport'
    end,
    1,
    1,
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    0,
    2000 + (row_number() over (order by bt.created_at, bt.id))::integer - 1
  from booking_transport bt
  where bt.booking_id = v_booking_id
    and coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0) > 0;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- ── The totals, as POSTGRES computed them ─────────────────────────────────
  -- Re-read, never derived here. A caller rendering its own figure is showing
  -- an estimate; this is the row.
  select * into v_totals from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',      v_totals.id,
    -- R-15 — stated rather than omitted, so a caller cannot mistake a missing
    -- field for a number it failed to read.
    'invoice_no',      v_totals.invoice_no,
    'status',          v_totals.status,
    'booking_id',      v_booking_id,
    'booking_no',      v_resolved_no,
    'client_id',       v_client_id,
    'due_date',        v_totals.due_date,
    'line_count',      v_line_count,
    'subtotal',        v_totals.subtotal,
    'discount_amount', v_totals.discount_amount,
    'taxable_amount',  v_totals.taxable_amount,
    'vat_amount',      v_totals.vat_amount,
    'total',           v_totals.total_amount,
    'replayed',        false
  );
end;
$$;

comment on function create_invoice(jsonb) is
  'Creates one Draft invoice (header + snapshotted lines) in a single transaction. '
  'SECURITY DEFINER because the money columns of booking_lines and booking_transport are '
  'ungranted to every signed-in session (0062) and booking_transport''s only SELECT policy '
  'omits Manager and Accounts — two of the four roles R-05 names — so an invoker-rights '
  'snapshot would silently under-bill rather than refuse. The R-05 role check inside the '
  'function is therefore the gate, and EXECUTE is revoked from PUBLIC and anon. Idempotent '
  'on invoices.client_uuid (Law 8): a replay returns the existing invoice and writes nothing. '
  'Mints no number (R-15 — a Draft carries none) and prices nothing (Law 1 — '
  'recalculate_invoice_totals owns the figures).';

-- A SECURITY DEFINER function inherits EXECUTE from PUBLIC, which would include
-- `anon` — the key that ships inside the browser bundle. PUBLIC is revoked
-- unconditionally; Supabase's platform default privileges also grant EXECUTE to
-- `anon` directly on new functions (SEC-01), and a grant held directly is not
-- removed by revoking it from PUBLIC, so `anon` is named as well.
--
-- The per-role statements are guarded on the role existing so that a restore
-- drill into a scratch database without the Supabase API roles still applies.
revoke all on function create_invoice(jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function create_invoice(jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function create_invoice(jsonb) to authenticated';
  else
    raise notice
      '0096: no `authenticated` role here, so no EXECUTE grant was made. This database cannot serve the '
      'application as it stands.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function create_invoice(jsonb) to service_role';
  end if;
end $$;

-- ── Post-conditions ─────────────────────────────────────────────────────────
--
-- Catalogue first (the function exists with the rights it claims), then a
-- behavioural probe that builds its own booking, invoices it as Accounts,
-- replays the call, and is refused as Coordinator and as Warehouse. Everything
-- the probe writes is rolled back by a sentinel exception, the idiom 0094 uses;
-- PL/pgSQL variables are not transactional, so a recorded failure survives the
-- rollback and is re-raised afterwards.
--
-- The scratch booking is built here rather than borrowed from the corpus
-- because the assertion "the line count equals the source line count" is only
-- worth anything when this block knows what the source count is.

do $$
declare
  v_secdef boolean;
begin
  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_invoice'
     and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_secdef is null then
    raise exception 'POST-CONDITION 1 FAILED: create_invoice(jsonb) was not created.';
  end if;
  if not v_secdef then
    raise exception
      'POST-CONDITION 1 FAILED: create_invoice is SECURITY INVOKER. Under invoker rights it reads no rate, no '
      'delivery_charge and — as Manager or Accounts — no transport row at all, and would under-bill silently.';
  end if;

  -- Definer rights make PUBLIC execute a hole, so it must be gone.
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.create_invoice(jsonb)', 'EXECUTE') then
    raise exception
      'POST-CONDITION 2 FAILED: anon may execute create_invoice. The anon key ships in the browser bundle.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and not has_function_privilege('authenticated', 'public.create_invoice(jsonb)', 'EXECUTE') then
    raise exception 'POST-CONDITION 2 FAILED: authenticated may NOT execute create_invoice, so no session can.';
  end if;

  -- 0086 must be in front of this. Without it the header insert dies on
  -- invoice_no NOT NULL (23502) and every line on RLS (42501).
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'invoices' and column_name = 'invoice_no') <> 'YES' then
    raise exception
      'POST-CONDITION 3 FAILED: invoices.invoice_no is still NOT NULL — 0086 has not been applied, and R-15 is '
      'unimplementable without it.';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'invoice_lines_insert'
  ) then
    raise exception 'POST-CONDITION 3 FAILED: invoice_lines has no INSERT policy — apply 0086 first.';
  end if;

  raise notice '0096 catalogue post-conditions passed.';
end $$;

do $$
declare
  v_branch    uuid;
  v_client    uuid;
  v_accounts  uuid := gen_random_uuid();
  v_coord     uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_booking   uuid;
  v_key       uuid := gen_random_uuid();
  v_payload   jsonb;
  v_result    jsonb;
  v_replay    jsonb;
  v_lines     integer;
  v_lines2    integer;
  v_invoices  integer;
  v_refused   boolean;
  v_err       text;
  v_fail      text;
begin
  select b.id into v_branch from branches b limit 1;
  select c.id into v_client from clients c limit 1;

  -- The probe signs in as a browser session would, so it needs the role a
  -- browser session holds.
  if v_branch is null or v_client is null
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice
      '0096: this database holds no branch, no client or no `authenticated` role, so the behavioural probe was '
      'skipped. The catalogue post-conditions above still ran.';
    return;
  end if;

  begin
    -- ── Scratch actors. Neither the live project nor 0012 seeds an Accounts
    --    row, so the role this function exists to serve has to be built.
    insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id)
    values
      (v_accounts,  gen_random_uuid(), 'PROBE-0096-A', 'probe-0096-accounts@invalid.test',
       'Probe Accounts', '+977-9700000096', 'Accounts', v_branch),
      (v_coord,     gen_random_uuid(), 'PROBE-0096-C', 'probe-0096-coordinator@invalid.test',
       'Probe Coordinator', '+977-9700000097', 'Coordinator', v_branch),
      (v_warehouse, gen_random_uuid(), 'PROBE-0096-W', 'probe-0096-warehouse@invalid.test',
       'Probe Warehouse', '+977-9700000098', 'Warehouse', v_branch);

    -- ── The scratch booking: two equipment lines and one transport row, which
    --    is the verification target this migration was written against.
    --    Inserted as the migration's own role, which 0094's guard exempts.
    --
    --    `bookings_booking_no_format` is `^B-[0-9]+$` until 0085 replaces it
    --    with the bare-integer form (R-10). 0085 sits in front of this file in
    --    the chain, but this migration must also survive being applied to a
    --    project that has not taken it yet, so the bare form is tried first and
    --    the prefixed one is the fallback. Neither number can collide: no real
    --    sequence reaches 99,960,096.
    begin
      insert into bookings (
        client_uuid, booking_no, branch_id, client_id, delivery_type,
        pickup_at, return_at, created_by, updated_by
      )
      values (
        gen_random_uuid(), '99960096', v_branch, v_client, 'Babin Delivery',
        now() + interval '1 day', now() + interval '4 days', v_accounts, v_accounts
      )
      returning id into v_booking;
    exception when check_violation then
      insert into bookings (
        client_uuid, booking_no, branch_id, client_id, delivery_type,
        pickup_at, return_at, created_by, updated_by
      )
      values (
        gen_random_uuid(), 'B-99960096', v_branch, v_client, 'Babin Delivery',
        now() + interval '1 day', now() + interval '4 days', v_accounts, v_accounts
      )
      returning id into v_booking;
    end;

    insert into booking_lines (client_uuid, booking_id, line_type, description, qty, days, rate, discount_amount, sort_order, created_by)
    values
      (gen_random_uuid(), v_booking, 'Equipment', '0096 probe body', 1, 3, 5000, 0, 0, v_accounts),
      (gen_random_uuid(), v_booking, 'Accessory', '0096 probe V-mount', 2, 3, 300, 0, 1, v_accounts),
      -- Law 3 keeps a voided line; it must NOT reach the bill, so the expected
      -- line count below is two equipment lines, not three.
      (gen_random_uuid(), v_booking, 'Equipment', '0096 voided line', 1, 3, 9000, 0, 2, v_accounts);
    -- `booking_lines_void_needs_reason` — a void without a reason is refused.
    update booking_lines
       set voided_at = now(), voided_reason = '0096 probe: proves a voided line stays off the bill'
     where booking_id = v_booking and description = '0096 voided line';

    insert into booking_transport (client_uuid, booking_id, vehicle, delivery_charge, fuel_charge, created_by)
    values (gen_random_uuid(), v_booking, 'Probe Bolero', 3000, 1200, v_accounts);

    v_payload := jsonb_build_object(
      'client_uuid', v_key,
      'created_by',  v_accounts,
      'booking_id',  v_booking,
      'vat_rate',    0.1300
    );

    -- ── (1) Accounts raises a Draft with three lines and real totals ────────
    set local role authenticated;
    perform set_config('app.current_user_id', v_accounts::text, true);
    v_result := create_invoice(v_payload);
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_result ->> 'invoice_id' is null then
      v_fail := 'BEHAVIOURAL 1 FAILED: create_invoice returned no invoice_id.';
    end if;
    if v_fail is null and (v_result -> 'invoice_no') <> 'null'::jsonb then
      v_fail := format('BEHAVIOURAL 1 FAILED: the Draft carries invoice_no %s; R-15 mints it at issue.',
                       v_result ->> 'invoice_no');
    end if;
    if v_fail is null and v_result ->> 'status' <> 'Draft' then
      v_fail := format('BEHAVIOURAL 1 FAILED: the invoice was created as %s, not Draft (R-02).', v_result ->> 'status');
    end if;

    -- The line count equals the SOURCE line count: two live booking lines
    -- (the voided third is excluded) plus one charged transport row.
    select count(*) into v_lines from invoice_lines where invoice_id = (v_result ->> 'invoice_id')::uuid;
    if v_fail is null and v_lines <> 3 then
      v_fail := format(
        'BEHAVIOURAL 2 FAILED: the snapshot wrote %s lines where the booking has 3 billable rows (2 live equipment '
        'lines + 1 charged transport row). A voided line on the bill, or a source table not read at all.', v_lines);
    end if;
    if v_fail is null and (v_result ->> 'line_count')::integer <> v_lines then
      v_fail := format('BEHAVIOURAL 2 FAILED: create_invoice reported %s lines but wrote %s.',
                       v_result ->> 'line_count', v_lines);
    end if;
    if v_fail is null and not exists (
      select 1 from invoice_lines
       where invoice_id = (v_result ->> 'invoice_id')::uuid and line_kind = 'Transport'
    ) then
      v_fail :=
        'BEHAVIOURAL 2 FAILED: no Transport line was written. This is the DATA-01 failure mode — the transport '
        'read returned nothing and the invoice under-billed in silence.';
    end if;

    -- The totals are the trigger's, and they are not zero.
    if v_fail is null and (v_result ->> 'total')::numeric <= 0 then
      v_fail := format(
        'BEHAVIOURAL 3 FAILED: three lines landed and total is %s. recalculate_invoice_totals did not fire, so the '
        'header is a free invoice.', v_result ->> 'total');
    end if;
    if v_fail is null and (v_result ->> 'subtotal')::numeric
         is distinct from (select coalesce(sum(line_total), 0) from invoice_lines
                            where invoice_id = (v_result ->> 'invoice_id')::uuid) then
      v_fail := 'BEHAVIOURAL 3 FAILED: the returned subtotal is not the sum of the lines the trigger saw.';
    end if;

    -- ── (4) Law 8 — a replay writes nothing and returns the same invoice ────
    select count(*) into v_invoices from invoices where booking_id = v_booking;
    set local role authenticated;
    perform set_config('app.current_user_id', v_accounts::text, true);
    v_replay := create_invoice(v_payload);
    reset role;
    perform set_config('app.current_user_id', '', true);

    select count(*) into v_lines2 from invoice_lines where invoice_id = (v_result ->> 'invoice_id')::uuid;

    if v_fail is null and v_replay ->> 'invoice_id' <> v_result ->> 'invoice_id' then
      v_fail := 'BEHAVIOURAL 4 FAILED: a replay of the same client_uuid returned a DIFFERENT invoice — Law 8 broken, one press became two invoices.';
    end if;
    if v_fail is null and (v_replay ->> 'replayed') <> 'true' then
      v_fail := 'BEHAVIOURAL 4 FAILED: a replay did not report itself as one, so a caller cannot tell "created" from "you already did this".';
    end if;
    if v_fail is null and (select count(*) from invoices where booking_id = v_booking) <> v_invoices then
      v_fail := 'BEHAVIOURAL 4 FAILED: a replay wrote a second invoice header.';
    end if;
    if v_fail is null and v_lines2 <> v_lines then
      v_fail := format('BEHAVIOURAL 4 FAILED: a replay added lines (%s → %s).', v_lines, v_lines2);
    end if;

    -- ── (5) Warehouse is refused — Law 6, money-blind ───────────────────────
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_warehouse::text, true);
      perform create_invoice(jsonb_build_object(
        'client_uuid', gen_random_uuid(), 'created_by', v_warehouse, 'booking_id', v_booking, 'vat_rate', 0.1300));
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 5 FAILED: a Warehouse session raised an invoice. Warehouse sees no money.';
    end if;
    if v_fail is null and position('may not raise an invoice' in coalesce(v_err, '')) = 0
       and position('cannot read money' in coalesce(v_err, '')) = 0 then
      v_fail := format('BEHAVIOURAL 5 FAILED: Warehouse was refused, but not by this function''s gate. Postgres said: %s', v_err);
    end if;

    -- ── (6) Coordinator is refused — R-05 withdrew the right ────────────────
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_coord::text, true);
      perform create_invoice(jsonb_build_object(
        'client_uuid', gen_random_uuid(), 'created_by', v_coord, 'booking_id', v_booking, 'vat_rate', 0.1300));
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 6 FAILED: a Coordinator raised an invoice. R-05 names Owner, Admin, Manager and Accounts.';
    end if;
    if v_fail is null and position('may not raise an invoice' in coalesce(v_err, '')) = 0 then
      v_fail := format('BEHAVIOURAL 6 FAILED: Coordinator was refused, but not by R-05. Postgres said: %s', v_err);
    end if;

    raise exception 'ROLLBACK_0096_PROBE';
  exception
    when others then
      reset role;
      if sqlerrm <> 'ROLLBACK_0096_PROBE' then
        raise;
      end if;
      perform set_config('app.current_user_id', '', true);
      if v_fail is not null then
        raise exception '%', v_fail;
      end if;
      raise notice
        '0096 behavioural probe passed and rolled back: Accounts raised a numberless Draft of 3 lines with '
        'trigger-computed totals, a replay returned the same id and wrote nothing, Warehouse and Coordinator were '
        'refused.';
  end;
end $$;

commit;

-- =============================================================================
-- ## What this migration deliberately leaves alone
--
--   · **Who may ISSUE, VOID or append lines.** `issue_invoice`, `void_invoice`
--     and `addInvoiceLine` (SPEC-P0-1 §3.2–§3.4) are separate verbs. R-05 gives
--     issue rights to the same four roles; no 4 Sep ruling restates the void
--     set, so per R-00 the older position stands and `canVoidInvoice` is left
--     as it is. That mismatch is AUTHSEC-01's remaining half and needs a
--     ruling, not a migration.
--   · **`line_kind` has no Damage and no Missing member.** A damage charge
--     cannot reach an invoice line today (MONEY-08). Widening the enum decides
--     deposit-versus-invoice precedence and is a ruling.
--   · **`booking_transport_driver_read` and `booking_transport_v` omit Manager
--     and Accounts.** That is what forced definer rights here. Correcting the
--     Law 6 grant contract is SEC-04 / DB-02 and wants the registry-driven
--     arming the audit recommends, not a one-off widening bolted to this file.
--   · **The trigger's 2 dp and hardcoded 0.13.** MONEY-03 /
--     `0098_invoice_totals_match_engine`. This function returns whatever the
--     trigger computed and adds no second opinion.
-- =============================================================================
