# Supabase database

The initial schema and internal trigger hardening migrations were applied through Supabase MCP to project `gsxjvjrzcqlldfgdzsjm`. Local migration versions match the remote migration history.

All eight public tables use Row Level Security. Authenticated owners manage recipes, lists, children, and sharing. Recipients can read shared records using their current confirmed Supabase Auth email; sharing emails must be trimmed and lowercase. Recipients cannot edit or see other recipients. Profiles and item tags are private to their user. Signed-out clients have no table privileges.

Profiles use the Supabase Auth user ID and are created on the first preference save. Quantities remain text to preserve entries such as `1/2 cup`. Item names in user_item_tags must be trimmed and lowercase. Parent deletion cascades to children and shares. Updated timestamps are maintained by database triggers.

The cloud_workspace_operations migration adds profile preferences and load_workspace/save_workspace RPCs. Both use SECURITY INVOKER and the caller's RLS policies. Saves apply supplied changes in one transaction and check updated_at versions before updates/deletes. The frontend uses these operations with Supabase Auth. Prototype records can be copied with the explicit local import action.

`tests/initial_schema_rls.sql` passed against the empty remote schema using temporary users and data inside a rolled-back transaction. It checks owner access, shared reads, denied shared edits, unrelated-user isolation, owner impersonation prevention, share revocation, and anonymous access denial. Run only against an empty development database: its row-count assertions assume no existing application data. No test users or records are retained. Supabase security advisors returned no findings after hardening.
