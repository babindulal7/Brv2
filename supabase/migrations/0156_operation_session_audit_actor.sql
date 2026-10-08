-- ============================================================================
-- 0156_operation_session_audit_actor.sql — written 06 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- 0154 attached the universal `log_audit_event()` to `operation_sessions`. Found on review the
-- same day: on UPDATE that function takes the actor from `updated_by` (a column this table does
-- not have) or the `app.current_user_id` setting (which the app does not set), so the COMPLETION
-- row — the event that matters — was written with `actor_id = NULL`. A record of a return with
-- no "who" is not an audit trail, and 0154's header claimed it was.
--
-- WHAT
-- ----
-- A dedicated trigger function for this table, replacing 0154's trigger. Actor, in order:
--   1. auth_user_id()       — the signed-in caller (a real JWT on Supabase)
--   2. app.current_user_id  — the existing session-setting convention
--   3. completed_by, started_by, created_by — the columns the row itself carries
-- Rows are classed `session` / `Operations` instead of the generic `status change` / `Rentals`.
-- Same payload as before (old/new row as jsonb), same append-only table (Law 4 untouched).
-- The universal log_audit_event() is NOT edited: it serves other tables and this keeps the change
-- scoped to one.
--
-- RULING 2026-10-06: stricter and additive (B-1). Supersedes 0154's trigger binding only.
-- REVERT: drop trigger trg_audit_operation_sessions on operation_sessions;
--         create trigger trg_audit_operation_sessions after insert or update on operation_sessions
--           for each row execute function log_audit_event();
-- Verified by scripts/test-operation-session-audit.mjs (2 extra checks fail with 0154 alone).
-- ============================================================================

begin;

create or replace function log_operation_session_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
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
  v_actor := coalesce(v_actor, NEW.completed_by, NEW.started_by, NEW.created_by);

  insert into audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, old_values, new_values
  ) values (
    gen_random_uuid(), 'session', 'Rentals', 'Operations',
    case when TG_OP = 'INSERT' then 'Create'::audit_action else 'Update'::audit_action end,
    'Informational', 'Success',
    TG_TABLE_NAME, NEW.id, v_actor,
    case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end,
    to_jsonb(NEW)
  );
  return NEW;
end;
$$;

revoke all on function log_operation_session_audit() from public;

drop trigger if exists trg_audit_operation_sessions on operation_sessions;
create trigger trg_audit_operation_sessions after insert or update on operation_sessions
  for each row execute function log_operation_session_audit();

commit;
