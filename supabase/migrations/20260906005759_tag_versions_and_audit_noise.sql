create or replace function private.audit_mutation() returns trigger language plpgsql security definer set search_path = ''
as $$
declare row_data jsonb;
begin
 -- Child edits touch updated_at for concurrency; don't turn those touches into duplicate audit events.
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
 if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
 insert into private.mutation_audit(actor_id,table_name,operation,record_id)
 values(auth.uid(),tg_table_name,tg_op,coalesce(row_data->>'id',row_data->>'recipe_id',row_data->>'grocery_list_id')::uuid);
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create or replace function private.guard_item_tags() returns trigger language plpgsql set search_path = ''
as $$
declare owner_uid uuid;
begin
 if tg_op='DELETE' then owner_uid:=old.user_id; else owner_uid:=new.user_id; end if;
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Tag owner cannot change'; end if;
 if tg_op='INSERT' then
   if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Tag owner must match the signed-in user'; end if;
   perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
   if (select count(*) from public.user_item_tags where user_id=new.user_id)>=1000 then raise exception 'Maximum 1000 remembered tags'; end if;
   insert into public.profiles(id) values(owner_uid) on conflict(id) do nothing;
 end if;
 update public.profiles set updated_at=clock_timestamp() where id=owner_uid;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger guard_tags on public.user_item_tags;
create trigger guard_tags before insert or update or delete on public.user_item_tags for each row execute function private.guard_item_tags();

