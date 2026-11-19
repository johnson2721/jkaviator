# Vercel preview setup

1. Rotate the operator and payment credentials from the original archive. The archive was removed from the current tree, but remains in Git history.
2. Provision a dedicated PostgreSQL database you control (for example, Neon through Vercel Marketplace). Configure its connection string as a sensitive `DATABASE_URL` variable for Preview in Vercel. Use a test database, not a production wallet database.
3. From a trusted environment with that same test database URL set, run `npm ci` and `npx drizzle-kit push` to initialize the schema. Review the schema changes before applying them.
4. Generate a fresh `SESSION_SECRET` with `openssl rand -hex 32` and store it as a sensitive Preview variable. Set `ADMIN_PHONE` and `ADMIN_PASSWORD` only if operator access is needed. Keep `PAYHERO_ENABLED` and `PAYHERO_FALLBACK_SANDBOX` unset or false. Configure `AT_USERNAME`, `AT_API_KEY`, and optionally `AT_SENDER_ID` if testing SMS verification.
5. Deploy this branch to a protected Vercel preview using the Next.js preset. Verify `/api/health` and test auth and gameplay against the test database before exposing the site publicly.
