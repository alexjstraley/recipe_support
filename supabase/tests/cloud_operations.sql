begin;
do $test$
declare u uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); lid uuid:=gen_random_uuid();
 doc jsonb; result jsonb; version text; blocked boolean:=false;
begin
 insert into auth.users(id,email,email_confirmed_at) values(u,u::text||'@example.invalid',now()),(viewer,viewer::text||'@example.invalid',now());
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('role','authenticated',true);
 doc:=jsonb_build_object('title','Cloud test','servings',4,'instructions','Cook','ingredients',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Beans','quantity','1/2 cup','tag','green')),'sharedWith',jsonb_build_array(viewer::text||'@example.invalid'));
 result:=public.save_workspace(jsonb_build_array(
 jsonb_build_object('kind','recipe','id',rid,'data',doc),
 jsonb_build_object('kind','list','id',lid,'data',jsonb_build_object('name','Shopping','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Beans','done',true)),'sharedWith','[]'::jsonb)),
 jsonb_build_object('kind','preferences','data',jsonb_build_object('preferences',jsonb_build_object('commonItems','[]'::jsonb),'tags',jsonb_build_object('beans','green')))
 ));
 if not exists(select 1 from public.grocery_items where grocery_list_id=lid and checked) then raise exception 'Checked status not saved'; end if;
 if not exists(select 1 from public.recipe_ingredients where recipe_id=rid and quantity='1/2 cup') then raise exception 'Quantity not saved'; end if;
 select updated_at::text into version from public.recipes where id=rid;
 -- A failed multi-record save must roll back earlier changes.
 begin
 perform public.save_workspace(jsonb_build_array(
 jsonb_build_object('kind','recipe','id',rid,'version',version,'data',doc||'{"title":"Must roll back"}'),
 jsonb_build_object('kind','list','id',lid,'version','2000-01-01','operation','delete')));
 exception when raise_exception then blocked:=true;
 end;
 if not blocked then raise exception 'Stale update accepted'; end if;
 if (select title from public.recipes where id=rid)<>'Cloud test' then raise exception 'Atomic rollback failed'; end if;
 perform set_config('request.jwt.claim.sub',viewer::text,true);
 result:=public.load_workspace();
 if not exists(select 1 from jsonb_array_elements(result->'recipes') r where r->>'id'=rid::text) then raise exception 'Shared load failed'; end if;
 blocked:=false;
 begin
 perform public.save_workspace(jsonb_build_array(jsonb_build_object('kind','recipe','id',rid,'version',version,'data',doc)));
 exception when raise_exception then blocked:=true;
 end;
 if not blocked then raise exception 'Viewer edit allowed'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform public.save_workspace(jsonb_build_array(jsonb_build_object('kind','recipe','id',rid,'version',version,'operation','delete')));
 if exists(select 1 from public.recipe_ingredients where recipe_id=rid) then raise exception 'Cascade failed'; end if;
 perform set_config('role','anon',true);
 blocked:=false;
 begin perform public.load_workspace(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Anonymous RPC allowed'; end if;
 perform set_config('role','postgres',true);
end $test$;
rollback;
