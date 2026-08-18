# Running Babin Rentals OS against a local database

**Written 16 Aug 2026.** How to develop without touching the live Supabase project, and what
each option does and does not give you.

**The live project (`sxguwvgoserhdolewibb`) is untouched by any of this.** It keeps its 121
bookings, 76 clients and 2,102 audit events, and `npm run dev` still points at it. Switching
is a matter of which npm script you run — nothing is disconnected, deleted or paused.

---

## 1 · Three ways to run without the cloud, and why only one is a database

| | `npm run dev:mock` | **`npm run dev:local`** | Plain local Postgres |
|---|---|---|---|
| Install needed | none | Docker + Supabase CLI | Postgres |
| RLS enforced | ❌ | ✅ | ✅ |
| Auth / GoTrue | fake, any password | ✅ real | ❌ |
| PostgREST | fake | ✅ real | ❌ — every `supabase-js` call breaks |
| Triggers, CHECKs, constraints | ❌ | ✅ | ✅ |
| Realistic failure modes | ❌ | ✅ | partial |

**`dev:local` is the only one where the database still enforces the laws.** `PLAN.md` §0 makes
RLS the security boundary — *"Warehouse sees no money — enforced by RLS, not the UI"* — so a
setup without RLS is not a smaller version of production, it is a different system that cannot
reproduce the class of bug this project keeps finding.

**The mock source is genuinely useful** for driving screens offline, and it already exists. It
is a UI fixture, not a database: it will happily let a Warehouse session read money, because
there is nothing there to stop it.

---

## 2 · Prerequisites

- **Docker Desktop** — installed 16 Aug 2026 (4.86.0) via `winget install Docker.DockerDesktop`.
- **WSL2** — Docker Desktop's engine on Windows. ⚠ See §6: this machine had the *legacy inbox*
  WSL, which Docker cannot use.
- **Supabase CLI** — installed as a devDependency, so `npx supabase` works with no global
  install and the version is pinned in `package.json`.

---

## 3 · First run

```bash
npx supabase init      # writes supabase/config.toml — once only
npm run db:start       # pulls images and starts the stack (slow the first time)
npm run db:apply       # applies all migrations in order
npm run dev:local      # the app, pointed at the local stack
```

`db:start` prints the ports and keys it minted. If they differ from `.env.localdb.local`,
**believe the CLI**, not the file — something else is holding the default ports.

---

## 4 · Why migrations are applied by a script and not `supabase db reset`

The CLI only recognises migrations named `<14-digit-timestamp>_name.sql`. This repo's are
`0001_enums.sql` … `0062_…`, and **that numbering is load-bearing**:

- `0055`'s header states an apply-order dependency on `0047`.
- `0057`–`0060` were renumbered on 15 Aug specifically so filename order equals the order that
  built production.
- Code comments across `src/` cite migrations by number.

Renaming 63 files to satisfy the CLI would throw all of that away for nothing. So
`scripts/apply-migrations-local.mjs` applies them in filename order through `psql` inside the
stack's own container.

It **refuses to run against anything but the local container** — no flag, env var or argument
can point it at a remote project. That is the point of it.

Two behaviours worth knowing:

- **`0062` is skipped by default.** It is written and deliberately unapplied (`PLAN.md` §4.28):
  it revokes table-level SELECT and breaks base-table money reads until every call site has
  moved. Locally you often want to test exactly that — pass `--include-held-back`.
- **`0047` IS applied locally, and is the seed corpus.** On the live project it is held back by
  `CLAUDE.md`'s rule about production; locally that objection does not exist, and it is what it
  was written for — data generated through the real engines rather than hand-typed.

---

## 5 · What the local database will and will not contain

**Will:** the full schema — 121 tables, RLS on all of them, the triggers and CHECKs — plus
`0047`'s generated corpus.

**Will not:** the live project's actual rows. Those went in **outside the migration table**
(`PLAN.md` §4.33(3)), so no replay of `supabase/migrations/` reproduces them. That is a real
gap in the repo, not a limitation of this setup, and copying them down would put 76 real
clients' names, phones and emails on a laptop — worth a deliberate decision, not a default.

One half of §4.33(3) is now closed: `0056_auth_role_falls_back_to_auth_uid` was applied to
production with **no source file**, and its SQL has been recovered out of
`schema_migrations.statements` into `0056_0_auth_role_falls_back_to_auth_uid.sql`. It is
superseded sixty seconds later by `0056_auth_role_resolves_without_pre_request_hook.sql`, so a
rebuild does not need it — but the repo is no longer missing a migration it cannot explain.

---

## 6 · ⚠ The WSL problem on this machine

`docker info` hung and Docker Desktop reported:

```
DockerDesktop/Wsl/ExecError: wsl.exe --version: exit status 1
```

**Diagnosis:** `wsl.exe --version` is not a valid argument on this install. Its usage banner
lists only `--install`, `--list`, `--status`, `--help` — that is the **legacy inbox WSL**
shipped as a Windows optional feature. Modern WSL2 (the Store/MSI package) adds `--version`,
`--update` and `--shutdown`, and Docker Desktop requires it.

**What was already correct** (checked, not assumed) — Windows 10 Home build 19045, with
`Microsoft-Windows-Subsystem-Linux` **Enabled** and `VirtualMachinePlatform` **Enabled**. Both
prerequisites were on; only the modern WSL package was missing.

**The fix, applied 16 Aug 2026, in two steps.** The second was not obvious and cost a wrong
call in between — recorded so nobody repeats it.

1. `winget install --id Microsoft.WSL` → **WSL 2.7.11 installed.** After this
   `wsl --version` prints a proper version block (2.7.11.0, kernel 6.18.33.2-2).
2. **That is not sufficient, and `wsl --version` succeeding does not mean WSL works.** Docker
   still failed, and `wsl --list --verbose` gave the real reason:

   ```
   WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED
   This application requires the Windows Subsystem for Linux Optional Component.
   Install it by running: wsl.exe --install --no-distribution
   ```

   Note `Get-WindowsOptionalFeature` had reported `Microsoft-Windows-Subsystem-Linux` as
   **Enabled** all along — it was enabled for the *legacy inbox* WSL, and the Store package
   needs its own registration. Running `wsl.exe --install --no-distribution` drove DISM to
   completion:

   ```
   Installing Windows optional component: Microsoft-Windows-Subsystem-Linux
   The requested operation is successful.
   Changes will not be effective until the system is rebooted.
   ```

**⚠ A REBOOT IS REQUIRED and has not happened.** DISM says so directly. Until then Docker
Desktop reports *"Docker Desktop is unable to start"* and `supabase start` cannot run.
Everything else is installed, configured and dry-run verified.

**Lesson worth keeping:** `wsl --version` answering is a test of the *tool*, not of the
*subsystem*. The command that actually tells you WSL can run is `wsl --list --verbose`.

### After the reboot — the whole path, in order

```bash
wsl --version          # should now PRINT a version block, not a usage banner
npx supabase init      # writes supabase/config.toml (once)
npm run db:start       # first run pulls several images; slow
npm run db:apply       # all migrations, in order, 0062 skipped by design
npm run dev:local
```

If `wsl --version` still shows the usage banner after rebooting, WSL2 did not take, and the
local stack is not reachable on this machine. `npm run dev:mock` and the live project both
remain available — neither needs Docker.

---

## 7 · Switching back

Nothing to undo. `npm run dev` reads `.env.local`, which still holds the live URL and anon key
and was never modified. `npm run db:stop` stops the containers; the local data survives until
`supabase db reset`.
