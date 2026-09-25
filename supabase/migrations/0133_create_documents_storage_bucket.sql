-- =============================================================================
-- 0129_create_documents_storage_bucket.sql — AUD-010 (P2)
--
-- Seed Storage Buckets:
-- Ensures the private 'documents' and 'evidence' storage buckets exist
-- in storage.buckets for commercial PDFs, invoices, agreements, and media.
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name)
    values ('documents', 'documents'), ('evidence', 'evidence')
    on conflict (id) do nothing;
  end if;
end $$;

-- Enable RLS on storage.objects
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    alter table storage.objects enable row level security;

    -- SELECT policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_select_policy'
    ) then
      create policy "documents_evidence_select_policy"
        on storage.objects for select
        to authenticated, anon
        using (bucket_id in ('documents', 'evidence'));
    end if;

    -- INSERT policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_insert_policy'
    ) then
      create policy "documents_evidence_insert_policy"
        on storage.objects for insert
        to authenticated, anon
        with check (bucket_id in ('documents', 'evidence'));
    end if;

    -- UPDATE policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_update_policy'
    ) then
      create policy "documents_evidence_update_policy"
        on storage.objects for update
        to authenticated, anon
        using (bucket_id in ('documents', 'evidence'));
    end if;

    -- DELETE policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_delete_policy'
    ) then
      create policy "documents_evidence_delete_policy"
        on storage.objects for delete
        to authenticated, anon
        using (bucket_id in ('documents', 'evidence'));
    end if;
  end if;
end $$;
