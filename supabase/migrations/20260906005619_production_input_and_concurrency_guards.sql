-- Production input bounds and concurrency guards. Existing content is not rewritten.
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = clock_timestamp(); return new; end; $$;

create function private.valid_preferences(value jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare item jsonb;
begin
 if jsonb_typeof(value) <> 'object' or octet_length(value::text)>262144 then return false; end if;
 if value ? 'commonItems' then
   if jsonb_typeof(value->'commonItems') <> 'array' then return false; end if;
   if jsonb_array_length(value->'commonItems') > 1000 then return false; end if;
   for item in select * from jsonb_array_elements(value->'commonItems') loop
     if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'name') is distinct from 'string'
       or length(btrim(item->>'name')) not between 1 and 200
       or jsonb_typeof(item->'tag') is distinct from 'string'
       or item->>'tag' not in ('','green','orange','red','blue','purple','yellow','pink') then return false; end if;
   end loop;
 end if;
 if value ? 'removedCommonItems' then
   if jsonb_typeof(value->'removedCommonItems') <> 'array' then return false; end if;
   if jsonb_array_length(value->'removedCommonItems') > 1000 then return false; end if;
   for item in select * from jsonb_array_elements(value->'removedCommonItems') loop
     if jsonb_typeof(item)<>'string' or length(item #>> '{}') not between 1 and 200 then return false; end if;
   end loop;
 end if;
 return true;
end $$;
revoke all on function private.valid_preferences(jsonb) from public,anon;
grant execute on function private.valid_preferences(jsonb) to authenticated,service_role;
alter table public.profiles add constraint profiles_preferences_shape check (private.valid_preferences(preferences));
alter table public.profiles add constraint profiles_name_length check (length(display_name)<=200);
alter table public.recipes add constraint recipes_input_bounds check (length(title)<=200 and length(instructions)<=20000 and servings>0 and servings<=1000);
alter table public.grocery_lists add constraint grocery_lists_name_length check (length(name)<=200);
alter table public.recipe_ingredients add constraint recipe_ingredients_input_bounds check (length(name)<=200 and length(quantity)<=120 and tag in ('','green','orange','red','blue','purple','yellow','pink'));
alter table public.grocery_items add constraint grocery_items_input_bounds check (length(name)<=200 and length(quantity)<=120 and tag in ('','green','orange','red','blue','purple','yellow','pink'));
alter table public.recipe_shares add constraint recipe_shares_email_format check (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');
alter table public.grocery_list_shares add constraint grocery_list_shares_email_format check (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');
alter table public.user_item_tags add constraint tags_input_bounds check (length(item_name)<=200 and tag in ('','green','orange','red','blue','purple','yellow','pink'));

create function private.guard_owned_record() returns trigger
language plpgsql set search_path = ''
as $$
declare total integer; max_rows integer;
begin
 if tg_op='UPDATE' then
   if new.id <> old.id or new.owner_id <> old.owner_id then raise exception 'Record identity cannot be changed'; end if;
   new.created_at := old.created_at;
 else
   if auth.uid() is not null and new.owner_id <> auth.uid() then raise exception 'Cannot create a record for another user'; end if;
   perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
   max_rows := tg_argv[0]::integer;
   execute format('select count(*) from public.%I where owner_id=$1',tg_table_name) into total using new.owner_id;
   if total >= max_rows then raise exception 'Account limit reached (% records). Export or remove unused records.', max_rows; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_owned_record() from public,anon,authenticated;
create trigger guard_record before insert or update on public.recipes for each row execute function private.guard_owned_record('250');
create trigger guard_record before insert or update on public.grocery_lists for each row execute function private.guard_owned_record('100');

create function private.guard_child_record() returns trigger
language plpgsql set search_path = ''
as $$
declare parent_id uuid; old_parent uuid; total integer;
begin
 if tg_op='DELETE' then parent_id:=(to_jsonb(old)->>tg_argv[1])::uuid;
 else parent_id:=(to_jsonb(new)->>tg_argv[1])::uuid; end if;
 if tg_op='UPDATE' then
   old_parent:=(to_jsonb(old)->>tg_argv[1])::uuid;
   if parent_id<>old_parent then raise exception 'Move items by copying them to the other record'; end if;
 end if;
 -- The owner-only UPDATE locks the parent, serializes quota checks, and invalidates old snapshots.
 execute format('update public.%I set updated_at=clock_timestamp() where id=$1',tg_argv[0]) using parent_id;
 if tg_op='INSERT' then
   execute format('select count(*) from public.%I where %I=$1',tg_table_name,tg_argv[1]) into total using parent_id;
   if total >= tg_argv[2]::integer then raise exception 'This record has reached its item or sharing limit (%)',tg_argv[2]; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.guard_child_record() from public,anon,authenticated;
create trigger guard_child before insert or update or delete on public.recipe_ingredients for each row execute function private.guard_child_record('recipes','recipe_id','100');
create trigger guard_child before insert or update or delete on public.grocery_items for each row execute function private.guard_child_record('grocery_lists','grocery_list_id','500');
create trigger guard_child before insert or update or delete on public.recipe_shares for each row execute function private.guard_child_record('recipes','recipe_id','20');
create trigger guard_child before insert or update or delete on public.grocery_list_shares for each row execute function private.guard_child_record('grocery_lists','grocery_list_id','20');
create function private.guard_item_tags() returns trigger language plpgsql set search_path = ''
as $$
begin
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Tag owner cannot change'; end if;
 if tg_op='INSERT' then
   if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Tag owner must match the signed-in user'; end if;
   perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
   if (select count(*) from public.user_item_tags where user_id=new.user_id)>=1000 then raise exception 'Maximum 1000 remembered tags'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_item_tags() from public,anon,authenticated;
create trigger guard_tags before insert or update on public.user_item_tags for each row execute function private.guard_item_tags();

create table private.mutation_audit (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid,
 table_name text not null,
 operation text not null,
 record_id uuid
);
revoke all on private.mutation_audit from public,anon,authenticated;
create index mutation_audit_occurred_at_idx on private.mutation_audit(occurred_at);
create function private.audit_mutation() returns trigger language plpgsql security definer set search_path = ''
as $$
declare row_data jsonb;
begin
 if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
 insert into private.mutation_audit(actor_id,table_name,operation,record_id)
 values(auth.uid(),tg_table_name,tg_op,coalesce(row_data->>'id',row_data->>'recipe_id',row_data->>'grocery_list_id')::uuid);
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.audit_mutation() from public,anon,authenticated;
create trigger audit_mutation after insert or update or delete on public.recipes for each row execute function private.audit_mutation();
create trigger audit_mutation after insert or update or delete on public.grocery_lists for each row execute function private.audit_mutation();
create trigger audit_mutation after insert or update or delete on public.recipe_shares for each row execute function private.audit_mutation();
create trigger audit_mutation after insert or update or delete on public.grocery_list_shares for each row execute function private.audit_mutation();
create or replace function public.save_workspace(changes jsonb) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare c jsonb; p jsonb; target uuid; affected integer;
begin
 if auth.uid() is null then raise exception 'Sign in before saving'; end if;
 if jsonb_typeof(changes) is distinct from 'array' then raise exception 'Changes must be an array'; end if;
 if jsonb_array_length(changes)>100 or octet_length(changes::text)>2097152 then raise exception 'Save up to 100 changed records and 2 MB at a time'; end if;
 for c in select value from jsonb_array_elements(changes) loop
 p := c->'data';
 if coalesce(c->>'operation','save') not in ('save','delete') then raise exception 'Unknown save operation'; end if;
 if coalesce(c->>'operation','save')='save' then
   if jsonb_typeof(p) is distinct from 'object' then raise exception 'Record data is required'; end if;
   if c->>'kind' in ('recipe','list') then
     if jsonb_typeof(p->'sharedWith') is distinct from 'array' then raise exception 'Sharing must be an array'; end if;
     if jsonb_array_length(p->'sharedWith')>20 then raise exception 'Share with up to 20 members'; end if;
     if c->>'kind'='recipe' and jsonb_typeof(p->'ingredients') is distinct from 'array' then raise exception 'Ingredients must be an array'; end if;
     if c->>'kind'='list' and jsonb_typeof(p->'items') is distinct from 'array' then raise exception 'Items must be an array'; end if;
   elsif c->>'kind'='preferences' then
     if jsonb_typeof(p->'tags') is distinct from 'object' then raise exception 'Tags must be an object'; end if;
   end if;
 end if;
 if c->>'kind' = 'preferences' then
   if c->>'version' is null then
     insert into public.profiles(id,preferences) values(auth.uid(), p->'preferences');
   else
     update public.profiles set preferences=p->'preferences'
     where id=auth.uid() and updated_at=(c->>'version')::timestamptz;
     get diagnostics affected = row_count;
     if affected <> 1 then raise exception 'Data changed on another device. Refresh and try again.'; end if;
   end if;
   delete from public.user_item_tags where user_id=auth.uid();
   insert into public.user_item_tags(user_id,item_name,tag)
   select auth.uid(),key,value from jsonb_each_text(p->'tags');
 elsif c->>'kind' = 'recipe' then
 target := (c->>'id')::uuid;
 if c->>'version' is null then
   if c->>'operation' = 'delete' then raise exception 'Missing record version'; end if;
   insert into public.recipes(id,owner_id,title,servings,instructions)
   values(target,auth.uid(),p->>'title',(p->>'servings')::numeric,p->>'instructions');
 else
   update public.recipes set title=case when c->>'operation'='delete' then title else p->>'title' end
   ,servings=case when c->>'operation'='delete' then servings else (p->>'servings')::numeric end,instructions=case when c->>'operation'='delete' then instructions else p->>'instructions' end
   where id=target and owner_id=auth.uid() and updated_at=(c->>'version')::timestamptz;
   get diagnostics affected = row_count;
   if affected <> 1 then raise exception 'Data changed or access was removed. Refresh and try again.'; end if;
 end if;
 if c->>'operation' = 'delete' then
   delete from public.recipes where id=target;
 else
   delete from public.recipe_ingredients where recipe_id=target;
   insert into public.recipe_ingredients(id,recipe_id,name,quantity,tag,position)
   select (v->>'id')::uuid,target,v->>'name',coalesce(v->>'quantity',''),coalesce(v->>'tag',''),(ord-1)::integer
   from jsonb_array_elements(p->'ingredients') with ordinality as items(v,ord);
   delete from public.recipe_shares where recipe_id=target;
   insert into public.recipe_shares(recipe_id,email)
   select distinct target,lower(btrim(value)) from jsonb_array_elements_text(p->'sharedWith');
 end if;
 elsif c->>'kind' = 'list' then
 target := (c->>'id')::uuid;
 if c->>'version' is null then
   if c->>'operation' = 'delete' then raise exception 'Missing record version'; end if;
   insert into public.grocery_lists(id,owner_id,name)
   values(target,auth.uid(),p->>'name');
 else
   update public.grocery_lists set name=case when c->>'operation'='delete' then name else p->>'name' end
   
   where id=target and owner_id=auth.uid() and updated_at=(c->>'version')::timestamptz;
   get diagnostics affected = row_count;
   if affected <> 1 then raise exception 'Data changed or access was removed. Refresh and try again.'; end if;
 end if;
 if c->>'operation' = 'delete' then
   delete from public.grocery_lists where id=target;
 else
   delete from public.grocery_items where grocery_list_id=target;
   insert into public.grocery_items(id,grocery_list_id,name,quantity,tag,position,checked)
   select (v->>'id')::uuid,target,v->>'name',coalesce(v->>'quantity',''),coalesce(v->>'tag',''),(ord-1)::integer,coalesce((v->>'done')::boolean,false)
   from jsonb_array_elements(p->'items') with ordinality as items(v,ord);
   delete from public.grocery_list_shares where grocery_list_id=target;
   insert into public.grocery_list_shares(grocery_list_id,email)
   select distinct target,lower(btrim(value)) from jsonb_array_elements_text(p->'sharedWith');
 end if;
 else raise exception 'Unknown change type';
 end if;
 end loop;
 return public.load_workspace();
end;
$$;

