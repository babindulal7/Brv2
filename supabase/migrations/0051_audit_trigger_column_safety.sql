-- ============================================================================
-- 0051_audit_trigger_column_safety.sql — 11 Aug 2026
--
-- THE BUG
-- -------
-- `log_audit_event()` (0010) dereferences `NEW.updated_by` on the UPDATE path
-- and `NEW.created_by` on the INSERT path. In PL/pgSQL those are hard field
-- references: on a table that does not define the column, the trigger raises
--
--     ERROR: 42703: record "new" has no field "updated_by"
--
-- and the whole statement aborts. The trigger is attached to six tables, and
-- two of them — `clients` and `payments` — have no `updated_by` column at all.
--
-- Practical effect on `clients`: EVERY update failed. That includes the Law 3
-- terminal action for a client (Deactivate), blocking a client, correcting a
-- phone number — the table was effectively append-only by accident, not by
-- design. Found 11 Aug 2026 the first time anything actually tried to update a
-- real row through the real stack; no amount of reading the schema had surfaced
-- it, because the trigger body only fails when a row of the wrong shape reaches
-- it.
--
-- THE FIX
-- -------
-- Read both columns through `to_jsonb(NEW)` instead. A missing key yields SQL
-- NULL rather than raising, so the `coalesce(..., v_actor_id)` fallback that was
-- always the intent actually gets to run. Behaviour on tables that DO have the
-- columns is unchanged: same value, same precedence.
--
-- Everything else in the function body is preserved verbatim, including the
-- `search_path` pin 0050 added.
-- ============================================================================

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor_id uuid;
  v_client_uuid uuid := gen_random_uuid();
  v_action audit_action;
  v_event_class audit_event_class := 'status change';
  v_category audit_category := 'Rentals';
  v_module audit_module := 'Rentals';
  -- Column-safe reads: NULL when the table does not define the column, instead
  -- of a 42703 that aborts the caller's statement.
  v_row_created_by uuid := nullif(to_jsonb(NEW) ->> 'created_by', '')::uuid;
  v_row_updated_by uuid := nullif(to_jsonb(NEW) ->> 'updated_by', '')::uuid;
begin
  -- Resolve actor from session setting or default to system
  begin
    v_actor_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
  exception when others then
    v_actor_id := null;
  end;

  if (TG_OP = 'INSERT') then
    v_action := 'Create';
    insert into audit_events (
      client_uuid,
      event_class,
      category,
      module,
      action,
      severity,
      status,
      table_name,
      record_id,
      actor_id,
      new_values
    ) values (
      v_client_uuid,
      v_event_class,
      v_category,
      v_module,
      v_action,
      'Informational',
      'Success',
      TG_TABLE_NAME,
      NEW.id,
      coalesce(v_row_created_by, v_actor_id),
      to_jsonb(NEW)
    );
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    v_action := 'Update';
    insert into audit_events (
      client_uuid,
      event_class,
      category,
      module,
      action,
      severity,
      status,
      table_name,
      record_id,
      actor_id,
      old_values,
      new_values
    ) values (
      v_client_uuid,
      v_event_class,
      v_category,
      v_module,
      v_action,
      'Informational',
      'Success',
      TG_TABLE_NAME,
      NEW.id,
      coalesce(v_row_updated_by, v_actor_id),
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    return NEW;
  end if;

  return null;
end;
$function$;

comment on function public.log_audit_event() is
  'Append-only audit stamp. Reads created_by/updated_by through to_jsonb(NEW) so the trigger works on audited tables that do not define those columns (clients and payments do not) — see 0051 for the outage this fixes.';
