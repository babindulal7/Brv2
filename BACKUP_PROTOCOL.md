# Database Backup Protocol

As requested, we are using the native PostgreSQL tooling (`pg_dump` and `pg_restore`) to avoid introducing Docker to the production backup workflow.

## 1. Taking a Production Backup

To take a complete backup of your production Supabase database:

1. Obtain your production Supabase Database URL (Connection String) from the Supabase Dashboard:
   - Go to **Project Settings** > **Database**
   - Scroll down to **Connection String** > **URI**
   - It will look like: `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

2. Run the provided script from the project root:
   ```powershell
   .\scripts\backup-db.ps1 -DbUrl "your-connection-string"
   ```

   This will execute `pg_dump --clean --if-exists --quote-all-identifiers` and produce a `.sql` file with a timestamp in the current directory.

## 2. Restoring a Backup (Disaster Recovery)

If you need to restore the database to a fresh Supabase project or roll back data:

```powershell
# CAUTION: This will overwrite the target database
psql "your-target-db-connection-string" -f "production_backup_YYYYMMDD_HHmmss.sql"
```

Because the backup uses `--clean`, it will drop existing tables before recreating them, ensuring the restore is idempotent.

## 3. Applying Migrations

After taking a safe production backup, apply the verified local migrations to the live production database:

## 3. Applying Migrations — ⚠ CORRECTED 3 Oct 2026

**Do not run `supabase db push`.** This section previously said to, and it was wrong
three ways over. The correction below is based on
[`docs/live/APPLY_PLAN_2026-10-03.md`](docs/live/APPLY_PLAN_2026-10-03.md), which
has the measurements.

1. **The range was wrong.** It said `0130, 0131, 0132`. Measured against the 8 Sep
   export, **66** migrations are pending — live tops out at `0089`. `0125` depends
   on much of the earlier range, so the old instruction would not have applied
   cleanly; it would have failed partway.

2. **`db push` is not the right command for this repo.** `scripts/apply-migrations-local.mjs`
   exists because the CLI does not recognise these filenames: it only handles
   `<14-digit-timestamp>_name.sql`, while this repo's files are `0001_enums.sql` …
   `0148_view_anon_leak_closure.sql`, and the numbering is load-bearing (`0055`
   states an apply-order dependency; `0057`–`0060` were renumbered on 15 Aug so
   filename order equals the order that built production; code comments, `PLAN.md`
   and `check-db.sql` cite these numbers by name). *(The CLI is not installed on
   the machine this was written on, so this rests on that script's documented
   rationale rather than a reproduction.)*

3. **`db push` would re-run five already-applied migrations and insert a seed
   corpus into production.** `supabase_migrations.schema_migrations` keys on `name`,
   so the five renames in the plan document look unapplied and would run again. It
   would also apply `0047_seed_reference_corpus.sql`, a one-shot seed whose own
   header says *"Apply it ONCE, into a database that has never held it."*

### Procedure

```bash
# 1. Re-export live state (the plan's input; the bundled one is 25 days old).
#    Print the query:  npm run db:plan -- --sql
#    Run it in the SQL editor, paste to docs/live/schema_migrations_<today>.txt

# 2. Generate the plan and READ THE BLOCKERS. It exits 2 while any remain.
npm run db:plan

# 3. Resolve the three open questions in the plan document:
#    - the 5 renames (confirm each, do not rename local files)
#    - 0047 the one-shot seed
#    - the 2 unexplained live rows

# 4. Only then: apply in filename order, one file per transaction, stopping at the
#    first failure. The chain does not resume on its own.
```

The backup in §1 is still required first, and still the reason the rest is safe to
attempt.

*Historic note: `0129_create_documents_storage_bucket.sql` was renamed to
`0133_create_documents_storage_bucket.sql` to resolve a duplicate prefix collision.*
