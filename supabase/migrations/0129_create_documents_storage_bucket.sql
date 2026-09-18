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
