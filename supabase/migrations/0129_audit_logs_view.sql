-- =============================================================================
-- 0129_audit_logs_view.sql — AUD-017 (P2)
--
-- Provide audit_logs compatibility view over audit_events so tools, analytics,
-- and verification queries referencing audit_logs resolve transparently.
-- =============================================================================

create or replace view public.audit_logs as
  select
    id,
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
    actor_role,
    branch_id,
    ip_address,
    user_agent,
    device_type,
    old_values,
    new_values,
    diff,
    reason,
    created_at
  from public.audit_events;

comment on view public.audit_logs is
  'AUD-017: Transparent compatibility view over audit_events for universal audit trail logging and queries.';

