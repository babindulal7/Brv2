-- ============================================================================
-- 0160_pricing_structures.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Booqable adoption spec G3. Live Booqable prices products with 9 pricing structures ("Babin Daily",
-- "Days wise discount", "Rental Rate Card" …) and 4 seasonal rulesets. `lib/pricingPipeline.ts` only has a
-- flat duration %, so a client's price would change on cutover day unless the same structures exist here.
--
-- WHAT
-- ----
--   pricing_structures       a named set of duration tiles + an optional fee per extra day.
--   pricing_structure_tiles  "up to N days costs P". Prices round UP to the next tile.
--   pricing_rulesets         a named, ordered list of rules; one ruleset per product.
--   pricing_rules            kind 'charge' (free pickup / return day) or 'price' (a signed % by weekday
--                            and/or date range). Charge rules run first, then price rules, top to bottom;
--                            each price rule's `stack` says whether it compounds on the adjusted price.
--   products.pricing_structure_id / pricing_ruleset_id   which structure / ruleset a product uses.
--
-- The arithmetic is `src/lib/pricingStructures.ts` (fixture: Booqable's documented 7-day example).
--
-- NOT IN THIS FILE — and why it matters: a booking line stores ONE per-day rate, and `create_booking`
-- takes the caller's rate. A structure price does not divide into a per-day rate without a paisa
-- discrepancy against the quote, so wiring these into an invoice amount needs `create_booking` to accept a
-- line total plus a `price_breakdown` snapshot. That is a separate, larger migration (create_booking has
-- been rewritten eight times) and is deliberately NOT done here. Until then these tables and the engine
-- are the quote model and the import target.
--
-- LAW 6: every column in these tables is a price rule. Whole-row RLS — read needs auth_can_view_money(),
-- write is Owner · Admin · Manager (same tier as coupons, 0037). The two product link columns hold ids,
-- not figures, so a money-blind role may read them; changing them is a price change and is refused to a
-- money-blind role by trigger (the Warehouse can UPDATE products — 0092).
-- LAW 3: nothing is deleted. A tile, rule, structure or ruleset is retired (`retired_at`).
-- AUDIT: every insert/update is audited by the database (log_audit_event_actor, 0157).
--
-- RULING 2026-10-07: weekday numbering is 0 = Sunday … 6 = Saturday (Nepal's weekend day is Saturday).
-- REVERT: alter table products drop column pricing_structure_id, drop column pricing_ruleset_id;
--         drop table pricing_rules, pricing_rulesets, pricing_structure_tiles, pricing_structures;
-- ============================================================================

begin;

create table pricing_structures (
  id                uuid          not null default gen_random_uuid() primary key,
  client_uuid       uuid          not null,
  name              text          not null,
  extra_day_amount  numeric(14,2) check (extra_day_amount is null or extra_day_amount >= 0),
  source_ref        text,
  retired_at        timestamptz,
  created_at        timestamptz   not null default now(),
  created_by        uuid          references users (id),
  updated_at        timestamptz   not null default now(),
  updated_by        uuid          references users (id),
  constraint pricing_structures_client_uuid_key unique (client_uuid),
  constraint pricing_structures_name_len check (char_length(btrim(name)) between 1 and 120)
);
create unique index pricing_structures_name_key on pricing_structures (lower(btrim(name))) where retired_at is null;

create table pricing_structure_tiles (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null,
  structure_id    uuid          not null references pricing_structures (id),
  duration_days   integer       not null check (duration_days >= 1),
  amount          numeric(14,2) not null check (amount >= 0),
  retired_at      timestamptz,
  created_at      timestamptz   not null default now(),
  created_by      uuid          references users (id),
  updated_at      timestamptz   not null default now(),
  updated_by      uuid          references users (id),
  constraint pricing_structure_tiles_client_uuid_key unique (client_uuid)
);
create unique index pricing_structure_tiles_duration_key
  on pricing_structure_tiles (structure_id, duration_days) where retired_at is null;

create table pricing_rulesets (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  name         text         not null,
  source_ref   text,
  valid_until  date,
  retired_at   timestamptz,
  created_at   timestamptz  not null default now(),
  created_by   uuid         references users (id),
  updated_at   timestamptz  not null default now(),
  updated_by   uuid         references users (id),
  constraint pricing_rulesets_client_uuid_key unique (client_uuid),
  constraint pricing_rulesets_name_len check (char_length(btrim(name)) between 1 and 120)
);
create unique index pricing_rulesets_name_key on pricing_rulesets (lower(btrim(name))) where retired_at is null;

create table pricing_rules (
  id             uuid         not null default gen_random_uuid() primary key,
  client_uuid    uuid         not null,
  ruleset_id     uuid         not null references pricing_rulesets (id),
  sort_order     integer      not null default 0,
  kind           text         not null,
  name           text         not null,
  charge_action  text,
  pickup_after   time,
  return_before  time,
  percent        numeric(6,2),
  weekdays       smallint[],
  valid_from     date,
  valid_to       date,
  apply_when     text         not null default 'overlaps',
  stack          boolean      not null default false,
  retired_at     timestamptz,
  created_at     timestamptz  not null default now(),
  created_by     uuid         references users (id),
  updated_at     timestamptz  not null default now(),
  updated_by     uuid         references users (id),
  constraint pricing_rules_client_uuid_key unique (client_uuid),
  constraint pricing_rules_kind_valid check (kind in ('charge', 'price')),
  constraint pricing_rules_apply_when_valid check (apply_when in ('overlaps', 'fits_within', 'spans')),
  constraint pricing_rules_weekdays_valid check (weekdays is null or weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint pricing_rules_dates_ordered check (valid_from is null or valid_to is null or valid_from <= valid_to),
  constraint pricing_rules_shape check (
    (kind = 'charge' and charge_action in ('skip_pickup_day', 'skip_return_day') and percent is null)
    or (kind = 'price' and charge_action is null and percent is not null and percent between -100 and 1000)
  )
);
create index idx_pricing_rules_ruleset on pricing_rules (ruleset_id, sort_order);

-- ---------------------------------------------------------------------------
-- Law 3 — nothing is deleted.
-- ---------------------------------------------------------------------------
create trigger trg_pricing_structures_reject_delete before delete on pricing_structures
  for each row execute function reject_delete_nothing_is_deleted('retire it (retired_at)');
create trigger trg_pricing_structure_tiles_reject_delete before delete on pricing_structure_tiles
  for each row execute function reject_delete_nothing_is_deleted('retire the tile (retired_at)');
create trigger trg_pricing_rulesets_reject_delete before delete on pricing_rulesets
  for each row execute function reject_delete_nothing_is_deleted('retire it (retired_at)');
create trigger trg_pricing_rules_reject_delete before delete on pricing_rules
  for each row execute function reject_delete_nothing_is_deleted('retire the rule (retired_at)');

-- Audit of record (PLAN §4.36): the database audits every change to a price rule.
create trigger trg_audit_pricing_structures after insert or update on pricing_structures
  for each row execute function log_audit_event_actor();
create trigger trg_audit_pricing_structure_tiles after insert or update on pricing_structure_tiles
  for each row execute function log_audit_event_actor();
create trigger trg_audit_pricing_rulesets after insert or update on pricing_rulesets
  for each row execute function log_audit_event_actor();
create trigger trg_audit_pricing_rules after insert or update on pricing_rules
  for each row execute function log_audit_event_actor();

-- ---------------------------------------------------------------------------
-- RLS — whole-row, money-gated (Law 6); write is Owner · Admin · Manager.
-- ---------------------------------------------------------------------------
alter table pricing_structures enable row level security;
alter table pricing_structure_tiles enable row level security;
alter table pricing_rulesets enable row level security;
alter table pricing_rules enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pricing_structures', 'pricing_structure_tiles', 'pricing_rulesets', 'pricing_rules'] loop
    execute format('create policy %I on %I for select to authenticated using (auth_is_staff() and auth_can_view_money())', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (auth_user_role() in (''Owner'', ''Admin'', ''Manager''))', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (auth_user_role() in (''Owner'', ''Admin'', ''Manager'')) with check (auth_user_role() in (''Owner'', ''Admin'', ''Manager''))', t || '_update', t);
    execute format('revoke all on %I from public, anon, authenticated', t);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Products point at one structure and one ruleset.
-- ---------------------------------------------------------------------------
alter table products add column pricing_structure_id uuid references pricing_structures (id);
alter table products add column pricing_ruleset_id uuid references pricing_rulesets (id);
create index idx_products_pricing_structure on products (pricing_structure_id) where pricing_structure_id is not null;
create index idx_products_pricing_ruleset on products (pricing_ruleset_id) where pricing_ruleset_id is not null;

-- products carries column-level grants (0062); a new column is not readable until it is named.
grant select (pricing_structure_id, pricing_ruleset_id) on products to authenticated;

create or replace function guard_product_pricing_link()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not auth_can_view_money()
     and (NEW.pricing_structure_id is distinct from OLD.pricing_structure_id
          or NEW.pricing_ruleset_id is distinct from OLD.pricing_ruleset_id) then
    raise exception 'GATE:gate.pricing.money_blind_link|Only a role that can see money may change how a product is priced.' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;
revoke all on function guard_product_pricing_link() from public, anon, authenticated;

create trigger trg_products_pricing_link_guard
  before update of pricing_structure_id, pricing_ruleset_id on products
  for each row execute function guard_product_pricing_link();

commit;
