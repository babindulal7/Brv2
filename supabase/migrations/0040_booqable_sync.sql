-- ============================================================================
-- 0040_booqable_sync.sql
-- Booqable sync bridge — the tables backing the Edge Functions that pull
-- from and push to Booqable (bookings/inventory system of record on their
-- side), reconcile conflicts, and give Owner/Admin a place to inspect queue
-- health without shelling into logs. Ported from the locked spec §6 DDL,
-- adapted only where noted below.
--
-- COLLISION CHECK (before writing this file)
-- -------------------------------------------
-- Grepped all 39 prior migrations for every identifier this file introduces:
-- external_refs, sync_state, sync_inbox, sync_outbox, sync_conflicts,
-- sync_log, external_invoices, sync_direction, sync_status. Two incidental
-- hits, both false positives on substring match, not real collisions:
--   - `scan_sync_conflicts` (0003/0026) — a distinct table about scan-event
--     reconciliation, not `sync_conflicts`. Different table, different
--     purpose, name only shares the "sync" substring.
--   - No other hit. No enum in 0001_enums.sql is named `sync_direction` or
--     `sync_status` (closest neighbours are `webhook_direction` and
--     `queue_state`, both unrelated types).
-- `bookings` (referenced by `external_invoices.booking_id`) verified to
-- exist as `public.bookings`, defined at 0002_bookings.sql line 21.
-- No renumbering or renaming was required — all seven table names, both
-- enum names, and every column name/type below match the spec's DDL
-- verbatim.
--
-- ONE DEVIATION FROM THE SPEC TEXT (not a name/type change)
-- -----------------------------------------------------------
-- The spec's DDL as pasted has `provider text not null default booqable`
-- — an unquoted bareword default, which Postgres parses as a column/function
-- reference and fails at migration time, not a string literal. Quoted it as
-- `default 'booqable'` below. This is a syntax fix to make the pasted spec
-- executable, not a naming or schema decision — the column stays `provider
-- text`, the value stays the word booqable, only the quoting changed.
--
-- THE RLS GAP THE SPEC'S OWN DDL LEFT OPEN
-- -------------------------------------------
-- This project's RLS-hardening thread (PLAN.md §6.9-§6.25, migrations
-- 0022-0039) exists because §6.9 found 111 tables with RLS enabled and only
-- 19 with any policy at all — enabled-but-policy-less reads as "secured" at
-- a glance while actually failing closed for every role including the ones
-- that need legitimate access. The spec's own draft SQL above repeats that
-- exact shape: all seven tables get `enable row level security`, but the
-- spec text only assigns a SELECT policy to three of them
-- (external_invoices, sync_conflicts, sync_log). external_refs, sync_state,
-- sync_inbox and sync_outbox are left with RLS on and nothing granting
-- access to anyone.
--
-- Left uncorrected, that is not a hypothetical — it is the identical bug
-- this project spent fifteen-plus migrations finding and fixing on the
-- rest of the schema, now reappearing in a brand-new set of tables on day
-- one. Fixed here rather than carried forward: all four get a real
-- Owner/Admin SELECT policy, same tier as `sync_conflicts`/`sync_log`
-- above them and the same tier this project already uses for
-- administrative/queue-inspection data (`audit_settings` — 0018,
-- `user_roles` — 0022).
--
-- Important distinction this comment exists to make explicit: these four
-- tables are written almost exclusively by the Booqable Edge Functions,
-- which connect to Supabase as `service_role`. `service_role` bypasses RLS
-- entirely by Postgres/Supabase design — no policy on these tables, present
-- or absent, changes whether the sync functions can read or write their own
-- queues. The SELECT policies added below exist for a different reason
-- entirely: so an authenticated Owner/Admin session in the app can inspect
-- sync queue state (pending inbox events, outbox backlog, ref mappings)
-- without a policy currently telling Postgres that's allowed. Nothing here
-- grants INSERT/UPDATE/DELETE to any authenticated role — the Edge
-- Functions remain the only writer, by service_role bypass, exactly as
-- before this migration.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Enums
-- ---------------------------------------------------------------------------

create type sync_direction as enum ('pull', 'push');
create type sync_status as enum ('pending', 'processing', 'done', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- 2 · external_refs — local_id <-> Booqable id mapping, one row per synced
--     record per entity.
-- ---------------------------------------------------------------------------

create table external_refs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'booqable',
  entity text not null,
  external_id text not null,
  local_id uuid not null,
  external_updated_at timestamptz,
  last_pulled_at timestamptz,
  last_pushed_at timestamptz,
  payload_hash text,
  created_at timestamptz not null default now(),
  unique (provider, entity, external_id),
  unique (provider, entity, local_id)
);
create index external_refs_local_idx on external_refs (entity, local_id);

-- ---------------------------------------------------------------------------
-- 3 · sync_state — one row per entity, tracks cursor/watermark for the pull
--     side of the bridge.
--
--     NOT WIRED YET: schema-correct but functionally dead as of this pass.
--     No code in src/lib/booqable/*.ts or supabase/functions/booqable-*
--     reads or writes this table — runFullPull() in sync.ts does not set or
--     read cursor/last_full_sync_at/records_seen. It exists here so the
--     incremental-pull phase (spec §6) has a home for cursor state without a
--     later migration; do not assume it is already being maintained until
--     sync.ts is updated to read/update it per entity.
-- ---------------------------------------------------------------------------

create table sync_state (
  entity text primary key,
  last_full_sync_at timestamptz,
  cursor text,
  records_seen bigint not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4 · sync_inbox — inbound Booqable webhook events queued for processing.
-- ---------------------------------------------------------------------------

create table sync_inbox (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event text not null,
  entity text,
  external_id text,
  signature_ok boolean not null,
  raw jsonb not null,
  status sync_status not null default 'pending',
  attempts int not null default 0,
  error text,
  processed_at timestamptz
);
create index sync_inbox_pending_idx on sync_inbox (status, received_at);

-- ---------------------------------------------------------------------------
-- 5 · sync_outbox — outbound local changes queued to push to Booqable.
-- ---------------------------------------------------------------------------

create table sync_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  entity text not null,
  local_id uuid not null,
  operation text not null,
  payload jsonb not null,
  status sync_status not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  error text,
  external_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index sync_outbox_ready_idx on sync_outbox (status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- 6 · sync_conflicts — field-level disagreements between local and external
--     state that need a human resolution decision.
-- ---------------------------------------------------------------------------

create table sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  detected_at timestamptz not null default now(),
  entity text not null,
  local_id uuid,
  external_id text,
  field text not null,
  local_value text,
  external_value text,
  owner text not null,
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 7 · sync_log — append-only request/response trail for both directions.
-- ---------------------------------------------------------------------------

create table sync_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  direction sync_direction not null,
  path text,
  method text,
  http_status int,
  duration_ms int,
  entity text,
  external_id text,
  actor uuid,
  payload_hash text,
  error text
);
create index sync_log_at_idx on sync_log (at desc);

-- ---------------------------------------------------------------------------
-- 8 · external_invoices — Booqable-issued invoice/credit-note documents,
--     mirrored locally for reconciliation against `bookings`.
-- ---------------------------------------------------------------------------

create table external_invoices (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  booking_id uuid references bookings(id),
  document_type text not null,
  number text,
  issued_at timestamptz,
  currency char(3) not null,
  total_minor bigint not null,
  tax_minor bigint,
  status text,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 9 · Row level security — every table enabled, every table given a real
--     policy. See header comment for why the four queue tables (spec left
--     policy-less) get one here, and why that does not affect the Edge
--     Functions' own service_role write path.
-- ---------------------------------------------------------------------------

alter table external_refs enable row level security;
alter table sync_state enable row level security;
alter table sync_inbox enable row level security;
alter table sync_outbox enable row level security;
alter table sync_conflicts enable row level security;
alter table sync_log enable row level security;
alter table external_invoices enable row level security;

-- external_invoices — carries money columns (total_minor, tax_minor), so
-- gated on both "is this session staff at all" and Law 6's money-visibility
-- gate, same pairing this schema already uses for masked money reads.
drop policy if exists external_invoices_select on external_invoices;
create policy external_invoices_select on external_invoices
  for select
  using (
    auth_is_staff() and auth_can_view_money()
  );

comment on policy external_invoices_select on external_invoices is
  'Money-bearing sync mirror of Booqable invoices/credit notes — staff-only and Law-6 money-gated, same pairing as the rest of this schema''s masked money reads.';

-- sync_conflicts — per spec: Owner/Admin only. Conflict rows can surface
-- either side''s raw field values, including money fields on booking-linked
-- entities, so this is not opened to the broader staff/auth_is_staff() tier.
drop policy if exists sync_conflicts_select on sync_conflicts;
create policy sync_conflicts_select on sync_conflicts
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
  );

-- sync_log — per spec: Owner/Admin only. Request/response trail can include
-- entity and external_id detail across every synced table; treated as
-- administrative/audit-tier data, same reasoning as `audit_events` (0018).
drop policy if exists sync_log_select on sync_log;
create policy sync_log_select on sync_log
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
  );

-- sync_state, sync_inbox, sync_outbox, external_refs — NOT specified with a
-- policy in the spec's draft DDL despite RLS being enabled on all four; see
-- header comment. Added here so Owner/Admin can inspect queue/cursor state
-- from the app; the Edge Functions writing these tables run as
-- service_role and are unaffected either way, since service_role bypasses
-- RLS by Postgres design regardless of what policies exist below.

drop policy if exists sync_state_select on sync_state;
create policy sync_state_select on sync_state
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists sync_inbox_select on sync_inbox;
create policy sync_inbox_select on sync_inbox
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists sync_outbox_select on sync_outbox;
create policy sync_outbox_select on sync_outbox
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists external_refs_select on external_refs;
create policy external_refs_select on external_refs
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
  );

comment on policy sync_state_select on sync_state is
  'Not in the spec''s draft DDL — added so this table does not ship RLS-enabled-zero-policies (see PLAN.md §6.9). Written exclusively by the service_role Edge Functions, which bypass RLS regardless; this policy exists only for Owner/Admin app-side inspection.';
comment on policy sync_inbox_select on sync_inbox is
  'Same gap and same fix as sync_state_select — see that policy''s comment.';
comment on policy sync_outbox_select on sync_outbox is
  'Same gap and same fix as sync_state_select — see that policy''s comment.';
comment on policy external_refs_select on external_refs is
  'Same gap and same fix as sync_state_select — see that policy''s comment.';

commit;
