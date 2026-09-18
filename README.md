# Shopping list

A private recipe and grocery workspace using Supabase Auth and PostgreSQL.

## Run

Run `start-site.cmd` on Windows, or `node local-server.js`. Open [Shopping list](http://127.0.0.1:4173/index.html). Restart a previously running server after updating. Use HTTP localhost or HTTPS hosting rather than opening the HTML as a file.

The browser configuration in `supabase-config.js` points to project `gsxjvjrzcqlldfgdzsjm` and contains only the public publishable key. Never put secret or service-role keys in frontend files. The local server serves only public assets, excluding environment files and Git/database files.

## Accounts and email links

Create an account, confirm your email, then sign in. Existing Supabase accounts can sign in immediately. Sign-in, session persistence/refresh, sign-out, password recovery, and account email/password changes use Supabase JS SDK 2.57.4.

In [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/gsxjvjrzcqlldfgdzsjm/auth/url-configuration), allow `http://127.0.0.1:4173/index.html` as a redirect URL. Add your actual HTTPS URL when hosting. The app passes its current origin and path for email links; Supabase must allow that destination. Keep email confirmation enabled for email-based sharing.

Email redirect settings and delivery were not changed or tested by this implementation. Password reset links open a new-password form. Email changes remain pending until Supabase's confirmation requirements are met.

## Existing local recipes

Local prototype accounts are separate from Supabase accounts. Create a Supabase account using the same email as the old local account. In the same browser and origin used by the prototype, open Profile and choose **Import local recipes and lists**.

Import copies only records owned by the confirmed signed-in email. It keeps ingredients, checked items, and shares, generates stable UUIDs, and skips records already imported. Original browser data remains untouched; passwords and password hashes are never copied. Custom standard-item preferences from the prototype are not imported. If the button is absent, that browser/origin has no matching local records.

## Saving and sharing

Recipes, lists, ingredients, grocery items, sharing, remembered tags, and standard-item preferences are stored in Supabase. Owners edit; recipients with matching confirmed email addresses view. Adding an email grants access but does not send an invitation email.

Each save is an atomic transaction under Row Level Security. Only changed records are sent. Record versions reject stale writes from another browser. **Download unsaved changes** preserves a failed draft as JSON. Refresh cloud data before retrying a conflict. A connection is required to save; offline edits are not queued.

Use **Refresh cloud data** in Profile to see other-device changes or new shares. Data also loads at sign-in and page reload; there is no live push subscription.

## Verification

- `node --test tests/cloud-store.test.js`: mapping, scoped deterministic import, and changed-record detection.
- `node tests/browser-smoke.js`: requires Playwright and Edge; set `PLAYWRIGHT_PATH` if Playwright is outside node_modules. Uses mocked Supabase HTTP responses to test the SDK and UI without sending email or retaining accounts.
- `supabase/tests/cloud_operations.sql`: live database transaction test for persistence, atomic rollback, stale writes, shared-reader restrictions, anonymous denial, and cascading deletion. Rolls back all test data.

Database and browser tests passed. Supabase security advisors reported no findings. Actual email delivery and login with your confirmed account remain to be exercised.
