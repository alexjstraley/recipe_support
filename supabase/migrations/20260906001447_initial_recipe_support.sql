-- Initial Recipe Support schema. Shared access is read-only.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.recipes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (btrim(title) <> ''),
 servings numeric not null default 4 check (servings > 0),
 instructions text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.grocery_lists (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (btrim(name) <> ''),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.recipe_ingredients (
 id uuid primary key default gen_random_uuid(),
 recipe_id uuid not null references public.recipes(id) on delete cascade,
 name text not null check (btrim(name) <> ''),
 quantity text not null default '',
 tag text not null default '',
 position integer not null default 0 check (position >= 0),
 
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id);
create table public.grocery_items (
 id uuid primary key default gen_random_uuid(),
 grocery_list_id uuid not null references public.grocery_lists(id) on delete cascade,
 name text not null check (btrim(name) <> ''),
 quantity text not null default '',
 tag text not null default '',
 position integer not null default 0 check (position >= 0),
 checked boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index grocery_items_grocery_list_id_idx on public.grocery_items(grocery_list_id);
create table public.recipe_shares (
 recipe_id uuid not null references public.recipes(id) on delete cascade,
 email text not null check (email = lower(btrim(email)) and email <> '' and position('@' in email) > 1),
 created_at timestamptz not null default now(),
 primary key (recipe_id, email)
);
create index recipe_shares_email_idx on public.recipe_shares(email);
create table public.grocery_list_shares (
 grocery_list_id uuid not null references public.grocery_lists(id) on delete cascade,
 email text not null check (email = lower(btrim(email)) and email <> '' and position('@' in email) > 1),
 created_at timestamptz not null default now(),
 primary key (grocery_list_id, email)
);
create index grocery_list_shares_email_idx on public.grocery_list_shares(email);
create table public.user_item_tags (
 user_id uuid not null references auth.users(id) on delete cascade,
 item_name text not null check (item_name = lower(btrim(item_name)) and item_name <> ''),
 tag text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (user_id, item_name)
);
create function private.verified_email() returns text
language sql stable security definer set search_path = ''
as $$ select lower(email) from auth.users where id = (select auth.uid()) and email_confirmed_at is not null $$;
revoke all on function private.verified_email() from public, anon;
grant execute on function private.verified_email() to authenticated;
create index recipes_owner_id_idx on public.recipes(owner_id);
create function private.owns_recipe(target_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.recipes where id = target_id and owner_id = (select auth.uid())) $$;
create function private.can_read_recipe(target_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.owns_recipe(target_id) or exists(select 1 from public.recipe_shares where recipe_id = target_id and email = (select private.verified_email())) $$;
revoke all on function private.owns_recipe(uuid), private.can_read_recipe(uuid) from public, anon;
grant execute on function private.owns_recipe(uuid), private.can_read_recipe(uuid) to authenticated;
create policy read_access on public.recipes for select to authenticated using (private.can_read_recipe(id));
create policy owner_insert on public.recipes for insert to authenticated with check (owner_id = (select auth.uid()));
create policy owner_update on public.recipes for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_delete on public.recipes for delete to authenticated using (owner_id = (select auth.uid()));
create policy read_access on public.recipe_ingredients for select to authenticated using (private.can_read_recipe(recipe_id));
create policy read_access on public.recipe_shares for select to authenticated using (private.owns_recipe(recipe_id) or email = (select private.verified_email()));
create policy owner_insert on public.recipe_ingredients for insert to authenticated with check (private.owns_recipe(recipe_id));
create policy owner_update on public.recipe_ingredients for update to authenticated using (private.owns_recipe(recipe_id)) with check (private.owns_recipe(recipe_id));
create policy owner_delete on public.recipe_ingredients for delete to authenticated using (private.owns_recipe(recipe_id));
create policy owner_insert on public.recipe_shares for insert to authenticated with check (private.owns_recipe(recipe_id));
create policy owner_update on public.recipe_shares for update to authenticated using (private.owns_recipe(recipe_id)) with check (private.owns_recipe(recipe_id));
create policy owner_delete on public.recipe_shares for delete to authenticated using (private.owns_recipe(recipe_id));
create index grocery_lists_owner_id_idx on public.grocery_lists(owner_id);
create function private.owns_grocery_list(target_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.grocery_lists where id = target_id and owner_id = (select auth.uid())) $$;
create function private.can_read_grocery_list(target_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.owns_grocery_list(target_id) or exists(select 1 from public.grocery_list_shares where grocery_list_id = target_id and email = (select private.verified_email())) $$;
revoke all on function private.owns_grocery_list(uuid), private.can_read_grocery_list(uuid) from public, anon;
grant execute on function private.owns_grocery_list(uuid), private.can_read_grocery_list(uuid) to authenticated;
create policy read_access on public.grocery_lists for select to authenticated using (private.can_read_grocery_list(id));
create policy owner_insert on public.grocery_lists for insert to authenticated with check (owner_id = (select auth.uid()));
create policy owner_update on public.grocery_lists for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_delete on public.grocery_lists for delete to authenticated using (owner_id = (select auth.uid()));
create policy read_access on public.grocery_items for select to authenticated using (private.can_read_grocery_list(grocery_list_id));
create policy read_access on public.grocery_list_shares for select to authenticated using (private.owns_grocery_list(grocery_list_id) or email = (select private.verified_email()));
create policy owner_insert on public.grocery_items for insert to authenticated with check (private.owns_grocery_list(grocery_list_id));
create policy owner_update on public.grocery_items for update to authenticated using (private.owns_grocery_list(grocery_list_id)) with check (private.owns_grocery_list(grocery_list_id));
create policy owner_delete on public.grocery_items for delete to authenticated using (private.owns_grocery_list(grocery_list_id));
create policy owner_insert on public.grocery_list_shares for insert to authenticated with check (private.owns_grocery_list(grocery_list_id));
create policy owner_update on public.grocery_list_shares for update to authenticated using (private.owns_grocery_list(grocery_list_id)) with check (private.owns_grocery_list(grocery_list_id));
create policy owner_delete on public.grocery_list_shares for delete to authenticated using (private.owns_grocery_list(grocery_list_id));
create policy personal_access on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy personal_access on public.user_item_tags for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create function private.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
revoke all on function private.set_updated_at() from public, anon, authenticated;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
create trigger set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
alter table public.recipes enable row level security;
revoke all on public.recipes from anon, authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant all on public.recipes to service_role;
create trigger set_updated_at before update on public.recipes for each row execute function private.set_updated_at();
alter table public.recipe_ingredients enable row level security;
revoke all on public.recipe_ingredients from anon, authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant all on public.recipe_ingredients to service_role;
create trigger set_updated_at before update on public.recipe_ingredients for each row execute function private.set_updated_at();
alter table public.grocery_lists enable row level security;
revoke all on public.grocery_lists from anon, authenticated;
grant select, insert, update, delete on public.grocery_lists to authenticated;
grant all on public.grocery_lists to service_role;
create trigger set_updated_at before update on public.grocery_lists for each row execute function private.set_updated_at();
alter table public.grocery_items enable row level security;
revoke all on public.grocery_items from anon, authenticated;
grant select, insert, update, delete on public.grocery_items to authenticated;
grant all on public.grocery_items to service_role;
create trigger set_updated_at before update on public.grocery_items for each row execute function private.set_updated_at();
alter table public.recipe_shares enable row level security;
revoke all on public.recipe_shares from anon, authenticated;
grant select, insert, update, delete on public.recipe_shares to authenticated;
grant all on public.recipe_shares to service_role;
alter table public.grocery_list_shares enable row level security;
revoke all on public.grocery_list_shares from anon, authenticated;
grant select, insert, update, delete on public.grocery_list_shares to authenticated;
grant all on public.grocery_list_shares to service_role;
alter table public.user_item_tags enable row level security;
revoke all on public.user_item_tags from anon, authenticated;
grant select, insert, update, delete on public.user_item_tags to authenticated;
grant all on public.user_item_tags to service_role;
create trigger set_updated_at before update on public.user_item_tags for each row execute function private.set_updated_at();

