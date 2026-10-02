-- Keep registry reads within the Documents permissions matrix. A restrictive
-- SELECT policy also constrains the older permissive FOR ALL write policy.
create policy document_registry_role_read_scope on public.document_registry
  as restrictive for select to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
    or (
      auth_user_role() = 'Technician'
      and document_type not in ('Quotation', 'Tax Invoice', 'Receipt', 'Credit Note', 'Debit Note')
    )
    or (
      auth_user_role() = 'Warehouse'
      and document_type in ('Rental Agreement', 'Packing List', 'Delivery Note')
    )
  );

comment on policy document_registry_role_read_scope on public.document_registry is
  'Documents matrix and Law 6: finance-capable staff read all types; Technician reads operational types; Warehouse reads agreement, packing list and delivery note only; Driver is excluded.';
