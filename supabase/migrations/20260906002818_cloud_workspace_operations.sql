alter table public.profiles add column preferences jsonb not null default '{}'::jsonb;
create function public.load_workspace() returns jsonb language sql stable security invoker set search_path = ''
as $$
 select jsonb_build_object(
 'recipes', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object(
 'ingredients', coalesce((select jsonb_agg(i order by i.position) from public.recipe_ingredients i where i.recipe_id=r.id),'[]'::jsonb),
 'shares', coalesce((select jsonb_agg(s.email) from public.recipe_shares s where s.recipe_id=r.id),'[]'::jsonb))) from public.recipes r),'[]'::jsonb),
 'lists', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object(
 'items', coalesce((select jsonb_agg(i order by i.position) from public.grocery_items i where i.grocery_list_id=l.id),'[]'::jsonb),
 'shares', coalesce((select jsonb_agg(s.email) from public.grocery_list_shares s where s.grocery_list_id=l.id),'[]'::jsonb))) from public.grocery_lists l),'[]'::jsonb),
 'profile', (select to_jsonb(p) from public.profiles p where p.id=(select auth.uid())),
 'tags', coalesce((select jsonb_object_agg(item_name,tag) from public.user_item_tags where user_id=(select auth.uid())),'{}'::jsonb)
 );
$$;
create function public.save_workspace(changes jsonb) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare c jsonb; p jsonb; target uuid; affected integer;
begin
 if auth.uid() is null then raise exception 'Sign in before saving'; end if;
 for c in select value from jsonb_array_elements(changes) loop
 p := c->'data';
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
revoke all on function public.load_workspace(), public.save_workspace(jsonb) from public,anon;
grant execute on function public.load_workspace(), public.save_workspace(jsonb) to authenticated;

