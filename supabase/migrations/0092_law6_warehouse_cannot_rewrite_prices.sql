-- =============================================================================
-- 0092_law6_warehouse_cannot_rewrite_prices.sql — 5 Sep 2026
--
-- **Law 6 governs SELECT only.** A money-blind role can rewrite the prices it is
-- forbidden to see.
--
-- ## Reproduced on the local stack, 5 Sep 2026
--
-- Signed in as `warehouse@babinrentals.com` (`primary_role = 'Warehouse'`):
--
--   PATCH /rest/v1/products?id=eq.<uuid>   {"daily_rate": 1}
--   -> HTTP 200
--   daily_rate: 6500.00 -> 1.00
--
-- Every future rental of that product would have quoted Rs 1 a day, and nothing
-- in the app would have said so. Restored immediately after the probe.
--
-- ## Reachability — settled 6 Sep 2026, against live's REAL grant shape
--
-- This was written, then wrongly withdrawn, then reinstated. The record matters
-- more than the tidiness:
--
--   * 4 Sep — reproduced on a local stack, HTTP 200, 6500.00 -> 1.00.
--   * 6 Sep, wrongly — after `0093`'s first draft revoked SELECT on `products`
--     outright, the same request 403'd, and I recorded the finding as defence in
--     depth rather than a live hole. That draft did not match live.
--   * 6 Sep, settled — `0093` now reproduces live's actual shape, which masks
--     SELECT **per column**: the table is closed but `id`, `name` and the rest
--     are granted back, and only the money columns are withheld. PostgREST needs
--     SELECT on `id` to target a row, and live grants exactly that.
--
-- Re-tested under that shape, with this trigger disabled and then enabled:
--
--   disabled -> PATCH /products?id=eq.X {"daily_rate": 1}  =>  204, 6500.00 -> 1.00
--   enabled  -> same request                               =>  400, rate unchanged
--
-- So the hole is REAL on production as it stands today, and this trigger is what
-- closes it. UPDATE is not masked per column on live — `authenticated` may write
-- every money column it may not read — which is precisely why Law 6 needs a
-- guard on the write verb and not another revoke.
--
-- ## Why the existing controls do not catch it
--
-- `products_update` admits Owner, Admin, Manager **and Warehouse** — confirmed on
-- the live project, not inferred. That is correct for the job: warehouse staff own
-- serials, location, condition and status. The policy simply cannot express
-- "…but not the price columns", because an RLS `WITH CHECK` sees the new row and
-- has no way to say which columns changed.
--
-- Column privileges cannot express it either. Every signed-in user is the SAME
-- Postgres role — `authenticated` — and the app's own role lives in
-- `users.primary_role`, read by `auth_user_role()`. `REVOKE UPDATE (daily_rate)
-- … FROM authenticated` would take the column from Owner and Warehouse alike.
-- (This is also why the bare column revokes elsewhere in this repo are inert:
-- there is no Postgres role to revoke *from*.)
--
-- So the check has to compare OLD against NEW, which only a trigger can do.
--
-- ## The predicate is not invented
--
-- `auth_can_view_money()` already exists and already says exactly who is
-- money-blind:
--
--   select auth_user_role() not in ('Warehouse', 'Technician', 'Driver', 'Client');
--
-- This migration reuses it verbatim. A role that may not READ a price may not
-- WRITE one — that is Law 6 applied to the other verb, not a new rule.
--
-- ## The exemption, and why it is keyed on the Postgres role
--
-- `auth_user_role()` falls back to `'Client'` when there is no JWT and no
-- `app.current_user_id`, so `auth_can_view_money()` is FALSE inside a plain
-- migration, a seed, or any psql session. Guarding on the app role alone would
-- therefore refuse `0047`'s seed and every admin script.
--
-- The guard is keyed on `current_user` instead: it applies only to `authenticated`
-- and `anon`, the two roles a browser can ever be. `postgres`, `supabase_admin`
-- and `service_role` pass through untouched, which is what keeps migrations,
-- seeds and server-side integrations working.
-- =============================================================================

begin;

create or replace function reject_money_column_write_by_money_blind_role()
returns trigger
language plpgsql
as $$
declare
  v_changed text[] := '{}';
begin
  /*
   * Only a browser session is subject to this. See the header: a migration has no
   * JWT, so `auth_user_role()` would report 'Client' and refuse the seed.
   */
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if auth_can_view_money() then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'products' then
    if NEW.daily_rate        is distinct from OLD.daily_rate        then v_changed := v_changed || 'daily_rate'::text; end if;
    if NEW.weekly_rate       is distinct from OLD.weekly_rate       then v_changed := v_changed || 'weekly_rate'::text; end if;
    if NEW.monthly_rate      is distinct from OLD.monthly_rate      then v_changed := v_changed || 'monthly_rate'::text; end if;
    if NEW.hourly_rate       is distinct from OLD.hourly_rate       then v_changed := v_changed || 'hourly_rate'::text; end if;
    if NEW.weekend_rate      is distinct from OLD.weekend_rate      then v_changed := v_changed || 'weekend_rate'::text; end if;
    if NEW.purchase_price    is distinct from OLD.purchase_price    then v_changed := v_changed || 'purchase_price'::text; end if;
    if NEW.replacement_value is distinct from OLD.replacement_value then v_changed := v_changed || 'replacement_value'::text; end if;
  elsif TG_TABLE_NAME = 'product_units' then
    if NEW.purchase_price    is distinct from OLD.purchase_price    then v_changed := v_changed || 'purchase_price'::text; end if;
    if NEW.replacement_value is distinct from OLD.replacement_value then v_changed := v_changed || 'replacement_value'::text; end if;
  end if;

  if array_length(v_changed, 1) is null then
    -- Nothing priced changed. Serial, location, condition, status: all untouched
    -- by this guard, which is the whole point — warehouse work must not be
    -- collateral damage.
    return NEW;
  end if;

  raise exception
    'Law 6: your role may not see money, so it may not change it. Refused a write to %.% (%). '
    'Ask Owner, Admin, Manager, Coordinator or Accounts to change pricing.',
    TG_TABLE_NAME, array_to_string(v_changed, ', '), auth_user_role();
end;
$$;

comment on function reject_money_column_write_by_money_blind_role() is
  'Law 6 for the WRITE verb (0092). RLS admits Warehouse to products/product_units '
  'because they own serials and condition; this refuses only the priced columns. '
  'Exempt for postgres/service_role so migrations and seeds still run.';

drop trigger if exists trg_products_money_column_guard on products;
create trigger trg_products_money_column_guard
  before update on products
  for each row execute function reject_money_column_write_by_money_blind_role();

drop trigger if exists trg_product_units_money_column_guard on product_units;
create trigger trg_product_units_money_column_guard
  before update on product_units
  for each row execute function reject_money_column_write_by_money_blind_role();

-- -----------------------------------------------------------------------------
-- Post-conditions — three, because a guard that refuses too much is its own bug.
-- -----------------------------------------------------------------------------
do $$
declare
  v_product   uuid;
  v_rate      numeric;
  v_wh        uuid;
  v_blocked   boolean := false;
  v_allowed   boolean := false;
  v_status    text;
  v_err       text;
begin
  select id, daily_rate into v_product, v_rate from products limit 1;
  select id into v_wh from users where primary_role = 'Warehouse' limit 1;

  if v_product is null or v_wh is null then
    raise notice '0092: no product or no Warehouse user here; behavioural checks skipped.';
    return;
  end if;

  /*
   * The probe below acts AS `authenticated`. On a database rebuilt from these
   * migrations that role holds no privilege on `products` at all — no migration
   * grants base-table privileges (the DR gap filed in the audit) — so the write
   * is refused by the missing GRANT long before this trigger is consulted.
   *
   * That is not a pass and must not be recorded as one: the first run of this
   * migration through `check:rebuild` failed here precisely because the assertion
   * refused to accept "permission denied for table products" as evidence that
   * Law 6 works. Skip the behavioural half where it cannot be exercised, and say
   * so; the trigger itself is installed either way.
   */
  if not has_table_privilege('authenticated', 'public.products', 'UPDATE') then
    raise notice
      '0092: `authenticated` holds no UPDATE on products in this database, so the behavioural '
      'probe cannot distinguish this guard from the missing grant. Trigger installed; verified '
      'where the grants exist.';
    return;
  end if;

  -- (1) postgres (this migration) must still be able to write a price.
  update products set daily_rate = v_rate where id = v_product;

  -- (2) a Warehouse session must be REFUSED on a price.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update products set daily_rate = 1 where id = v_product;
  exception when others then
    /*
     * The MESSAGE is asserted, not merely the failure. The first run of this
     * migration refused the write for the wrong reason entirely — a `text[] ||
     * unknown` append raised 22P02 before the Law 6 message could — and a bare
     * `when others` called that a pass. A guard that refuses by accident is not
     * a guard.
     */
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a Warehouse session rewrote a price.';
  end if;
  if position('Law 6' in coalesce(v_err, '')) = 0 then
    raise exception
      'POST-CONDITION FAILED: the write was refused, but not by this guard. Postgres said: %', v_err;
  end if;
  if (select daily_rate from products where id = v_product) <> v_rate then
    raise exception 'POST-CONDITION FAILED: the refused write still changed the rate.';
  end if;

  -- (3) the SAME session must still be able to do its actual job.
  select status::text into v_status from products where id = v_product;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update products set updated_at = now() where id = v_product;
    v_allowed := true;
  exception when others then
    v_allowed := false;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_allowed then
    raise exception 'POST-CONDITION FAILED: the guard blocked a non-money warehouse update.';
  end if;

  raise notice '0092 verified: price writes refused for money-blind roles, non-money warehouse writes untouched, migrations exempt.';
end $$;

commit;
