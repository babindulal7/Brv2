-- RULING 2026-10-06: editor RPC fixes found by the new lifecycle steps L25-L28 (R-35).
-- 1. Removing a client's primary contact wrote status 'Inactive', which client_status does not have
--    (it is 'Active'|'Deactivated'), so any edit that removed or replaced the contact failed 22P02.
-- 2. Warehouse may CREATE a client (canCreateClient / clients_insert) but not edit one: parity, not widening.
-- 3. save_record_editor reads back through a private, ungated snapshot (it has already authorised the caller);
--    the public read_record_editor keeps its original role gate, so Warehouse gains no read access.
-- 4. update_bundle: the atomic backing for updateBundle.
-- 5. A duplicate phone surfaces as a plain-language refusal instead of a constraint name.
-- Supersedes the 0146 body of save_record_editor. WRITTEN locally; never apply from an agent session (N-5).
begin;
create or replace function record_editor_private.read_snapshot(p_kind text,p_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare parent jsonb; children jsonb; allowed text[]; identity uuid; code text; snapshot jsonb;
begin
  allowed:=record_editor_private.fields(p_kind);
  if allowed is null then raise exception 'Unknown record kind'; end if;
  if p_kind='client' then
    select to_jsonb(c),c.id,c.client_code into parent,identity,code from clients c where c.id::text=p_id or c.client_code=p_id;
    select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(c),array['id','full_name','designation','phone','email']) order by c.id),'[]') into children from client_contacts c where c.client_id=identity and c.is_primary and c.status='Active';
  elsif p_kind='equipment' then
    select to_jsonb(p),p.id,p.asset_code into parent,identity,code from products p where p.id::text=p_id or p.asset_code=p_id;
    allowed:=allowed||array['tracking_mode','total_quantity'];
    select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(u),array['id','asset_tag','serial_no','warehouse_id','rack','shelf','bin','condition','status']) order by u.id),'[]') into children from product_units u where u.product_id=identity;
  else
    select to_jsonb(b),b.id,b.bundle_code into parent,identity,code from bundles b where b.id::text=p_id or b.bundle_code=p_id;
    select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(i),array['id','product_id','quantity','days','is_mandatory','sort_order'])||jsonb_build_object('name',p.name) order by i.sort_order,i.id),'[]') into children from bundle_items i join products p on p.id=i.product_id where i.bundle_id=identity and i.is_active;
  end if;
  if parent is null then raise exception 'Record not found.'; end if;
  snapshot:=jsonb_build_object('id',identity,'code',code,'values',record_editor_private.pick(parent,allowed),'rows',children);
  return snapshot||jsonb_build_object('revision',md5((snapshot||jsonb_build_object('updated_at',parent->'updated_at'))::text));
end; $$;

create or replace function read_record_editor(p_kind text,p_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text=any(case when p_kind='client' then array['Owner','Admin','Manager','Coordinator'] else array['Owner','Admin','Manager'] end),false) then raise exception 'Permission denied for this record.' using errcode='42501'; end if;
  return record_editor_private.read_snapshot(p_kind,p_id);
end; $$;

create or replace function save_record_editor(p_kind text,p_id uuid,p_revision text,p_key uuid,p_values jsonb,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tab text; child_tab text; fk text; allowed text[]; child_allowed text[]; identity uuid:=p_id; row_data jsonb; patch jsonb; child_id uuid; existing jsonb; response jsonb; request jsonb; saved record; kept uuid[]:='{}'; warehouse_branch uuid; generated_code text; current_snapshot jsonb; serial_count int:=0;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text=any(case when p_kind='client' then (case when p_id is null then array['Owner','Admin','Manager','Coordinator','Warehouse'] else array['Owner','Admin','Manager','Coordinator'] end) else array['Owner','Admin','Manager'] end),false) then raise exception 'Permission denied for this record.' using errcode='42501'; end if;
  if p_key is null then raise exception 'A save key is required.'; end if;
  if jsonb_typeof(p_values)<>'object' or jsonb_typeof(p_rows)<>'array' then raise exception 'Invalid record payload.'; end if;
  request:=jsonb_build_object('kind',p_kind,'id',p_id,'revision',p_revision,'values',p_values,'rows',p_rows);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into saved from record_editor_private.receipts where key=p_key;
  if found then
    if saved.actor<>auth.uid() or saved.request<>request then raise exception 'This save key belongs to a different change.'; end if;
    return saved.response;
  end if;
  allowed:=record_editor_private.fields(p_kind);
  if allowed is null then raise exception 'Unknown record kind'; end if;
  tab:=case p_kind when 'client' then 'clients' when 'equipment' then 'products' else 'bundles' end;
  child_tab:=case p_kind when 'client' then 'client_contacts' when 'equipment' then 'product_units' else 'bundle_items' end;
  fk:=case p_kind when 'client' then 'client_id' when 'equipment' then 'product_id' else 'bundle_id' end;
  child_allowed:=case p_kind when 'client' then array['full_name','designation','phone','email'] when 'equipment' then array['asset_tag','serial_no','warehouse_id','rack','shelf','bin'] else array['product_id','quantity','days','is_mandatory','sort_order'] end;
  if p_id is null and p_kind='equipment' then allowed:=allowed||array['tracking_mode','total_quantity']; child_allowed:=child_allowed||array['condition']; end if;
  if exists(select 1 from jsonb_object_keys(p_values) k where not k=any(allowed)) then raise exception 'One of these fields cannot be edited here.'; end if;
  if p_id is not null then
    execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into existing using p_id;
    if existing is null then raise exception 'Record not found.'; end if;
    -- Child locks prevent an in-flight unit/component edit from passing the revision check.
    execute format('select 1 from public.%I where %I=$1 for update',child_tab,fk) using p_id;
    current_snapshot:=record_editor_private.read_snapshot(p_kind,p_id::text);
    if p_revision is null or p_revision<>current_snapshot->>'revision' then raise exception 'This record changed since you opened it. Reload the latest record before saving. Your changes have not been saved.' using errcode='40001'; end if;
  end if;
  patch:=p_values;
  if p_kind='client' then
    if patch ? 'country' and patch->>'country' is null then patch:=patch||'{"country":"Nepal"}'; end if;
    if patch ? 'type_parent' and patch->>'type_parent'<>'Organisation' then patch:=patch||'{"org_subtype":null}'; end if;
    if jsonb_array_length(p_rows)>1 then raise exception 'Only one primary contact is supported.'; end if;
  end if;
  if patch ? 'name' and nullif(btrim(patch->>'name'),'') is null then raise exception 'Name is required.'; end if;
  if p_kind='bundle' and jsonb_array_length(p_rows)=0 then raise exception 'Add at least one component.'; end if;
  if p_id is null then
    generated_code:=next_document_number(case p_kind when 'client' then 'client' when 'equipment' then 'equipment' else 'bundle' end);
    patch:=patch||jsonb_build_object('client_uuid',p_key,'created_by',auth.uid(),case p_kind when 'client' then 'client_code' when 'equipment' then 'asset_code' else 'bundle_code' end,generated_code);
    if p_kind='equipment' then
      if coalesce(patch->>'tracking_mode','Serialised')='Serialised' then
        if jsonb_array_length(p_rows)=0 then raise exception 'Add at least one unit.'; end if;
        patch:=patch||jsonb_build_object('total_quantity',jsonb_array_length(p_rows));
      end if;
      patch:=patch||'{"status":"Active"}';
    end if;
  else patch:=patch||jsonb_build_object('updated_at',clock_timestamp());
  end if;
  begin
    identity:=record_editor_private.write_row(tab,p_id,patch);
  exception when unique_violation then
    raise exception '%', case when p_kind='client' then 'A client with this phone number already exists. Open the existing client instead. Your changes have not been saved.' else 'A record with these details already exists. Your changes have not been saved.' end using errcode='23505';
  end;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    child_id:=(row_data->>'id')::uuid;
    if exists(select 1 from jsonb_object_keys(row_data) k where not k=any(child_allowed||array['id','name','status','condition'])) then raise exception 'Unsupported component or unit field.'; end if;
    if child_id is not null then
      execute format('select to_jsonb(t) from public.%I t where id=$1 and %I=$2',child_tab,fk) into existing using child_id,identity;
      if existing is null then raise exception 'This row does not belong to the record.'; end if;
      if p_kind='bundle' and not (existing->>'is_active')::boolean then raise exception 'This component has been removed. Reload first.'; end if;
      if p_kind='equipment' and (row_data->>'condition' is distinct from existing->>'condition' or row_data->>'status' is distinct from existing->>'status') then raise exception 'Use the operational workflow to change condition or custody.'; end if;
    elsif p_id is not null and p_kind='equipment' then raise exception 'Use equipment intake to add units; stock cannot change through Edit.';
    end if;
    patch:=record_editor_private.pick(row_data,child_allowed);
    if p_kind='equipment' then
      if child_id is not null and existing->>'status' not in ('In Stock','Reserved') and (record_editor_private.pick(existing,array['warehouse_id','rack','shelf','bin'])<>record_editor_private.pick(row_data,array['warehouse_id','rack','shelf','bin'])) then raise exception 'Location changes require the equipment to be in stock or reserved.'; end if;
      select branch_id into warehouse_branch from warehouses where id=(patch->>'warehouse_id')::uuid;
      if warehouse_branch is null then raise exception 'Select a warehouse for every unit.'; end if;
      patch:=patch||jsonb_build_object('branch_id',warehouse_branch);
      if child_id is null then serial_count:=serial_count+1; patch:=patch||jsonb_build_object('asset_tag',generated_code||'-'||lpad(serial_count::text,2,'0')); end if;
    end if;
    if child_id is null then patch:=patch||jsonb_build_object(fk,identity,'client_uuid',gen_random_uuid(),'created_by',auth.uid());
      if p_kind='client' then patch:=patch||'{"is_primary":true}'; end if;
    end if;
    child_id:=record_editor_private.write_row(child_tab,child_id,patch);
    kept:=array_append(kept,child_id);
  end loop;
  if p_kind='equipment' and exists(select 1 from product_units where product_id=identity and not id=any(kept)) then raise exception 'Units cannot be removed here. Use the stock or retirement workflow.'; end if;
  if p_kind='client' then update client_contacts set status='Deactivated',is_primary=false,deactivated_at=now(),deactivated_by=auth.uid() where client_id=identity and is_primary and status='Active' and not id=any(kept); end if;
  if p_kind='bundle' then update bundle_items set is_active=false,deactivated_at=now(),deactivated_by=auth.uid() where bundle_id=identity and is_active and not id=any(kept); end if;
  response:=record_editor_private.read_snapshot(p_kind,identity::text);
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,new_values)
  values(p_key,'status change',(case when p_kind='client' then 'Administration' else 'Inventory' end)::audit_category,(case when p_kind='client' then 'Clients' else 'Inventory' end)::audit_module,'Update','Informational','Success',tab,identity,auth.uid(),auth_user_role(),jsonb_build_object('revision',response->>'revision'));
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,auth.uid(),request,response);
  return response;
end; $$;
revoke all on function read_record_editor(text,text) from public,anon;
grant execute on function read_record_editor(text,text) to authenticated;
revoke all on function save_record_editor(text,uuid,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function save_record_editor(text,uuid,text,uuid,jsonb,jsonb) to authenticated;
-- update_bundle: the atomic backing for the existing updateBundle action (header patch + line edits +
-- adds + soft-deactivations in ONE transaction). Before this the action issued each write separately and
-- could leave a bundle half-saved. Same ceiling as bundles_manage (Owner/Admin/Manager).
create or replace function update_bundle(p_id uuid,p_revision text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare req jsonb; receipt record; b bundles; patch jsonb; row_data jsonb; item_id uuid; existing jsonb; sort_next int; result jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager'),false) then raise exception 'Permission denied for this record.' using errcode='42501'; end if;
  if p_key is null or p_revision is null then raise exception 'Reload this bundle before saving.'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid bundle payload.'; end if;
  req:=jsonb_build_object('bundle',p_id,'revision',p_revision,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into receipt from record_editor_private.receipts where key=p_key;
  if found then
    if receipt.actor<>auth.uid() or receipt.request<>req then raise exception 'This save key belongs to a different change.'; end if;
    return receipt.response;
  end if;
  select * into b from bundles where id=p_id for update;
  if b.id is null then raise exception 'Bundle not found.'; end if;
  perform 1 from bundle_items where bundle_id=p_id for update;
  if (record_editor_private.read_snapshot('bundle',p_id::text)->>'revision')<>p_revision then
    raise exception 'This bundle changed since you opened it. Reload the latest record before saving. Your changes have not been saved.' using errcode='40001';
  end if;
  patch:=coalesce(p_payload->'patch','{}'::jsonb);
  if exists(select 1 from jsonb_object_keys(patch) k where not k=any(array['name','description','category_id','daily_rate','weekly_rate','is_active'])) then raise exception 'One of these fields cannot be edited here.'; end if;
  if patch ? 'name' and nullif(btrim(patch->>'name'),'') is null then raise exception 'Name is required.'; end if;
  perform record_editor_private.write_row('bundles',p_id,patch||jsonb_build_object('updated_at',clock_timestamp(),'updated_by',auth.uid()));
  for row_data in select value from jsonb_array_elements(coalesce(p_payload->'edits','[]'::jsonb)) loop
    item_id:=(row_data->>'id')::uuid;
    select to_jsonb(i) into existing from bundle_items i where i.id=item_id and i.bundle_id=p_id and i.is_active;
    if existing is null then raise exception 'A component no longer belongs to this bundle. Reload before saving.'; end if;
    perform record_editor_private.write_row('bundle_items',item_id,record_editor_private.pick(row_data,array['quantity','days','is_mandatory','sort_order']));
  end loop;
  select coalesce(max(sort_order),-1) into sort_next from bundle_items where bundle_id=p_id;
  for row_data in select value from jsonb_array_elements(coalesce(p_payload->'adds','[]'::jsonb)) loop
    if not exists(select 1 from products where id=(row_data->>'product_id')::uuid) then raise exception 'A new component names a product that no longer exists. Reload before saving.'; end if;
    sort_next:=sort_next+1;
    perform record_editor_private.write_row('bundle_items',null,record_editor_private.pick(row_data,array['product_id','quantity','days','is_mandatory'])||jsonb_build_object('bundle_id',p_id,'client_uuid',gen_random_uuid(),'created_by',auth.uid(),'sort_order',sort_next));
  end loop;
  for row_data in select value from jsonb_array_elements(coalesce(p_payload->'deactivations','[]'::jsonb)) loop
    item_id:=(row_data->>'id')::uuid;
    update bundle_items set is_active=false,deactivated_at=now(),deactivated_by=auth.uid() where id=item_id and bundle_id=p_id and is_active;
    if not found then raise exception 'A removed component no longer belongs to this bundle. Reload before saving.'; end if;
  end loop;
  if coalesce((patch->>'is_active')::boolean,b.is_active) and not exists(select 1 from bundle_items where bundle_id=p_id and is_active) then raise exception 'Add at least one component.'; end if;
  result:=record_editor_private.read_snapshot('bundle',p_id::text);
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,new_values)
  values(p_key,'status change','Inventory'::audit_category,'Inventory'::audit_module,'Update','Informational','Success','bundles',p_id,auth.uid(),auth_user_role(),jsonb_build_object('revision',result->>'revision'));
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,auth.uid(),req,result);
  return result;
end; $$;
revoke all on function update_bundle(uuid,text,uuid,jsonb) from public,anon;
grant execute on function update_bundle(uuid,text,uuid,jsonb) to authenticated;

revoke all on all functions in schema record_editor_private from public,anon,authenticated;
commit;
