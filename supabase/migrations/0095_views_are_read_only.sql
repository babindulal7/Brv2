-- =============================================================================
-- 0095_views_are_read_only.sql — 6 Sep 2026
--
-- **Every masking view accepts INSERT, UPDATE and DELETE from the two roles a
-- browser can be, and runs them as the view's owner — past RLS and past Law 3.**
--
-- ## What was wrong
--
-- The `_v` views exist so a money-blind role can read a booking or a product
-- without holding a column grant on the base table: the view is DEFINER-rights
-- (0019, 0048, 0065, 0077, 0078), its body re-applies `auth_can_view_money()`
-- per column and a row predicate per role, and the base table's SELECT is
-- revoked at table level and handed back column by column (0062, 0077). That
-- design reasoned about SELECT only.
--
-- Postgres makes a simple single-table view auto-updatable, and the platform
-- default ACL grants `anon` and `authenticated` full DML on every new relation,
-- views included. So `POST /rest/v1/clients_v`, `PATCH /rest/v1/products_v`
-- and `DELETE /rest/v1/clients_v` were all reachable, and each was rewritten
-- onto the base table with the privileges of the view's OWNER — `postgres`,
-- which bypasses RLS. No policy was consulted (the views carry no CHECK
-- OPTION, so even their own `where auth_is_staff()` never applied to a write),
-- and 18 of the 23 backed tables have no `reject_delete_nothing_is_deleted`
-- backstop, so Law 3 did not catch the DELETE either.
--
-- `0093_state_the_grants.sql` then restated the hole rather than closing it:
-- `grant insert on all tables in schema public` and `grant update on all
-- tables …` include views (that is what "all tables" means to Postgres), while
-- its own header says "views: SELECT for all three".
--
-- ## Reproduced how — catalogue, read-only, 6 Sep 2026
--
-- Live project (`sxguwvgoserhdolewibb`), before any of 0079–0094 reached it:
--
--   public views                                        26
--   has_table_privilege('anon',          view, 'INSERT')  true for 26 / 26
--   has_table_privilege('authenticated', view, 'UPDATE')  true for 26 / 26
--   has_table_privilege('authenticated', view, 'DELETE')  true for 26 / 26
--   information_schema.views.is_updatable = YES           24 / 26
--   pg_default_acl (postgres, public, relations)          anon = arwdDxtm
--   base tables with anon INSERT / UPDATE / DELETE        123 / 103 / 10  of 124
--
-- The local stack shows the identical view shape (26 / 26 / 26). The write
-- itself was not exercised against live (read-only mandate); the behavioural
-- post-conditions at the foot of this file exercise it in every rebuild, and
-- `check:rebuild` refuses a database in which any view is still writable.
-- Filed as REMEDIATION_AUDIT_2026-09-05 SEC-01 (P0), refuter-confirmed.
--
-- ## What this adds
--
--   1. Every view in `public` loses INSERT, UPDATE, DELETE and TRUNCATE for
--      `anon`, `authenticated` and PUBLIC. SELECT is untouched — exactly the
--      shape 0093's header states and its body did not deliver. Nothing in
--      `src/` writes a view: every `.from('<x>_v')` is a select (grep at HEAD,
--      with `.from('products_v')` reads as the positive control).
--
--   2. `anon` loses INSERT, UPDATE, DELETE and TRUNCATE on every base table,
--      and on every relation the platform will create later (default
--      privileges for `postgres` in `public`). 0093 kept anon's writes "as live
--      has them" and named narrowing a separate decision. Assessed for this
--      file — every path that runs BEFORE sign-in, `src/` and
--      `supabase/functions` grepped for `.from(`, `.rpc(`, `signIn`,
--      `resetPasswordForEmail`, `updateUser`, `verify_staff_pin`,
--      `portal_link_requests`:
--
--        sign-in            lib/auth.tsx:314  supabase.auth.signInWithPassword     GoTrue, not PostgREST
--        forgot password    lib/auth.tsx:363  supabase.auth.resetPasswordForEmail  GoTrue
--        set new password   lib/auth.tsx:389  supabase.auth.updateUser             GoTrue, recovery session
--        staff PIN          lib/auth.tsx:425-524  rpc set_staff_pin / verify_staff_pin /
--                                                 staff_pin_status / revoke_own_staff_pin
--                                                 SECURITY DEFINER, EXECUTE to authenticated only (0066)
--        reset request      queries/staff.ts:209  rpc record_password_reset_request
--                                                 SECURITY DEFINER, Owner only, authenticated only (0068)
--        portal self-claim  portal_claim_by_verified_email()  SECURITY DEFINER, authenticated only (0072);
--                                                 refuses when auth.uid() is null; no caller in src/ yet
--        booqable-webhook   functions/booqable-webhook/index.ts  service-role client, writes sync_inbox
--        booqable-proxy     functions/booqable-proxy/index.ts    service-role client
--
--      Not one pre-auth path issues base-table DML as `anon`. On live, the only
--      write policies whose predicate does not reference an auth_* function are
--      `audit_events_insert (true)` — the SEC-02 forgery, closed for anon by
--      0091 — and `timesheets_insert`, which needs `app.current_user_id`, which
--      `set_request_context` derives from `auth.uid()` and anon never has. So
--      RLS already refused every anon write except the audit forgery; this
--      section makes that a GRANT fact that the next `with check (true)` policy
--      cannot silently undo. Engineering posture, not a product decision;
--      recorded in PLAN.md §4.48 with this derivation.
--
--   3. Post-conditions that RAISE: the catalogue in both directions (no view
--      writable, every view still readable; no table writable by anon, anon
--      still reads, authenticated still writes), the default ACL, and then the
--      behaviour under `set local role` — an anonymous INSERT into `clients_v`
--      and into `clients` refused with 42501 *permission denied* (not merely
--      refused: an RLS refusal is also 42501, so the message is asserted), a
--      Warehouse UPDATE of `products_v` and an Owner DELETE from `clients_v`
--      refused the same way, and the read side unchanged — the Owner still
--      sees `daily_rate` through `products_v`, the Warehouse user still gets
--      rows with `daily_rate` NULL.
--
-- ## Why the views stay DEFINER-rights
--
-- `security_invoker` is the textbook fix and it is wrong here. The mask works
-- because the view reads the base table with the OWNER's privileges; the
-- caller's own column grants on `products` / `bookings` / … were deliberately
-- revoked by 0062 and 0077. An invoker view would re-apply those revoked
-- grants inside the view body and the read would die for every role, Owner
-- included — that is 0061's bug, which 0065 had to repair on
-- `bookings_deposit_v`, and 0077/0078 assert it can never recur. Read side
-- untouched; only the write verbs are taken away.
--
-- ## Future views — an obligation, and a gate
--
-- Default privileges cannot single out views from tables, and `authenticated`
-- legitimately needs INSERT/UPDATE on future base tables, so a view created by
-- a LATER migration will again be born writable by `authenticated`. Two
-- controls: (a) any migration that creates a view must revoke its DML in the
-- same file — same convention as "revoke and view ship together" (0019/0035/
-- 0036/0077); (b) `scripts/check-rebuild.mjs` now asserts, after every rebuild,
-- that no public view grants INSERT/UPDATE/DELETE to anon or authenticated and
-- that anon holds no DML on any table. For `anon` the default ACL is corrected
-- here, so future relations are born read-only to it.
--
-- ## What this does NOT change
--
--   * SELECT on views and tables, for both roles, exactly as 0093 leaves it.
--     `anon`'s SELECT on the definer views is wider than any path needs
--     (each view's row predicate resolves anon to `Client` and returns no
--     rows); narrowing it is a separate decision, noted in PLAN.md §4.48.
--   * `authenticated`'s table DML — the 0093 shape, with Law 3/4/6 intact.
--   * Sequence and function grants (0093 §1, §3).
--   * The 18 backed tables without a Law 3 delete backstop. That is SEC-01
--     Option B's third file and is not written here.
--
-- ⚠ ORDER. This file must run AFTER 0093, and after any re-run of 0093: 0093's
-- blanket grants re-open both holes, so its "safe to re-run" claim now holds
-- for the pair (0093 then 0095), not for 0093 alone. Filename order gives that
-- in a rebuild and on `db push`; a hand re-run of 0093 must be followed by this
-- file. This file is itself convergent — every statement is a revoke.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Views are read-only. There is no ALL VIEWS IN SCHEMA, so loop the
--     catalogue. `relkind = 'v'` is a plain view; materialized views cannot
--     take DML and there are none here.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname
  loop
    execute format(
      'revoke insert, update, delete, truncate on %I.%I from anon, authenticated, public',
      r.nspname, r.relname
    );
    v_n := v_n + 1;
  end loop;
  raise notice '0095: DML revoked on % public view(s).', v_n;
end $$;

-- -----------------------------------------------------------------------------
-- 2 · anon holds no DML on any relation — now, and on relations created later.
--     `all tables in schema` includes the views, which is harmless here: §1
--     already took them, and this makes §2 true on its own.
-- -----------------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon;

-- -----------------------------------------------------------------------------
-- 3 · Post-conditions — the catalogue, in both directions.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad   text[] := '{}';
  r       record;
  v_n     integer;
  v_views integer := 0;
begin
  -- (a) every public view: no DML for anon/authenticated; SELECT still there.
  for r in
    select c.oid, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname
  loop
    v_views := v_views + 1;
    if has_table_privilege('anon', r.oid, 'INSERT')
       or has_table_privilege('anon', r.oid, 'UPDATE')
       or has_table_privilege('anon', r.oid, 'DELETE')
       or has_table_privilege('anon', r.oid, 'TRUNCATE') then
      v_bad := v_bad || format('anon can write %s', r.relname)::text;
    end if;
    if has_table_privilege('authenticated', r.oid, 'INSERT')
       or has_table_privilege('authenticated', r.oid, 'UPDATE')
       or has_table_privilege('authenticated', r.oid, 'DELETE')
       or has_table_privilege('authenticated', r.oid, 'TRUNCATE') then
      v_bad := v_bad || format('authenticated can write %s', r.relname)::text;
    end if;
    if not has_table_privilege('authenticated', r.oid, 'SELECT') then
      v_bad := v_bad || format('authenticated can no longer SELECT %s', r.relname)::text;
    end if;
    if not has_table_privilege('anon', r.oid, 'SELECT') then
      v_bad := v_bad || format('anon can no longer SELECT %s (0093 shape changed)', r.relname)::text;
    end if;
  end loop;
  if v_views = 0 then
    v_bad := v_bad || 'no public views found — the loop asserted nothing'::text;
  end if;

  -- (b) every base table: anon holds no DML.
  for r in
    select c.oid, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    if has_table_privilege('anon', r.oid, 'INSERT')
       or has_table_privilege('anon', r.oid, 'UPDATE')
       or has_table_privilege('anon', r.oid, 'DELETE')
       or has_table_privilege('anon', r.oid, 'TRUNCATE') then
      v_bad := v_bad || format('anon can write table %s', r.relname)::text;
    end if;
  end loop;

  -- (c) …and nothing else moved: anon still reads, authenticated still writes,
  --     0091 and Law 3/4 as 0093 asserted them.
  if not has_table_privilege('anon', 'public.clients', 'SELECT') then
    v_bad := v_bad || 'anon lost SELECT on clients (this file must not touch SELECT)'::text;
  end if;
  if has_table_privilege('anon', 'public.staff_auth_pins', 'SELECT') then
    v_bad := v_bad || 'anon can SELECT staff_auth_pins (0066/0093 undone)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.clients', 'INSERT')
     or not has_table_privilege('authenticated', 'public.clients', 'UPDATE') then
    v_bad := v_bad || 'authenticated lost INSERT/UPDATE on clients (this file must not touch authenticated table DML)'::text;
  end if;
  if has_table_privilege('authenticated', 'public.clients', 'DELETE') then
    v_bad := v_bad || 'authenticated can DELETE clients (Law 3)'::text;
  end if;
  if has_table_privilege('authenticated', 'public.payments', 'UPDATE') then
    v_bad := v_bad || 'authenticated can UPDATE payments (Law 4)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.audit_events', 'INSERT') then
    v_bad := v_bad || 'authenticated cannot INSERT audit_events (0091 shape changed)'::text;
  end if;

  -- (d) the default ACL: a relation created later is born read-only to anon.
  select count(*) into v_n
  from pg_default_acl d, aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole
    and d.defaclnamespace = 'public'::regnamespace
    and d.defaclobjtype = 'r'
    and a.grantee = 'anon'::regrole::oid
    and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_n > 0 then
    v_bad := v_bad || format('default privileges still grant anon %s DML privilege(s) on new relations', v_n)::text;
  end if;

  if array_length(v_bad, 1) is not null then
    raise exception 'POST-CONDITION FAILED (0095): %', array_to_string(v_bad, '; ');
  end if;

  raise notice '0095 verified (catalogue): % views read-only for anon/authenticated, anon holds no table DML, default ACL corrected, 0093 shape otherwise intact.', v_views;
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Post-conditions — the behaviour. A refused write must be refused for THIS
--     reason: an RLS denial is also SQLSTATE 42501, so the message is asserted
--     ("permission denied for view …"), and the read side is proven unchanged
--     from both sides of the mask. The whole block rolls back at the end so a
--     probe that unexpectedly succeeds leaves nothing behind (0094's pattern).
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner    uuid;
  v_wh       uuid;
  v_product  uuid;
  v_client   uuid;
  v_rows     bigint;
  v_priced   bigint;
  v_blocked  boolean;
  v_state    text;
  v_err      text;
begin
  select id into v_owner from users where primary_role = 'Owner' limit 1;
  select id into v_wh from users where primary_role = 'Warehouse' limit 1;
  select id into v_product from products where daily_rate is not null limit 1;
  select id into v_client from clients limit 1;

  if v_owner is null or v_wh is null or v_product is null or v_client is null then
    raise notice '0095: no Owner / Warehouse user, priced product or client here; behavioural checks skipped (catalogue checks above still hold).';
    return;
  end if;

  -- (1) anon: INSERT into a view — refused by the grant, not by a policy.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role anon;
    insert into clients_v (id) values (gen_random_uuid());
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): anon inserted through clients_v.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the anon INSERT into clients_v was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (2) anon: INSERT into a base table — the §2 half.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role anon;
    insert into clients (client_uuid, name) values (gen_random_uuid(), '0095 probe');
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): anon inserted into clients.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the anon INSERT into clients was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (3) a Warehouse session: UPDATE through products_v — refused by the grant.
  --     Without this file the write ran as the view owner and landed.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update products_v set total_quantity = 0 where id = v_product;
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): a Warehouse session updated products_v.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the UPDATE of products_v was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (4) an Owner session: DELETE through clients_v — refused by the grant.
  --     `clients` has no Law 3 backstop trigger, so before this file the row
  --     would simply have gone.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_owner::text, true);
    delete from clients_v where id = v_client;
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): an Owner session deleted through clients_v.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the DELETE from clients_v was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (5) the read side is untouched — Owner sees money through the view …
  set local role authenticated;
  perform set_config('app.current_user_id', v_owner::text, true);
  select count(*), count(daily_rate) into v_rows, v_priced from products_v;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if v_rows = 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v returns no rows to the Owner — the read path is broken.';
  end if;
  if v_priced = 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v hides daily_rate from the Owner — the mask fires for a money-visible role.';
  end if;

  -- (6) … and the Warehouse user still gets the rows with the money masked.
  set local role authenticated;
  perform set_config('app.current_user_id', v_wh::text, true);
  select count(*), count(daily_rate) into v_rows, v_priced from products_v;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if v_rows = 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v returns no rows to the Warehouse user — a definer view must still serve the floor.';
  end if;
  if v_priced <> 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v shows daily_rate to the Warehouse user (Law 6).';
  end if;

  raise notice '0095 verified (behaviour): anon INSERT via clients_v and into clients refused 42501/permission denied; Warehouse UPDATE via products_v and Owner DELETE via clients_v refused the same way; Owner reads % priced rows through products_v, Warehouse reads % rows with the rate masked.', v_rows, v_rows;

  raise exception 'ROLLBACK_0095_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0095_PROBE' then
      raise notice '0095 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;
