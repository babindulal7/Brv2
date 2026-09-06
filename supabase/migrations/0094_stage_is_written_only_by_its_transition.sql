-- =============================================================================
-- 0094_stage_is_written_only_by_its_transition.sql — 6 Sep 2026
--
-- **Forward-only stage transitions are bypassable.** `bookings.stage` can be
-- written directly, skipping the transition table, the stage order, and the gates.
--
-- ## Reproduced 6 Sep 2026
--
-- Signed in as `warehouse@babinrentals.com`, against a database carrying live's
-- exact grant shape:
--
--   PATCH /rest/v1/bookings?id=eq.<booking 800>   {"stage": "Returned"}
--   -> HTTP 204
--   stage: Quote -> Returned      three stages skipped
--   booking_stage_transitions:    still 1 row — no record that it happened
--
-- Nothing objected. `validate_booking_gates` guards only the transitions INTO
-- `On Rent` and `Closed`, so a jump to `Returned` passes through untouched, and
-- the booking now sits in a stage it never legally reached. Reset restored it.
--
-- ## Why 0021's control never worked
--
-- `0021` declared `booking_stage_transitions` the sole writer and enforced it with
--
--   revoke update (stage, closed_at) on bookings from authenticated;
--
-- A column-level REVOKE cannot subtract from a table-level GRANT. `authenticated`
-- holds table-level UPDATE on `bookings`, so the column revoke is **inert** —
-- confirmed on live, where `has_column_privilege('authenticated','bookings',
-- 'stage','UPDATE')` is still `true` and the leftover ACL entry reads
-- `authenticated=r/postgres`, i.e. it granted a SELECT and removed no UPDATE.
--
-- This is the same shape as the inert revokes elsewhere in this repo, and it has
-- one root cause: **every signed-in user is the same Postgres role.** The app's
-- role lives in `users.primary_role`, so no GRANT or REVOKE can distinguish
-- Owner from Warehouse. Only a trigger comparing OLD to NEW can.
--
-- ## What this adds
--
-- Two guards on `bookings`, exempt only for `postgres`, `supabase_admin` and
-- `service_role` — an allowlist, so an unforeseen role is guarded rather than
-- trusted:
--
--   * **UPDATE** — `stage` and `closed_at` may change only when the write comes
--     from `apply_booking_stage_transition`. That function is SECURITY DEFINER,
--     so its own UPDATE runs as the definer and passes the `current_user` test,
--     while a PostgREST call runs as `authenticated` and does not. No session
--     variable is involved: the privilege context IS the evidence.
--   * **CANCELLATION** — `cancelled_at`, `cancelled_by` and `cancellation_reason`
--     are equally off-limits to a direct write. Cancelled is the sixth state
--     (`0015`) and lives on `cancelled_at`, so guarding `stage` alone left the
--     door wide open: a Warehouse session cancelled an **On Rent** booking over
--     HTTP and forged the canceller. See the note at that check.
--   * **INSERT** — a new booking must start at `Quote` **and carry no
--     `closed_at`** and no `cancelled_at`. A row inserted straight at `Closed` has no stage history and
--     was never gated; a row inserted with `closed_at` already set is worse still,
--     because `apply_booking_stage_transition` refuses every transition once that
--     column is set and Law 3 forbids deleting the row — a booking that can never
--     move and can never be removed. `create_booking` already defaults to `Quote`
--     with a null `closed_at`; this refuses the direct POST that does not.
--
-- The `closed_at` half of that was NOT in the first draft. An adversarial pass
-- over this file found it, and it reproduced: `POST /bookings` with stage
-- `'Quote'` and `closed_at` set returned **201**, and the resulting booking was
-- permanently frozen. Guarding `stage` alone would have left a worse hole than
-- the one being closed.
--
-- Seeds and migrations are unaffected — they run as `postgres`, which is exempt,
-- which is how `0047` still inserts its corpus at every stage.
--
-- What this does NOT change: who may insert a transition row, and the reversal
-- rules. Those live in `booking_stage_transitions`' own policy and CHECKs. This
-- file only makes that table the sole door, which is what `0021` intended.
-- =============================================================================

begin;

create or replace function reject_direct_booking_stage_write()
returns trigger
language plpgsql
as $$
begin
  /*
   * An ALLOWLIST, deliberately — the first draft wrote this as
   * `current_user not in ('authenticated','anon')`, which exempts by default
   * anything it did not think of. An adversarial pass pointed at `authenticator`,
   * the pooled role PostgREST logs in as before it switches to the JWT's role:
   * under a denylist that role would have been trusted. Nothing reaches this
   * trigger as `authenticator` in practice, but a guard should fail closed on
   * the roles it has not considered, not open.
   *
   * `postgres` covers migrations, the seed, and `apply_booking_stage_transition`
   * — SECURITY DEFINER, owned by postgres, so its UPDATE arrives as the owner.
   * `service_role` is the server-side key used by the Booqable importer
   * (`scripts/import-booqable-direct.mjs`); it never belongs in a browser, and
   * if it leaks, this guard is not the thing that matters.
   */
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.stage is distinct from 'Quote'::booking_stage then
      raise exception
        'A booking is created at Quote and moves by recorded transitions. Refused an INSERT '
        'straight at %, which would leave a booking with no stage history that no gate ever '
        'checked.', NEW.stage;
    end if;
    /*
     * `closed_at` matters as much as `stage`, and guarding only the latter left
     * a worse hole than the one this file closes. Found by an adversarial pass
     * on the first draft and reproduced: POST /bookings with stage 'Quote' and
     * `closed_at` set returns 201, and the row is then FROZEN FOREVER —
     * `apply_booking_stage_transition` refuses every transition once `closed_at`
     * is set ("booking … is Closed; no further stage transition is accepted"),
     * and Law 3 forbids deleting the row. A booking that can never move and can
     * never be removed.
     */
    if NEW.closed_at is not null then
      raise exception
        'A booking is created open. Refused an INSERT carrying closed_at — a booking born closed '
        'can never be moved by any transition and can never be deleted, so it would be stuck '
        'forever. Closing is a transition to Closed, which sets this column itself.';
    end if;
    if NEW.cancelled_at is not null then
      raise exception
        'A booking is created live. Refused an INSERT carrying cancelled_at — cancellation is the '
        'sixth state (0015) and a booking cannot be born in it.';
    end if;
    return NEW;
  end if;

  if NEW.stage is distinct from OLD.stage or NEW.closed_at is distinct from OLD.closed_at then
    raise exception
      'bookings.stage and bookings.closed_at are written only by booking_stage_transitions '
      '(0021). Refused a direct write moving % from % to %. Insert a transition row instead — '
      'that is what validates the stage order, records who did it, and runs the gates.',
      NEW.booking_no, OLD.stage, NEW.stage;
  end if;

  /*
   * Cancellation is the SECOND door to the same room, and the first draft left it
   * open. `0015` makes Cancelled the sixth state, carried on `cancelled_at`
   * rather than in `stage`, and every "is this booking live" predicate in the app
   * and its views reads `stage <> 'Closed' and cancelled_at is null`. So shutting
   * the stage door alone changed nothing about who can take a booking out of
   * service.
   *
   * Found by an adversarial pass over the first draft and reproduced over real
   * HTTP: a Warehouse session PATCHed `cancelled_at` on an **On Rent** booking
   * and got 204 — the gear was with the client — writing `cancelled_by` as the
   * Owner's id, because that column is caller-supplied. No transition row, no
   * gate, no capability check. The same call in reverse un-cancelled it, which
   * Law 3 is supposed to forbid.
   *
   * `cancelled_by` and `cancellation_reason` ride along: leaving them writable
   * would let anyone rewrite who cancelled an existing cancellation.
   *
   * ⚠ For whoever builds `rental.cancel` (`cancelRental.ts` is
   * `implemented: false` today, which is why nothing legitimate breaks here): it
   * must reach these columns the way stage moves do — through a SECURITY DEFINER
   * writer or a recorded transition — not by a direct PATCH from the browser.
   */
  if NEW.cancelled_at        is distinct from OLD.cancelled_at
     or NEW.cancelled_by     is distinct from OLD.cancelled_by
     or NEW.cancellation_reason is distinct from OLD.cancellation_reason then
    raise exception
      'Cancellation is a recorded act, not a column edit. Refused a direct write to %''s '
      'cancelled_at/cancelled_by/cancellation_reason — cancelling takes a booking out of service '
      'exactly as a stage move does, and must be attributable the same way.', NEW.booking_no;
  end if;

  return NEW;
end;
$$;

comment on function reject_direct_booking_stage_write() is
  'Makes booking_stage_transitions the sole writer of bookings.stage/closed_at (0094). '
  '0021 tried to do this with a column REVOKE, which is inert against a table-level GRANT '
  'because every signed-in user is the same Postgres role. Exempt for postgres/service_role.';

drop trigger if exists trg_bookings_stage_write_guard on bookings;
create trigger trg_bookings_stage_write_guard
  before insert or update on bookings
  for each row execute function reject_direct_booking_stage_write();

-- -----------------------------------------------------------------------------
-- Post-conditions — the door is shut AND the legitimate path still opens it.
-- A guard that only proved the first half would be indistinguishable from one
-- that breaks the application.
-- -----------------------------------------------------------------------------
do $$
declare
  v_id      uuid;
  v_no      text;
  v_stage   booking_stage;
  v_actor   uuid;
  v_branch  uuid;
  v_blocked boolean := false;
  v_err     text;
begin
  select id, booking_no, stage, branch_id into v_id, v_no, v_stage, v_branch
  from bookings where stage = 'Quote' limit 1;
  select id into v_actor from users where primary_role = 'Owner' limit 1;

  if v_id is null or v_actor is null then
    raise notice '0094: no Quote booking or no Owner here; behavioural checks skipped.';
    return;
  end if;

  -- (1) postgres must still be able to write, or the seed breaks.
  update bookings set stage = 'Quote' where id = v_id;

  -- (2) a browser session must be REFUSED, and by THIS guard.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_actor::text, true);
    update bookings set stage = 'Returned' where id = v_id;
  exception when others then
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a direct stage write was accepted.';
  end if;
  if position('booking_stage_transitions' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED: refused, but not by this guard. Postgres said: %', v_err;
  end if;
  if (select stage from bookings where id = v_id) <> 'Quote' then
    raise exception 'POST-CONDITION FAILED: the refused write still moved the stage.';
  end if;

  -- (2b) an INSERT carrying closed_at must be refused — a booking born closed is
  --      unmovable and undeletable.
  v_blocked := false;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_actor::text, true);
    insert into bookings (client_uuid, booking_no, branch_id, client_id, stage, closed_at,
                          delivery_type, pickup_at, return_at, created_by, updated_by)
    values (gen_random_uuid(), '9999001', v_branch,
            (select client_id from bookings where id = v_id), 'Quote', now(),
            'Customer Pickup', now() + interval '1 day', now() + interval '3 days', v_actor, v_actor);
  exception when others then
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a booking was created carrying closed_at.';
  end if;
  if position('born closed' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED: the INSERT was refused, but not by this guard. Postgres said: %', v_err;
  end if;

  -- (3) the LEGITIMATE path must still work: a transition row moves the stage.
  insert into booking_stage_transitions
    (client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source)
  values
    (gen_random_uuid(), v_id, v_branch, 'Quote', 'Booked', now(), v_actor, 'Owner', 'system');

  if (select stage from bookings where id = v_id) <> 'Booked' then
    raise exception
      'POST-CONDITION FAILED: the transition row did not move the stage — this guard has '
      'broken the only legitimate path.';
  end if;

  raise notice '0094 verified: direct stage writes refused, the transition path still moves the stage.';

  raise exception 'ROLLBACK_0094_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0094_PROBE' then
      raise notice '0094 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;
