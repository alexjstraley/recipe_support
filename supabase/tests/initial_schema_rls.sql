begin;
do $test$
declare
 owner_uid uuid := gen_random_uuid();
 reader_uid uuid := gen_random_uuid();
 outsider_uid uuid := gen_random_uuid();
 recipe uuid := gen_random_uuid();
 list_id uuid := gen_random_uuid();
 reader_email text;
 n integer;
 t text;
begin
 reader_email := reader_uid::text || '@example.invalid';
 insert into auth.users(id, email, email_confirmed_at) values
 (owner_uid, owner_uid::text || '@example.invalid', now()),
 (reader_uid, reader_email, now()),
 (outsider_uid, outsider_uid::text || '@example.invalid', now());
 perform set_config('request.jwt.claim.sub', owner_uid::text, true);
 perform set_config('role', 'authenticated', true);
 insert into public.profiles(id, display_name) values (owner_uid, 'RLS test');
 insert into public.recipes(id, owner_id, title) values (recipe, owner_uid, 'RLS test');
 insert into public.grocery_lists(id, owner_id, name) values (list_id, owner_uid, 'RLS test');
 insert into public.recipe_ingredients(recipe_id, name) values (recipe, 'Test');
 insert into public.grocery_items(grocery_list_id, name) values (list_id, 'Test');
 insert into public.recipe_shares(recipe_id, email) values (recipe, reader_email);
 insert into public.grocery_list_shares(grocery_list_id, email) values (list_id, reader_email);
 insert into public.user_item_tags(user_id, item_name, tag) values (owner_uid, 'test', 'green');
 foreach t in array array['profiles','recipes','recipe_ingredients','grocery_lists','grocery_items','recipe_shares','grocery_list_shares','user_item_tags'] loop
   execute format('select count(*) from public.%I', t) into n;
   if n <> 1 then raise exception 'Owner read failed: %', t; end if;
 end loop;
 perform set_config('request.jwt.claim.sub', reader_uid::text, true);
 foreach t in array array['recipes','recipe_ingredients','grocery_lists','grocery_items','recipe_shares','grocery_list_shares'] loop
   execute format('select count(*) from public.%I', t) into n;
   if n <> 1 then raise exception 'Shared read failed: %', t; end if;
   execute format('delete from public.%I', t);
   get diagnostics n = row_count;
   if n <> 0 then raise exception 'Shared delete allowed: %', t; end if;
 end loop;
 update public.recipes set title = 'forbidden' where id = recipe;
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'Shared update allowed'; end if;
 begin
   insert into public.recipe_ingredients(recipe_id, name) values (recipe, 'forbidden');
   raise exception 'Shared insert allowed';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub', outsider_uid::text, true);
 foreach t in array array['profiles','recipes','recipe_ingredients','grocery_lists','grocery_items','recipe_shares','grocery_list_shares','user_item_tags'] loop
   execute format('select count(*) from public.%I', t) into n;
   if n <> 0 then raise exception 'Private data exposed: %', t; end if;
 end loop;
 begin
   insert into public.recipes(owner_id, title) values (owner_uid, 'forbidden');
   raise exception 'Owner impersonation allowed';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub', owner_uid::text, true);
 update public.recipes set title = 'owner edit' where id = recipe;
 get diagnostics n = row_count;
 if n <> 1 then raise exception 'Owner update failed'; end if;
 delete from public.recipe_shares where recipe_id = recipe;
 perform set_config('request.jwt.claim.sub', reader_uid::text, true);
 if exists(select 1 from public.recipes where id = recipe) then raise exception 'Revocation failed'; end if;
 perform set_config('role', 'anon', true);
 begin
   perform 1 from public.recipes;
   raise exception 'Anonymous access allowed';
 exception when insufficient_privilege then null;
 end;
 perform set_config('role', 'postgres', true);
end
$test$;
rollback;

