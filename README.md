# NMCC Youth Activities Calendar

Mobile-friendly public calendar and single-administrator event manager using Cloudflare Workers + D1. The root now contains the editable source project; the original ZIP is retained as historical input.

## Status
- Source implementation: Worker API, public read-only calendar, admin sign-in, event CRUD/publishing, D1 migration, UTC cron, generated-notification log, and unit tests.
- Authentication: PBKDF2-SHA256 with per-password random salt; random session cookie is HttpOnly, Secure and SameSite=Strict; only its SHA-256 hash is stored. No public administrator registration.
- Reminders: Cron `0 5 * * *` UTC = 07:00 in `Africa/Johannesburg` (SAST). Daily reminder (today/tomorrow, omitted when empty), Monday preview of all published events on the current week's Saturday (empty Saturday gets an explicit preview), and agenda for published, non-cancelled meetings today. `UNIQUE(job, report_date)` makes execution idempotent.
- Delivery: deliberately disabled (`NOTIFY_PROVIDER=none`). The UI accurately labels generated messages; no message is sent until a provider, recipient policy, and credentials are selected and verified.
- Recovery: export via Wrangler to a private location; rehearse import/restore on a separate D1 database before production. Restoration is account-owner CLI only at this stage, not a public API feature.

## Setup / local testing
Requires Node.js 20+ and an authorised Cloudflare account.

```sh
npm install
npm test
npx wrangler d1 migrations apply youth-calendar --local
npm run dev
```

## Production provisioning
1. Create the D1 database (already provisioned for this project): `youth-calendar`, ID `852cdbbe-24c1-4064-ac08-4efef4612c2b`.
2. Apply migration: `npx wrangler d1 migrations apply youth-calendar --remote`.
3. Create the first administrator without committing credentials:
   ```sh
   ADMIN_PASSWORD='use-a-unique-passphrase-of-12-or-more-characters' node scripts/make-admin.mjs admin@example.org
   npx wrangler d1 execute youth-calendar --remote --command "<paste the SQL printed by the script>"
   ```
4. Deploy with `npx wrangler deploy`; check the deployed URL, public event API, admin login, D1 binding and Cron schedule. No default admin/password exists.
5. Add login rate limiting at Cloudflare edge before wider public use. The login endpoint has a D1-backed throttle as a follow-up hardening item if edge rate limiting is unavailable.

## Backup / restore
- Export: `npx wrangler d1 export youth-calendar --remote --output ./backup-YYYY-MM-DD.sql`.
- Store the export outside Git in a private, access-controlled location; retain a dated copy and periodically test it.
- Rehearse against a separate database: create `youth-calendar-restore-test`, import the SQL into it, and compare table/row counts and event samples.
- Production restore is a destructive account-owner operation. Take a fresh export first, confirm the target database name/ID, use Wrangler D1 import/restore commands appropriate to the chosen recovery point, then verify tables and representative rows. Cloudflare D1 Time Travel retention depends on plan; confirm current dashboard/official docs before relying on it.
- Backup files are not exposed by application routes. The in-app destructive restore UI is not implemented; the admin page points to the account-owner CLI process.

## Cost and known limits
The design uses Cloudflare Workers, D1 and Cron with no external backend or notification dependency. Free tiers have usage ceilings; D1 free-tier overages can block queries until reset, and limits/pricing can change. Verify current account limits and usage before production. Email delivery, automated off-account backup storage, edge login rate-limiting rules, and a rehearsed production recovery are not yet configured or verified.

## Important implementation boundaries
- Public API returns only published, non-cancelled events and supports date filtering.
- All admin API endpoints validate a server-side session; client UI controls are not authorization.
- All event SQL uses bound parameters; event text is escaped before rendering.
- No database is dropped and no existing production rows are deleted by the source changes.
