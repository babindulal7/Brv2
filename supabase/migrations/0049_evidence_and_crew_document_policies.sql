-- ============================================================================
-- 0049_evidence_and_crew_document_policies.sql — generated 11 Aug 2026
-- (written as 0044, renumbered on collision: a concurrent session had already
--  taken 0043-0047.)
--
-- WHY
-- ---
-- Supabase's advisor reports INFO `rls_enabled_no_policy` against six tables.
-- Three of them are closed here. The other three are not, deliberately — see
-- the TODO(decision) at the foot of this file.
--
-- `crew_documents`, `evidence_files` and `evidence_references` have had RLS
-- enabled and zero policies since they were created. That combination is
-- fail-closed for `authenticated` (no policy means no row passes), so this is
-- not an open door — it is the opposite: these three tables are currently
-- unreadable and unwritable by the application. They were skipped, not
-- forgotten. PLAN.md §6.17 records why: `crew_documents` carries
-- `evidence_file_id not null references evidence_files (id)`, and
-- `evidence_files` could not be created in a real deploy because §4.11's
-- `items` phantom-table bug reached it through `matched_item_id`. All three
-- were transitively blocked on that.
--
-- `0042_deferred_cross_file_fks.sql` resolved the `items` question, so the
-- block is lifted and the tier each table was always going to get can be
-- written. Nothing about the tiers themselves was re-litigated here.
--
-- TIERS — mirrored from live `pg_policies`, not from the migrations
-- ------------------------------------------------------------------
-- `evidence_files` / `evidence_references` mirror `operation_sessions`
-- (PLAN.md §6.17). Evidence is captured during pack/dispatch/return scans, so
-- the write tier is the floor tier that runs those sessions:
--   SELECT -> auth_is_staff()
--   ALL    -> Owner / Admin / Manager / Warehouse
-- Read verbatim off the live database:
--   operation_sessions_select  qual = auth_is_staff()
--   operation_sessions_all     qual = Owner/Admin/Manager/Warehouse
--
-- `crew_documents` mirrors the crew-scheduling tier its four siblings got in
-- `0030` (PLAN.md §6.17 — desk/coordination data, not floor-scan work):
--   SELECT -> auth_is_staff()
--   ALL    -> Owner / Admin / Manager / Coordinator
-- Read verbatim off the live database from `crew_skills` / `crew_shoot_days`
-- / `crew_leaves`, all three of which carry exactly this pair.
--
-- NO MONEY COLUMN ON ANY OF THE THREE — checked, not assumed
-- ----------------------------------------------------------
-- All three column lists were pulled from `information_schema.columns` and
-- read in full. `evidence_files` is metadata about a captured file (hash,
-- storage path, media type, size, GPS, match state, retention). Its only
-- `numeric` columns are `gps_lat`, `gps_lng` and `confidence` — coordinates
-- and a match score, not currency. `evidence_references` is pure join/pointer
-- rows. `crew_documents` is doc type, expiry and retention.
--
-- So none of the three needs a masking `_v` view or an `auth_can_view_money()`
-- gate, and none is added. This matters because the surrounding families do
-- have money (`crew_members.day_rate`, `crew_bookings.day_rate`), and mirroring
-- a sibling's *policy* tier is not the same as inheriting its masking needs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- evidence_files — mirrors operation_sessions
-- ---------------------------------------------------------------------------
drop policy if exists evidence_files_select on public.evidence_files;
drop policy if exists evidence_files_all    on public.evidence_files;

create policy evidence_files_select on public.evidence_files
  for select
  using (auth_is_staff());

create policy evidence_files_all on public.evidence_files
  for all
  using (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse']::system_role[])
  )
  with check (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse']::system_role[])
  );

-- ---------------------------------------------------------------------------
-- evidence_references — mirrors operation_sessions
-- ---------------------------------------------------------------------------
drop policy if exists evidence_references_select on public.evidence_references;
drop policy if exists evidence_references_all    on public.evidence_references;

create policy evidence_references_select on public.evidence_references
  for select
  using (auth_is_staff());

create policy evidence_references_all on public.evidence_references
  for all
  using (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse']::system_role[])
  )
  with check (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse']::system_role[])
  );

-- ---------------------------------------------------------------------------
-- crew_documents — mirrors the crew-scheduling tier (crew_skills et al.)
-- ---------------------------------------------------------------------------
drop policy if exists crew_documents_select on public.crew_documents;
drop policy if exists crew_documents_all    on public.crew_documents;

create policy crew_documents_select on public.crew_documents
  for select
  using (auth_is_staff());

create policy crew_documents_all on public.crew_documents
  for all
  using (
    auth_user_role() = any (array['Owner','Admin','Manager','Coordinator']::system_role[])
  )
  with check (
    auth_user_role() = any (array['Owner','Admin','Manager','Coordinator']::system_role[])
  );

-- ---------------------------------------------------------------------------
-- TODO(decision) — crew_documents read breadth
--
-- The `auth_is_staff()` SELECT gate above is a faithful mirror of the four
-- crew-scheduling siblings, which is what this migration was scoped to do.
-- Flagging, not silently narrowing: `crew_skills`/`crew_shoot_days`/
-- `crew_leaves` hold scheduling facts, whereas `crew_documents` points at
-- identity paperwork (`doc_type` + `evidence_file_id`) — citizenship, PAN,
-- contracts. `auth_is_staff()` is every role except Client, so it currently
-- includes Warehouse, Technician and Driver.
--
-- Whether a Driver should be able to list a colleague's identity documents is
-- a real HR/privacy call and not one this migration is entitled to make on
-- its own. If the answer is no, the fix is to narrow `crew_documents_select`
-- to the same Owner/Admin/Manager/Coordinator list as the write policy. Left
-- as the sibling tier until that is decided. Logged in PLAN.md §6.32.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TODO(decision) — portal_users / portal_sessions / portal_auth_challenges
--
-- The remaining three `rls_enabled_no_policy` tables are NOT addressed here
-- and were not attempted. Every policy in this schema is expressed in terms
-- of `auth_user_role()`, which resolves a `system_role` for an internal staff
-- member from `users.primary_role`, defaulting to `'Client'`. The portal trio
-- is the client-facing authentication surface: its rows belong to portal
-- users who are, by construction, not staff and have no `system_role`. There
-- is no correct way to write `using (...)` for them in the existing
-- vocabulary — a portal session must be scoped to *its own* portal user, which
-- needs an identity claim this schema does not yet have.
--
-- Picking one (a `portal_user_id` GUC? a Supabase Auth JWT claim? service-role
-- only, with all portal traffic through an edge function?) is a genuine unmade
-- design decision with real consequences, so per CLAUDE.md's "never invent a
-- product decision" it is marked rather than guessed.
--
-- They remain fail-closed in the meantime: RLS on with no policy denies every
-- row to `anon` and `authenticated`. The three INFO findings therefore stay on
-- the advisor report on purpose. Logged in PLAN.md §6.32 and §4.
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('evidence_files','evidence_references','crew_documents');

  if n <> 6 then
    raise exception '0049 post-condition failed: expected 6 policies across the three tables, found %', n;
  end if;

  raise notice '0049 OK — 6 policies created across evidence_files, evidence_references, crew_documents';
end $$;
