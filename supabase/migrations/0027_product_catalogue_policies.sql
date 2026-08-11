-- ============================================================================
-- 0027_product_catalogue_policies.sql
--
-- Fifth reviewed batch out of the 92-table RLS gap (§6.9-§6.13 in PLAN.md).
-- Two genuinely new tables (`product_compatibilities`, `product_documents`,
-- both `products` children) plus one gap found while scoping them: `products`
-- itself has never had an INSERT or UPDATE policy anywhere.
--
-- `0019_column_level_money_masking.sql` gave `products` a SELECT policy
-- (`auth_is_staff()`) as part of closing its money-masking gap, but never
-- touched write — that migration's own scope was read-side masking, not a
-- full policy set. The result: with RLS enabled and only a SELECT policy
-- present, Postgres denies INSERT/UPDATE to every role, Owner included —
-- nobody could add or edit a catalogue product. Confirmed by grep across all
-- 26 migration files before writing this: zero `products_insert`/
-- `products_update` anywhere. Closed here, mirroring `product_units`'s own
-- write tier (`0018`, `('Owner', 'Admin', 'Manager', 'Warehouse')`) — the
-- two tables are the same domain (catalogue vs. serialized unit of the same
-- catalogue) and already share that tier's reasoning.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · products — the missing write policies
-- ---------------------------------------------------------------------------

drop policy if exists products_insert on products;
create policy products_insert on products
  for insert
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists products_update on products;
create policy products_update on products
  for update
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

comment on policy products_insert on products is
  'Was missing entirely -- 0019 only ever added products_select. Without this, RLS silently denied every write, Owner included. Mirrors product_units'' tier (0018).';

-- ---------------------------------------------------------------------------
-- 2 · product_compatibilities / product_documents
--
-- Both are `products` children (compatibility links, attached manuals/
-- certificates) -- no money columns, same tier as their parent.
-- ---------------------------------------------------------------------------

drop policy if exists product_compatibilities_select on product_compatibilities;
create policy product_compatibilities_select on product_compatibilities
  for select
  using (auth_is_staff());

drop policy if exists product_compatibilities_all on product_compatibilities;
create policy product_compatibilities_all on product_compatibilities
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists product_documents_select on product_documents;
create policy product_documents_select on product_documents
  for select
  using (auth_is_staff());

drop policy if exists product_documents_all on product_documents;
create policy product_documents_all on product_documents
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

commit;
