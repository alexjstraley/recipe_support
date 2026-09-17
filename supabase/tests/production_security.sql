begin;
do $test$
declare owner_uid uuid:=gen_random_uuid(); viewer_uid uuid:=gen_random_uuid(); outsider_uid uuid:=gen_random_uuid();
 rid uuid:=gen_random_uuid(); lid uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); v text; ok boolean; t text; n integer; doc jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at) values
 (owner_uid,owner_uid::text||'@example.invalid',now()),
 (viewer_uid,viewer_uid::text||'@example.invalid',now()),
 (outsider_uid,outsider_uid::text||'@example.invalid',now());
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 perform set_config('role','authenticated',true);
 insert into public.recipes(id,owner_id,title) values(rid,owner_uid,'Security test');
 insert into public.grocery_lists(id,owner_id,name) values(lid,owner_uid,'Security test');
 select updated_at::text into v from public.recipes where id=rid;
 insert into public.recipe_ingredients(id,recipe_id,name) values(iid,rid,'Beans');
 if (select updated_at::text from public.recipes where id=rid)=v then raise exception 'Child insert did not invalidate version'; end if;
 doc:=jsonb_build_object('title','Stale','servings',4,'instructions','','ingredients','[]'::jsonb,'sharedWith','[]'::jsonb);
 ok:=false;
 begin perform public.save_workspace(jsonb_build_array(jsonb_build_object('kind','recipe','id',rid,'version',v,'data',doc)));
 exception when raise_exception then ok:=true; end;
 if not ok then raise exception 'Stale child snapshot was accepted'; end if;
 ok:=false;
 begin update public.recipes set id=gen_random_uuid() where id=rid; exception when raise_exception then ok:=true; end;
 if not ok then raise exception 'Identity change allowed'; end if;
 ok:=false;
 begin update public.recipes set title=repeat('a',201) where id=rid; exception when check_violation then ok:=true; end;
 if not ok then raise exception 'Oversized title accepted'; end if;
 ok:=false;
 begin insert into public.profiles(id,preferences) values(owner_uid,'{"commonItems":42}');
 exception when check_violation then ok:=true; end;
 if not ok then raise exception 'Malformed preferences accepted'; end if;
 insert into public.profiles(id) values(owner_uid);
 select updated_at::text into v from public.profiles where id=owner_uid;
 insert into public.user_item_tags(user_id,item_name,tag) values(owner_uid,'beans','green');
 if (select updated_at::text from public.profiles where id=owner_uid)=v then raise exception 'Tag did not invalidate preference version'; end if;
 insert into public.recipe_ingredients(recipe_id,name) select rid,'item '||i from generate_series(1,99) i;
 ok:=false;
 begin insert into public.recipe_ingredients(recipe_id,name) values(rid,'101st');
 exception when raise_exception then ok:=true; end;
 if not ok then raise exception 'Ingredient quota bypass'; end if;
 insert into public.recipe_shares(recipe_id,email) values(rid,viewer_uid::text||'@example.invalid');
 insert into public.grocery_list_shares(grocery_list_id,email) values(lid,viewer_uid::text||'@example.invalid');
 perform set_config('request.jwt.claim.sub',viewer_uid::text,true);
 if not exists(select 1 from public.recipe_ingredients where id=iid) then raise exception 'Viewer cannot read shared ingredient'; end if;
 update public.recipe_ingredients set name='forged' where id=iid;
 get diagnostics n=row_count; if n<>0 then raise exception 'Viewer can edit ingredient'; end if;
 ok:=false;
 begin insert into public.grocery_items(grocery_list_id,name) values(lid,'forged');
 exception when insufficient_privilege then ok:=true; end;
 if not ok then raise exception 'Viewer can insert item'; end if;
 update public.recipe_shares set email=outsider_uid::text||'@example.invalid' where recipe_id=rid;
 get diagnostics n=row_count; if n<>0 then raise exception 'Viewer can reshare'; end if;
 perform set_config('request.jwt.claim.sub',outsider_uid::text,true);
 if exists(select 1 from public.recipes where id=rid) or exists(select 1 from public.grocery_lists where id=lid) then raise exception 'Outsider can read'; end if;
 ok:=false;
 begin insert into public.recipe_shares(recipe_id,email) values(rid,outsider_uid::text||'@example.invalid');
 exception when insufficient_privilege then ok:=true; end;
 if not ok then raise exception 'Outsider can grant own access'; end if;
 perform set_config('role','anon',true);
 foreach t in array array['profiles','recipes','recipe_ingredients','grocery_lists','grocery_items','recipe_shares','grocery_list_shares','user_item_tags'] loop
   ok:=false; begin execute format('select count(*) from public.%I',t); exception when insufficient_privilege then ok:=true; end;
   if not ok then raise exception 'Anonymous access: %',t; end if;
 end loop;
 perform set_config('role','authenticated',true);
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 ok:=false; begin perform public.save_workspace('{"not":"array"}'); exception when raise_exception then ok:=true; end;
 if not ok then raise exception 'Malformed request accepted'; end if;
 ok:=false;
 begin perform 1 from private.mutation_audit; exception when insufficient_privilege then ok:=true; end;
 if not ok then raise exception 'Client can read private audit log'; end if;
 perform set_config('role','postgres',true);
 if not exists(select 1 from private.mutation_audit where actor_id=owner_uid and table_name='recipe_shares' and operation='INSERT') then raise exception 'Share change not audited'; end if;
end $test$;
rollback;

