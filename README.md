# Recipe Support

A dependency-free first version of a private recipe and grocery-list workspace.

## What is included

- Account creation and sign in for a local browser prototype
- Password hashing with Web Crypto PBKDF2 before storing local demo credentials
- Personal recipes with ingredients, instructions, servings, and shared emails
- Grocery lists created manually or populated from recipe ingredients
- Owner-only editing and deletion checks in the interface
- Shared views based on specified collaborator email addresses
- JSON export for a signed-in user's accessible data
- A production security checklist inside the app

## Run it

Open `index.html` in a browser. No build step is required.

## Production notes

This prototype keeps data in browser storage so the product flow is easy to test locally. A production version should move authentication, authorization, and storage to a backend service.

Recommended production foundation:

- Managed authentication with verified email, MFA, secure cookies, session rotation, and password reset flows
- Server-side permission checks for every recipe, list, item, and sharing request
- Database tables for users, recipes, recipe shares, grocery lists, grocery shares, and grocery items
- Row-level ownership rules and audit logs for sharing changes
- HTTPS only, strict content security policy, CSRF protection, rate limiting, and encrypted backups
