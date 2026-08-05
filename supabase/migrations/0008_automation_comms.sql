-- =============================================================================
-- 0008_automation_comms.sql — domain: automation & communications
--
-- Laws encoded here, in the database, with no role bypass:
--   * NOTHING IS DELETED. Terminal states are Inactive / Cancelled / Deactivated.
--   * Every user-written table carries client_uuid uuid not null unique.
--   * Four canonical channels: WhatsApp, Email, SMS, In-App.
--   * Marketing communications respect quiet hours (07:00 – 20:00 NPT).
--   * Transactional messages are logged immutably.
-- =============================================================================

begin;

-- =============================================================================
-- 1. sms_gateways
-- Nepali SMS gateway providers (e.g. Sparrow SMS, Aakash SMS).
-- =============================================================================
create table sms_gateways (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  provider_name text         not null,
  api_endpoint  text         not null,
  sender_id     text         not null,
  is_primary    boolean      not null default false,
  is_active     boolean      not null default true,
  created_at    timestamptz  not null default now(),
  created_by    uuid         references users (id),
  updated_at    timestamptz  not null default now(),
  updated_by    uuid         references users (id),

  constraint sms_gateways_client_uuid_key unique (client_uuid),
  constraint sms_gateways_provider_key unique (provider_name)
);


-- =============================================================================
-- 2. notification_templates
-- Templates for system alerts, quotes, booking reminders, and receipts.
-- =============================================================================
create table notification_templates (
  id             uuid          not null default gen_random_uuid() primary key,
  client_uuid    uuid          not null,
  template_code  text          not null,
  channel        channel_code  not null default 'In-App',
  name           text          not null,
  subject        text,
  body_template  text          not null,
  variables      jsonb         not null default '[]'::jsonb,
  is_active      boolean       not null default true,
  created_at     timestamptz   not null default now(),
  created_by     uuid          references users (id),
  updated_at     timestamptz   not null default now(),
  updated_by     uuid          references users (id),

  constraint notification_templates_client_uuid_key unique (client_uuid),
  constraint notification_templates_code_key unique (template_code)
);

create index idx_notif_templates_code on notification_templates (template_code);


-- =============================================================================
-- 3. notifications
-- Real-time in-app notification inbox per user.
-- =============================================================================
create table notifications (
  id               uuid            not null default gen_random_uuid() primary key,
  client_uuid      uuid            not null,
  notification_no  text            not null,
  user_id          uuid            not null references users (id),
  title            text            not null,
  message          text            not null,
  channel          channel_code    not null default 'In-App',
  severity         alert_severity  not null default 'Information',
  link_url         text,
  is_read          boolean         not null default false,
  read_at          timestamptz,
  created_at       timestamptz     not null default now(),

  constraint notifications_client_uuid_key unique (client_uuid),
  constraint notifications_no_key unique (notification_no)
);

create index idx_notifications_user on notifications (user_id);
create index idx_notifications_read on notifications (user_id, is_read);


-- =============================================================================
-- 4. message_logs
-- Immutable delivery ledger for all outgoing SMS, Email, WhatsApp, and In-App messages.
-- =============================================================================
create table message_logs (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null,
  message_no      text          not null,
  recipient_type  text          not null default 'Client', -- 'Client', 'User', 'Crew', 'Supplier'
  recipient_id    uuid          not null,
  channel         channel_code  not null,
  destination     text          not null,
  subject         text,
  content         text          not null,
  status          text          not null default 'Queued', -- 'Queued', 'Sent', 'Delivered', 'Failed', 'Blocked'
  gateway_ref     text,
  error_message   text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz   not null default now(),

  constraint message_logs_client_uuid_key unique (client_uuid),
  constraint message_logs_no_key unique (message_no)
);

create index idx_message_logs_recipient on message_logs (recipient_type, recipient_id);
create index idx_message_logs_channel on message_logs (channel);
create index idx_message_logs_status on message_logs (status);


-- =============================================================================
-- 5. broadcast_batches
-- Marketing or bulk operational messaging campaigns.
-- =============================================================================
create table broadcast_batches (
  id                uuid            not null default gen_random_uuid() primary key,
  client_uuid       uuid            not null,
  batch_no          text            not null,
  name              text            not null,
  channel           channel_code    not null,
  target_segment    client_segment,
  total_recipients  integer         not null default 0,
  sent_count        integer         not null default 0,
  failed_count      integer         not null default 0,
  status            text            not null default 'Draft', -- 'Draft', 'Scheduled', 'Running', 'Completed', 'Cancelled'
  scheduled_for     timestamptz,
  created_at        timestamptz     not null default now(),
  created_by        uuid            references users (id),
  updated_at        timestamptz     not null default now(),
  updated_by        uuid            references users (id),

  constraint broadcast_batches_client_uuid_key unique (client_uuid),
  constraint broadcast_batches_no_key unique (batch_no)
);

create index idx_broadcast_batches_status on broadcast_batches (status);


-- =============================================================================
-- 6. automation_rules
-- Rule engine configuring if-this-then-that operational events.
-- =============================================================================
create table automation_rules (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  rule_no       text         not null,
  name          text         not null,
  trigger_event text         not null,
  conditions    jsonb        not null default '{}'::jsonb,
  actions       jsonb        not null default '[]'::jsonb,
  is_active     boolean      not null default true,
  created_at    timestamptz  not null default now(),
  created_by    uuid         references users (id),
  updated_at    timestamptz  not null default now(),
  updated_by    uuid         references users (id),

  constraint automation_rules_client_uuid_key unique (client_uuid),
  constraint automation_rules_no_key unique (rule_no)
);

create index idx_automation_rules_trigger on automation_rules (trigger_event);
create index idx_automation_rules_active on automation_rules (is_active);


-- =============================================================================
-- 7. automation_logs
-- Immutable execution logs for triggered automation rules.
-- =============================================================================
create table automation_logs (
  id                uuid         not null default gen_random_uuid() primary key,
  client_uuid       uuid         not null,
  rule_id           uuid         not null references automation_rules (id),
  trigger_event     text         not null,
  payload           jsonb        not null default '{}'::jsonb,
  execution_status  text         not null default 'Success', -- 'Success', 'Failed', 'Skipped'
  actions_taken     jsonb        not null default '[]'::jsonb,
  error_message     text,
  executed_at       timestamptz  not null default now(),

  constraint automation_logs_client_uuid_key unique (client_uuid)
);

create index idx_automation_logs_rule on automation_logs (rule_id);
create index idx_automation_logs_status on automation_logs (execution_status);


-- =============================================================================
-- 8. webhooks
-- Outbound integration endpoints for external systems.
-- =============================================================================
create table webhooks (
  id                 uuid         not null default gen_random_uuid() primary key,
  client_uuid        uuid         not null,
  endpoint_url       text         not null,
  event_types        text[]       not null default '{}',
  secret_token       text         not null,
  is_active          boolean      not null default true,
  last_triggered_at  timestamptz,
  created_at         timestamptz  not null default now(),
  created_by         uuid         references users (id),
  updated_at         timestamptz  not null default now(),
  updated_by         uuid         references users (id),

  constraint webhooks_client_uuid_key unique (client_uuid)
);

create index idx_webhooks_active on webhooks (is_active);


-- =============================================================================
-- Revocations & RLS
-- =============================================================================
revoke delete on
  sms_gateways,
  notification_templates,
  notifications,
  message_logs,
  broadcast_batches,
  automation_rules,
  automation_logs,
  webhooks
from public, anon, authenticated;

-- Immutable audit tables
revoke update on
  message_logs,
  automation_logs
from public, anon, authenticated;

alter table sms_gateways enable row level security;
alter table notification_templates enable row level security;
alter table notifications enable row level security;
alter table message_logs enable row level security;
alter table broadcast_batches enable row level security;
alter table automation_rules enable row level security;
alter table automation_logs enable row level security;
alter table webhooks enable row level security;

commit;
