-- ============================================================================
-- 0029_system_config_policies.sql
--
-- Seventh reviewed batch out of the 92-table RLS gap (§6.9-§6.15 in
-- PLAN.md). Five system/integration config tables, split by what each one
-- actually holds rather than given one blanket "config" tier:
--
--   - `notification_templates`, `automation_rules` — business-logic
--     config, no secrets. Same shape as `inventory_categories`/`suppliers`
--     (0028): `auth_is_staff()` read, `('Owner', 'Admin', 'Manager')`
--     write.
--   - `sms_gateways` — read carefully: `provider_name`/`api_endpoint`/
--     `sender_id` are configuration, not a credential column (this table
--     has none) — same tier as the two above.
--   - `webhooks` — DOES hold a real secret: `secret_token`, the shared
--     signing secret for verifying inbound webhook calls. Nothing else in
--     the row (`endpoint_url`, `event_types`) is something Warehouse/
--     Technician/Driver/Coordinator have any use for either, so unlike
--     `client_channel_identities` (§6.12, a partial column mask), this
--     doesn't need a masking view — the simpler fix is a tighter *row*
--     tier: `('Owner', 'Admin')` only, for both read and write. Narrower
--     than every other table in this migration.
--   - `system_settings` — has its own `is_public`/`is_encrypted` boolean
--     columns already in the schema, meaning the table itself already
--     states that visibility is conditional, not uniform. `is_public = true`
--     rows (e.g. business hours, contact info) should be staff-readable;
--     `is_public = false` rows (integration credentials stored as
--     settings) should not. `using (is_public or auth_user_role() in
--     (...))` implements that instead of overriding what the column
--     already says.
-- ============================================================================

begin;

drop policy if exists notification_templates_select on notification_templates;
create policy notification_templates_select on notification_templates
  for select
  using (auth_is_staff());

drop policy if exists notification_templates_manage on notification_templates;
create policy notification_templates_manage on notification_templates
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists automation_rules_select on automation_rules;
create policy automation_rules_select on automation_rules
  for select
  using (auth_is_staff());

drop policy if exists automation_rules_manage on automation_rules;
create policy automation_rules_manage on automation_rules
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists sms_gateways_select on sms_gateways;
create policy sms_gateways_select on sms_gateways
  for select
  using (auth_is_staff());

drop policy if exists sms_gateways_manage on sms_gateways;
create policy sms_gateways_manage on sms_gateways
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists webhooks_select on webhooks;
create policy webhooks_select on webhooks
  for select
  using (auth_user_role() in ('Owner', 'Admin'));

drop policy if exists webhooks_manage on webhooks;
create policy webhooks_manage on webhooks
  for all
  using (auth_user_role() in ('Owner', 'Admin'))
  with check (auth_user_role() in ('Owner', 'Admin'));

comment on policy webhooks_select on webhooks is
  'Row carries secret_token, the webhook signing secret -- tighter than every other table in this migration (Owner/Admin only, no Manager), not a column mask, since nothing else in the row needs floor/desk visibility either.';

drop policy if exists system_settings_select on system_settings;
create policy system_settings_select on system_settings
  for select
  using (is_public or auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists system_settings_manage on system_settings;
create policy system_settings_manage on system_settings
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

comment on policy system_settings_select on system_settings is
  'Respects the table''s own is_public column instead of a uniform tier -- business-facing settings stay staff-readable, non-public rows (e.g. stored integration credentials) do not.';

commit;
