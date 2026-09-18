-- Unspecified servings are stored as NULL; existing positive-value bounds still apply.
alter table public.recipes
  alter column servings drop not null,
  alter column servings drop default;
