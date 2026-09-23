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

## 3. Applying Migrations (0130, 0131, 0132)

After taking a safe production backup, apply the verified local migrations to the live production database:

```powershell
# You must have the Supabase CLI installed and logged in
supabase db push
```

*Note: Migration `0129_create_documents_storage_bucket.sql` was safely renamed to `0133_create_documents_storage_bucket.sql` to resolve the duplicate prefix collision that would have blocked `supabase db push`.*
