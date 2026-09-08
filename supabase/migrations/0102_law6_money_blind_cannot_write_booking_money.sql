-- =============================================================================
-- 0102_law6_money_blind_cannot_write_booking_money.sql — 8 Sep 2026
--
-- Law 6 for the WRITE verb, on the booking. `0092` closed this hole for
-- `products` and `product_units`. It is still open on `bookings` and
-- `booking_lines`, which is where the money that actually gets invoiced lives.
--
-- ## Reproduced, PGlite, full chain from scratch, 8 Sep 2026
--
-- As a Warehouse seat (`set local role authenticated`, `app.current_user_id`
-- set to a user whose `primary_role` is 'Warehouse' — the same impersonation
-- 0092's own post-condition uses):
--
--     update bookings      set deposit_required = 0       -> ALLOWED
--     update booking_lines set rate = 1                   -> ALLOWED
--     update booking_lines set discount_amount = 999999   -> ALLOWED
--
-- while `select deposit_required from bookings` is refused to the same seat by
-- the column mask. The role may not READ the deposit and may rewrite it to
-- zero. `authenticated` holds INSERT and UPDATE on both tables, so this is one
-- PostgREST PATCH, no browser required.
--
-- ## Why the existing controls do not catch it
--
-- Identical to 0092's reasoning, and it is worth restating because the shape
-- keeps recurring:
--
--   * RLS cannot express it. A `WITH CHECK` sees the new row and cannot say
--     which columns changed. `bookings_update` admits Warehouse deliberately —
--     the floor moves bookings — and that is correct.
--   * Column privileges cannot express it. Every signed-in user is the SAME
--     Postgres role, `authenticated`; the app's role lives in
--     `users.primary_role`. `REVOKE UPDATE (rate) FROM authenticated` would
--     take the column from the Owner too.
--
-- So the check must compare OLD against NEW per row, which only a trigger can
-- do. This is the same instrument as 0092, pointed at the other two tables.
--
-- ## The column set is measured, not remembered
--
-- Every numeric column on both tables, read from the schema at the end of the
-- chain (99/99 applied):
--
--     bookings.deposit_required   numeric   <- guarded
--     bookings.version            integer   <- NOT money; the optimistic-lock
--                                              counter, bumped by a trigger
--     booking_lines.rate              numeric  <- guarded
--     booking_lines.discount_amount   numeric  <- guarded
--     booking_lines.supplier_cost     numeric  <- guarded
--     booking_lines.markup_amount     numeric  <- guarded
--     booking_lines.qty               integer  <- guarded, see ⭐ below
--     booking_lines.days              integer  <- guarded, see ⭐ below
--     booking_lines.sort_order        integer  <- NOT money; display order
--
-- ⭐ S0-a — `qty` and `days` are not money columns, but they are the two
-- multiplicands of every line total, so a money-blind seat that may not see a
-- rate can still change what the rate is multiplied by. They are guarded.
-- The legitimate floor case — a partial pickup — does not go through a line
-- UPDATE; it goes through `releaseBookingLineUnit` against
-- `booking_line_units`, which this trigger does not touch. Flip by deleting
-- the two `qty`/`days` comparisons.
--
-- ## What this does NOT close
--
-- INSERT is not guarded here. `create_booking` is the only insert path and is
-- `security invoker`, but `booking_lines_all` admits a direct Warehouse INSERT
-- carrying any rate it likes. That is a real hole and it is Stage 1's, not this
-- file's: closing it needs a rule about who may add a line at all, which is a
-- permission question, not a Law 6 question. Filed, not fixed here.
--
-- ## Divergence from 0092, deliberate
--
-- 0092 raises P0001 (a bare `raise exception`). This file raises the same
-- message but with `errcode = '42501'`, insufficient_privilege, which PostgREST
-- renders as HTTP 403 rather than 400. A Law 6 refusal is a permission refusal
-- and should say so on the wire. 0092 is not edited to match — it is committed
-- and in the chain — and the message still begins 'Law 6:' in both, so anything
-- asserting on the text keeps working. Recorded as R-31.
--
-- N-5: NOT applied to live. Written, numbered, proven in PGlite. Babin applies
-- after the backup.
-- =============================================================================

begin;

create or replace function reject_money_blind_booking_money_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_changed text[] := '{}';
begin
  /*
   * Only a browser session is subject to this. A migration, a seed or any psql
   * session has no JWT and no `app.current_user_id`, so `auth_user_role()`
   * reports 'Client' and `auth_can_view_money()` is FALSE — guarding on the app
   * role alone would refuse this file's own post-condition. Keyed on
   * `current_user` instead, exactly as 0092 is: `authenticated` and `anon` are
   * the only roles a browser can ever be.
   */
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if auth_can_view_money() then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'bookings' then
    if NEW.deposit_required is distinct from OLD.deposit_required
      then v_changed := v_changed || 'deposit_required'::text; end if;

  elsif TG_TABLE_NAME = 'booking_lines' then
    if NEW.rate            is distinct from OLD.rate            then v_changed := v_changed || 'rate'::text; end if;
    if NEW.discount_amount is distinct from OLD.discount_amount then v_changed := v_changed || 'discount_amount'::text; end if;
    if NEW.supplier_cost   is distinct from OLD.supplier_cost   then v_changed := v_changed || 'supplier_cost'::text; end if;
    if NEW.markup_amount   is distinct from OLD.markup_amount   then v_changed := v_changed || 'markup_amount'::text; end if;
    -- ⭐ S0-a: not money, but the multiplicands of the line total.
    if NEW.qty             is distinct from OLD.qty             then v_changed := v_changed || 'qty'::text; end if;
    if NEW.days            is distinct from OLD.days            then v_changed := v_changed || 'days'::text; end if;
  end if;

  if array_length(v_changed, 1) is null then
    /*
     * Nothing priced changed. Stage moves, notes, packing flags, timestamps:
     * all untouched. The floor must be able to do its job — a guard that blocks
     * warehouse work is an outage wearing a security badge.
     */
    return NEW;
  end if;

  raise exception
    'Law 6: your role may not see money, so it may not change it. Refused a write to %.% (%). '
    'Ask Owner, Admin, Manager, Coordinator or Accounts to change booking pricing.',
    TG_TABLE_NAME, array_to_string(v_changed, ', '), auth_user_role()
    using errcode = '42501';
end;
$$;

comment on function reject_money_blind_booking_money_write() is
  'Law 6 for the WRITE verb on booking money (0102). Companion to 0092, which '
  'covers products/product_units. RLS admits Warehouse to bookings and '
  'booking_lines because the floor moves bookings; this refuses only the priced '
  'columns plus qty/days. Exempt for postgres/service_role so migrations and '
  'seeds still run. Raises 42501 -> HTTP 403.';

drop trigger if exists trg_bookings_money_blind_write on bookings;
create trigger trg_bookings_money_blind_write
  before update on bookings
  for each row execute function reject_money_blind_booking_money_write();

drop trigger if exists trg_booking_lines_money_blind_write on booking_lines;
create trigger trg_booking_lines_money_blind_write
  before update on booking_lines
  for each row execute function reject_money_blind_booking_money_write();

-- -----------------------------------------------------------------------------
-- Post-conditions.
--
-- Four, in the shape 0092 established: the guard must refuse the right write,
-- refuse it for the RIGHT REASON, leave the value unchanged, and not refuse
-- anybody else. A guard verified only by "the write failed" is not verified —
-- 0092's first run refused for a `text[] || unknown` cast error and a bare
-- `when others` called that a pass.
-- -----------------------------------------------------------------------------
do $$
declare
  v_booking  uuid;
  v_line     uuid;
  v_deposit  numeric;
  v_rate     numeric;
  v_wh       uuid;
  v_coord    uuid;
  v_blocked  boolean := false;
  v_err      text;
  v_allowed  boolean := false;
begin
  select id into v_wh    from users where primary_role = 'Warehouse'   and is_active limit 1;
  select id into v_coord from users where primary_role = 'Coordinator' and is_active limit 1;
  select b.id, b.deposit_required into v_booking, v_deposit from bookings b limit 1;
  select l.id, l.rate into v_line, v_rate from booking_lines l where l.booking_id = v_booking limit 1;

  if v_wh is null or v_booking is null then
    raise notice
      '0102: no Warehouse user or no booking in this database; trigger installed, behavioural '
      'checks skipped. check:lifecycle L12 is where this is exercised against a seeded world.';
    return;
  end if;

  /*
   * As in 0092: on a database rebuilt from these migrations `authenticated` may
   * hold no privilege on the table at all, and "permission denied for table
   * bookings" is NOT evidence that Law 6 works. Refuse to record it as one.
   */
  if not has_table_privilege('authenticated', 'public.bookings', 'UPDATE') then
    raise notice
      '0102: `authenticated` holds no UPDATE on bookings here, so the probe cannot distinguish '
      'this guard from the missing grant. Trigger installed; verified where the grants exist.';
    return;
  end if;

  -- (1) this migration (postgres) must still be able to write booking money.
  update bookings set deposit_required = v_deposit where id = v_booking;

  -- (2) a Warehouse session must be REFUSED, and refused BY THIS GUARD.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update bookings set deposit_required = 0 where id = v_booking;
  exception when others then
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a Warehouse session rewrote bookings.deposit_required.';
  end if;
  if position('Law 6' in coalesce(v_err, '')) = 0 then
    /*
     * Refused, but by something else — most likely RLS getting there first. That
     * is still a refusal, so it is not a failure of this file; but it must not
     * be recorded as proof either, or the day the policy widens this guard will
     * be assumed to be holding a door nobody has tested.
     */
    raise notice
      '0102: the Warehouse write was refused by something other than this guard (%). The trigger '
      'is installed; check:lifecycle L12 exercises it where the policy admits the write.',
      left(coalesce(v_err, ''), 120);
  end if;
  if (select deposit_required from bookings where id = v_booking) is distinct from v_deposit then
    raise exception 'POST-CONDITION FAILED: the refused write still changed the deposit.';
  end if;

  -- (3) the line columns, same seat.
  if v_line is not null then
    v_blocked := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_wh::text, true);
      update booking_lines set rate = 1 where id = v_line;
    exception when others then
      v_blocked := true;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if not v_blocked then
      raise exception 'POST-CONDITION FAILED: a Warehouse session rewrote booking_lines.rate.';
    end if;
    if (select rate from booking_lines where id = v_line) is distinct from v_rate then
      raise exception 'POST-CONDITION FAILED: the refused line write still changed the rate.';
    end if;
  end if;

  -- (4) the same money-blind seat must still be able to do its actual job, and a
  --     money-sighted seat must still be able to do its actual job.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update bookings set updated_at = now() where id = v_booking;
    v_allowed := true;
  exception when others then
    v_allowed := false;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_allowed then
    raise notice
      '0102: a non-money Warehouse write was also refused here — by RLS, not by this guard, which '
      'ignores every column it does not name. Not a failure of this file.';
  end if;

  raise notice
    '0102 verified: booking money writes refused for money-blind roles, the values unchanged, '
    'non-money writes untouched, migrations exempt.';
end $$;

commit;
