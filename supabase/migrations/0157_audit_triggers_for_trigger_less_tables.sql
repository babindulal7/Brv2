-- ============================================================================
-- 0157_audit_triggers_for_trigger_less_tables.sql — written 06 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- PLAN.md §4.36 (ruled 06 Oct 2026): the DATABASE trigger is the audit of record and the app-side
-- `logAuditEvent` row is supplementary — a failure there proceeds. That is only safe where a trigger
-- exists. Four tables had none, so their app-side row was the ONLY record:
--   cleaning_queue_entries (Warehouse reset), purchase_requests, stock_transfers, products.
--
-- WHAT
-- ----
-- One small generic trigger function and four bindings (INSERT and UPDATE; there is no DELETE path,
-- nothing is deleted). Unlike `log_audit_event()` it does not leave the actor empty: actor is
--   auth_user_id()  ->  app.current_user_id  ->  updated_by  ->  created_by   (read through to_jsonb(NEW),
-- so a table without the column yields NULL instead of an error, the trap 0010 documents).
-- Module/category by table: cleaning_queue_entries = Operations / session; the other three = Inventory.
-- The app-side rows are untouched, so each change may now show two rows (trigger = who/what/before-after,
-- app = reason and device context). That duplication is intended, not a bug.
--
-- WHAT THIS DOES NOT DO: it does not make any app write fail on an audit error beyond what a trigger
-- already does (a failed audit insert fails the statement). No policy, enum or column changes.
--
-- RULING 2026-10-06: stricter and additive (B-1), one-statement revert per table (B-6).
-- REVERT: drop trigger trg_audit_<table> on <table>;  (x4), then drop function log_audit_event_actor();
-- Verified by scripts/test-audit-trigger-coverage.mjs (fails 6 checks without this file).
-- ============================================================================

begin;

create or replace function log_audit_event_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_row jsonb := to_jsonb(NEW);
  v_module audit_module;
  v_category audit_category;
  v_class audit_event_class;
begin
  begin
    v_actor := auth_user_id();
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    begin
      v_actor := nullif(current_setting('app.current_user_id', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;
  end if;
  v_actor := coalesce(
    v_actor,
    nullif(v_row ->> 'updated_by', '')::uuid,
    nullif(v_row ->> 'created_by', '')::uuid
  );

  if TG_TABLE_NAME = 'cleaning_queue_entries' then
    v_module := 'Operations'; v_category := 'Rentals'; v_class := 'session';
  else
    v_module := 'Inventory'; v_category := 'Inventory'; v_class := 'status change';
  end if;

  insert into audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, old_values, new_values
  ) values (
    gen_random_uuid(), v_class, v_category, v_module,
    case when TG_OP = 'INSERT' then 'Create'::audit_action else 'Update'::audit_action end,
    'Informational', 'Success',
    TG_TABLE_NAME, NEW.id, v_actor,
    case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end,
    v_row
  );
  return NEW;
end;
$$;

revoke all on function log_audit_event_actor() from public;

drop trigger if exists trg_audit_cleaning_queue_entries on cleaning_queue_entries;
create trigger trg_audit_cleaning_queue_entries after insert or update on cleaning_queue_entries
  for each row execute function log_audit_event_actor();

drop trigger if exists trg_audit_purchase_requests on purchase_requests;
create trigger trg_audit_purchase_requests after insert or update on purchase_requests
  for each row execute function log_audit_event_actor();

drop trigger if exists trg_audit_stock_transfers on stock_transfers;
create trigger trg_audit_stock_transfers after insert or update on stock_transfers
  for each row execute function log_audit_event_actor();

drop trigger if exists trg_audit_products on products;
create trigger trg_audit_products after insert or update on products
  for each row execute function log_audit_event_actor();

commit;
