-- RULING 2026-10-02: general editing is a Quote-only, online atomic operation.
begin;
create function read_quote_editor(p_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings; result jsonb; line_rows jsonb; crew_rows jsonb; transport_row jsonb; discounts jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator'),false) then raise exception 'You cannot edit this booking.' using errcode='42501'; end if;
  select * into b from bookings where id::text=p_id or booking_no=p_id;
  if b.id is null then raise exception 'Booking not found.'; end if;
  if b.stage<>'Quote' or b.cancelled_at is not null then raise exception 'Only unconfirmed quotes can be edited. Use the booking’s operational actions.'; end if;
  select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(l),array['id','client_uuid','parent_line_id','line_type','product_id','bundle_id','description','qty','days','rate','discount_amount','is_included','service_basis','line_note','sort_order'])||jsonb_build_object('name',coalesce(l.description,p.name,k.name),'parent_client_uuid',parent.client_uuid) order by l.sort_order,l.id),'[]') into line_rows
  from booking_lines l left join products p on p.id=l.product_id left join bundles k on k.id=l.bundle_id left join booking_lines parent on parent.id=l.parent_line_id where l.booking_id=b.id and l.voided_at is null;
  select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(c),array['id','client_uuid','crew_member_id','name','crew_role','phone','day_rate','days','overtime','accommodation','meals']) order by c.id),'[]') into crew_rows from booking_crew_lines c where c.booking_id=b.id and c.voided_at is null;
  select record_editor_private.pick(to_jsonb(t),array['id','vehicle','number_plate','driver_contact','delivery_charge','fuel_charge','special_instructions']) into transport_row from booking_transport t where t.booking_id=b.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'percent',percent) order by id),'[]') into discounts from booking_discounts where booking_id=b.id;
  result:=jsonb_build_object('id',b.id,'code',b.booking_no,'values',record_editor_private.pick(to_jsonb(b),array['client_id','contact_id','branch_id','project','project_type','project_type_other','pickup_at','return_at','delivery_type','pickup_location','return_location','deposit_required']),'lines',line_rows,'crew',crew_rows,'transport',transport_row,'discounts',discounts);
  return result||jsonb_build_object('revision',md5((result||jsonb_build_object('updated_at',b.updated_at,'version',b.version))::text));
end; $$;
revoke all on function read_quote_editor(text) from public,anon;
grant execute on function read_quote_editor(text) to authenticated;

create function update_rental_quote(p_id uuid,p_revision text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings; req jsonb; receipt record; result jsonb; row_data jsonb; patch jsonb; existing jsonb; row_id uuid; kept uuid[]:='{}'; kept_crew uuid[]:='{}'; mapping jsonb:='{}'; parent_id uuid; transport_id uuid; audit_id uuid:=gen_random_uuid(); first_discount uuid; discount_pct numeric; rate numeric; base_rate numeric;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator'),false) then raise exception 'You cannot edit this booking.' using errcode='42501'; end if;
  if p_key is null or p_revision is null then raise exception 'Reload this booking before saving.'; end if;
  req:=jsonb_build_object('booking',p_id,'revision',p_revision,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into receipt from record_editor_private.receipts where key=p_key;
  if found then if receipt.actor<>auth.uid() or receipt.request<>req then raise exception 'This save key belongs to another change.'; end if; return receipt.response; end if;
  select * into b from bookings where id=p_id for update;
  if b.id is null then raise exception 'Booking not found.'; end if;
  if b.stage<>'Quote' or b.cancelled_at is not null then raise exception 'Only unconfirmed quotes can be edited.'; end if;
  perform 1 from booking_lines where booking_id=p_id for update;
  perform 1 from booking_crew_lines where booking_id=p_id for update;
  perform 1 from booking_transport where booking_id=p_id for update;
  perform 1 from booking_discounts where booking_id=p_id for update;
  perform 1 from invoices where booking_id=p_id for update;
  if exists(select 1 from invoices where booking_id=p_id and status::text not in ('Draft','Void')) then raise exception 'This booking has an issued financial document. Use the finance correction workflow.'; end if;
  if (read_quote_editor(p_id::text)->>'revision')<>p_revision then raise exception 'This booking changed since you opened it. Reload the latest record before saving.' using errcode='40001'; end if;
  if jsonb_typeof(p_payload->'lines')<>'array' or jsonb_typeof(p_payload->'crew')<>'array' then raise exception 'Invalid booking lines.'; end if;
  patch:=p_payload->'values';
  if exists(select 1 from jsonb_object_keys(patch) k where not k=any(array['client_id','project','project_type','project_type_other','pickup_at','return_at','delivery_type','pickup_location','return_location','deposit_required'])) then raise exception 'This booking field cannot be edited.'; end if;
  -- Client reassignment may not detach existing receipts from their account.
  if patch->>'client_id' is distinct from b.client_id::text and exists(select 1 from invoices where booking_id=p_id) then raise exception 'The client cannot change after a financial document has been created.'; end if;
  perform record_editor_private.write_row('bookings',p_id,patch||jsonb_build_object('updated_at',clock_timestamp(),'updated_by',auth.uid()));
  for row_data in select value from jsonb_array_elements(p_payload->'lines') loop
    row_id:=(row_data->>'id')::uuid;
    if row_id is not null then
      select to_jsonb(l) into existing from booking_lines l where id=row_id and booking_id=p_id and voided_at is null;
      if existing is null then raise exception 'A line no longer belongs to this quote. Reload before saving.'; end if;
      if row_data->>'client_uuid' is distinct from existing->>'client_uuid' then raise exception 'A line identity cannot change.'; end if;
    else existing:=null; end if;
    if row_data->>'client_uuid' is null then raise exception 'Every line needs a stable key.'; end if;
    patch:=record_editor_private.pick(row_data,array['line_type','product_id','bundle_id','description','qty','days','rate','discount_amount','is_included','service_basis','line_note','sort_order']);
    if row_data->>'parent_client_uuid' is not null or coalesce((patch->>'is_included')::boolean,false) then rate:=0; base_rate:=0;
    else
      base_rate:=get_model_daily_rate((patch->>'product_id')::uuid,(patch->>'bundle_id')::uuid);
      rate:=coalesce((patch->>'rate')::numeric,base_rate,0);
    end if;
    patch:=patch||jsonb_build_object('rate',rate,'rate_overridden',base_rate is not null and rate<>base_rate);
    if row_id is null then patch:=patch||jsonb_build_object('booking_id',p_id,'client_uuid',row_data->>'client_uuid','created_by',auth.uid()); end if;
    row_id:=record_editor_private.write_row('booking_lines',row_id,patch);
    if row_id=any(kept) then raise exception 'A booking line appears twice.'; end if;
    kept:=array_append(kept,row_id);mapping:=mapping||jsonb_build_object(row_data->>'client_uuid',row_id);
  end loop;
  for row_data in select value from jsonb_array_elements(p_payload->'lines') loop
    row_id:=(mapping->>(row_data->>'client_uuid'))::uuid;
    parent_id:=(mapping->>(row_data->>'parent_client_uuid'))::uuid;
    if row_data->>'parent_client_uuid' is not null and parent_id is null then raise exception 'The bundle parent is missing.'; end if;
    update booking_lines set parent_line_id=parent_id where id=row_id;
  end loop;
  update booking_lines set voided_at=now(),voided_reason='Removed while editing unconfirmed quote' where booking_id=p_id and voided_at is null and not id=any(kept);
  -- Assignments keep their identity and history. Over-allocation cannot survive a qty change.
  if exists(select 1 from booking_lines l where l.id=any(kept) and (select count(*) from booking_line_units u where u.booking_line_id=l.id and u.released_at is null)>l.qty) then raise exception 'Release assigned units before reducing this quantity.'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'crew') loop
    row_id:=(row_data->>'id')::uuid;
    if row_id is not null and not exists(select 1 from booking_crew_lines where id=row_id and booking_id=p_id and voided_at is null) then raise exception 'This crew row does not belong to the booking.'; end if;
    patch:=record_editor_private.pick(row_data,array['crew_member_id','name','crew_role','phone','day_rate','days','overtime','accommodation','meals']);
    if row_id is null then patch:=patch||jsonb_build_object('booking_id',p_id,'client_uuid',gen_random_uuid(),'created_by',auth.uid()); end if;
    row_id:=record_editor_private.write_row('booking_crew_lines',row_id,patch);kept_crew:=array_append(kept_crew,row_id);
  end loop;
  update booking_crew_lines set voided_at=now() where booking_id=p_id and voided_at is null and not id=any(kept_crew);
  select id into transport_id from booking_transport where booking_id=p_id;
  patch:=record_editor_private.pick(coalesce(p_payload->'transport','{}'),array['vehicle','number_plate','driver_contact','delivery_charge','fuel_charge','special_instructions']);
  if transport_id is not null or patch<>'{}' then
    if transport_id is null then patch:=patch||jsonb_build_object('booking_id',p_id,'client_uuid',gen_random_uuid(),'created_by',auth.uid()); end if;
    perform record_editor_private.write_row('booking_transport',transport_id,patch);
  end if;
  discount_pct:=(p_payload->>'discount_percent')::numeric;
  if discount_pct is null or discount_pct<0 or discount_pct>100 then raise exception 'Discount must be between 0 and 100 percent.'; end if;
  insert into audit_events(id,client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,branch_id,old_values,new_values)
  values(audit_id,p_key,'status change','Rentals','Rentals','Update','Informational','Success','bookings',p_id,auth.uid(),auth_user_role(),b.branch_id,jsonb_build_object('revision',p_revision),jsonb_build_object('edited','Quote'));
  if discount_pct is distinct from (select coalesce(sum(percent),0) from booking_discounts where booking_id=p_id) then
    select id into first_discount from booking_discounts where booking_id=p_id order by id limit 1;
    if first_discount is null and discount_pct>0 then
      insert into booking_discounts(client_uuid,booking_id,branch_id,discount_source,percent,reason,applied_by,audit_event_id) values(gen_random_uuid(),p_id,b.branch_id,'Manual',discount_pct,'Quote edited',auth.uid(),audit_id);
    else update booking_discounts set percent=case when id=first_discount then discount_pct else 0 end,reason='Quote edited',audit_event_id=audit_id where booking_id=p_id; end if;
  end if;
  -- Draft invoices retain their identity but must be refreshed by Finance before issue.
  -- Their existing line snapshots are never silently rewritten by a booking edit.
  if exists(select 1 from invoices where booking_id=p_id and status='Draft') then raise exception 'Void the draft invoice before editing this quote, then create its replacement from the updated booking.'; end if;
  result:=read_quote_editor(p_id::text);
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,auth.uid(),req,result);
  return result;
end; $$;
revoke all on function update_rental_quote(uuid,text,uuid,jsonb) from public,anon;
grant execute on function update_rental_quote(uuid,text,uuid,jsonb) to authenticated;
commit;
