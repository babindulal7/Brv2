-- =============================================================================
-- Migration 0134: Bundle Items Soft-Deactivation (OPEN_DECISIONS.md §4.52)
--
-- Law 3: Operational and configuration tables are append-only / soft-delete.
-- Physical DELETE operations are prohibited. Bundle line quantity must be >= 1.
-- This migration introduces is_active, deactivated_at, and deactivated_by
-- so components can be removed from a bundle without breaking history.
-- =============================================================================

begin;

alter table bundle_items
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references users(id);

create index if not exists idx_bundle_items_bundle_active
  on bundle_items (bundle_id, is_active);

-- -----------------------------------------------------------------------------
-- Post-condition assertion
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'bundle_items' and column_name = 'is_active'
  ) then
    raise exception '0134 post-condition failed: bundle_items.is_active not found';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'bundle_items' and column_name = 'deactivated_at'
  ) then
    raise exception '0134 post-condition failed: bundle_items.deactivated_at not found';
  end if;
end;
$$;

commit;
