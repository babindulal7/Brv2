-- =============================================================================
-- 0152_harden_storage_policies_revoke_anon.sql — Item 11 Audit Hardening
--
-- Closes the critical vulnerability introduced in 0133:
-- 0133 granted anon SELECT, INSERT, UPDATE, and DELETE on storage.objects for
-- 'documents' and 'evidence'. This allowed unauthenticated users to inspect,
-- upload, overwrite, or delete client contracts, PAN cards, damage photos,
-- and signed invoices.
--
-- This migration drops the insecure policies and replaces them with strict,
-- authenticated-only policies. Document deletion is restricted to Managers and
-- Owners (Law 3).
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    -- Drop insecure 0133 policies that granted access to anon
    drop policy if exists "documents_evidence_select_policy" on storage.objects;
    drop policy if exists "documents_evidence_insert_policy" on storage.objects;
    drop policy if exists "documents_evidence_update_policy" on storage.objects;
    drop policy if exists "documents_evidence_delete_policy" on storage.objects;

    -- SELECT: authenticated users only (Staff & Client portal viewing their docs)
    create policy "documents_evidence_select_policy"
      on storage.objects for select
      to authenticated
      using (bucket_id in ('documents', 'evidence'));

    -- INSERT: authenticated users only
    create policy "documents_evidence_insert_policy"
      on storage.objects for insert
      to authenticated
      with check (bucket_id in ('documents', 'evidence'));

    -- UPDATE: authenticated users only
    create policy "documents_evidence_update_policy"
      on storage.objects for update
      to authenticated
      using (bucket_id in ('documents', 'evidence'));

    -- DELETE: Manager or Owner only (Law 3: staff cannot delete commercial documents)
    create policy "documents_evidence_delete_policy"
      on storage.objects for delete
      to authenticated
      using (bucket_id in ('documents', 'evidence') and auth_is_manager_or_above());
  end if;
end $$;
