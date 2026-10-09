# NMCC Youth Activities Calendar

Mobile-friendly public calendar and single-administrator event manager using Cloudflare Workers + D1. The root now contains the editable source project; the original ZIP is retained as historical input.

## Status
- Source implementation: Worker API, public read-only calendar, admin sign-in, event CRUD/publishing, D1 migration, UTC cron, generated-notification log, and unit tests.
- Authentication: PBKDF2-SHA256 with per-password random salt; random session cookie is HttpOnly, Secure and SameSite=Strict; only its SHA-256 hash is stored. No public administrator registration.
- Reminders: Cron `0 5 * * *` UTC = 07:00 in `Africa/Johannesburg` (SAST). Daily reminder (today/tomorrow, omitted when empty), Monday preview of all published events on the current week's Saturday (empty Saturday gets an explicit preview), and agenda for published, non-cancelled meetings today. `UNIQUE(job, report_date)` makes execution idempotent.
- Delivery: an optional WhatsApp Cloud API adapter supports approved template messages to each configured recipient. It remains disabled until Meta credentials/template approval and an explicit Worker config switch are provided. Per-recipient delivery status and retry support are included.
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

1. Confirm the remote database migration list before applying new migrations. The phone-role and delivery-tracking schema are included in `migrations/`.
2. Install dependencies and provision the two initial phone-based accounts from a trusted machine. The password is entered hidden in the terminal; the script prints SQL containing only a PBKDF2 hash, not the password. For the requested phone-plus-name format, enter each person's password as their phone number without the leading `+`, followed by `@`, followed by their name without spaces.
   
   Administrator:
   ```sh
   read -rsp "Administrator password: " ADMIN_PASSWORD; echo
   read -rp "Administrator phone (+268 plus 8 digits): " ADMIN_PHONE
read -rp "Administrator name: " ADMIN_NAME
ADMIN_PASSWORD="$ADMIN_PASSWORD" node scripts/make-admin.mjs "$ADMIN_PHONE" "$ADMIN_NAME" administrator > /tmp/nmcc-admin.sql
   unset ADMIN_PASSWORD
   npx wrangler d1 execute youth-calendar --remote --command "$(cat /tmp/nmcc-admin.sql)"
   rm -f /tmp/nmcc-admin.sql
   ```
   
   Organiser:
   ```sh
   read -rsp "Organiser password: " ADMIN_PASSWORD; echo
   read -rp "Organiser phone (+268 plus 8 digits): " ORGANISER_PHONE
read -rp "Organiser name: " ORGANISER_NAME
ADMIN_PASSWORD="$ADMIN_PASSWORD" node scripts/make-admin.mjs "$ORGANISER_PHONE" "$ORGANISER_NAME" organiser > /tmp/nmcc-organiser.sql
   unset ADMIN_PASSWORD
   npx wrangler d1 execute youth-calendar --remote --command "$(cat /tmp/nmcc-organiser.sql)"
   rm -f /tmp/nmcc-organiser.sql
   ```
3. The first account must have role `administrator`; it can then add/deactivate organisers from the web UI. Verify each phone number before running provisioning, and never commit the temporary SQL files.
4. Check the deployed URL, `/api/events`, login, D1 binding and Cron schedule. The application must have at least one account with the `administrator` role before protected event-management screens can be used.

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

## Outlook availability suggestions

From the authorised calendar editor, upload an Outlook `.ics` export under **Use your Outlook free dates**. The browser reads only all-day calendar entries whose summary is exactly `Free`, deduplicates their dates, and lets the organiser select one to prefill the activity date field. The file is processed locally in the browser; availability dates are not uploaded, saved to D1, published to the public calendar, or turned into activities automatically. Reloading the editor clears the imported suggestions, so upload the file again when needed.

## WhatsApp reminder delivery

The Worker contains an opt-in WhatsApp Cloud API adapter. It remains disabled until the account owner supplies valid Meta WhatsApp Business Platform configuration. A scheduled run at 07:00 Eswatini/SAST time prepares reminders for events today and tomorrow; Monday also generates the Saturday preview. The daily reminder is delivered to each configured recipient.

### Meta setup required once

1. In Meta for Developers, create/use an app with the WhatsApp product and connect a WhatsApp Business Account and a sending phone number. Record the **Phone Number ID** and generate a production access token with the permissions required by the current Meta Cloud API.
2. Create and get approval for a Utility message template called `nmcc_youth_activity_reminder` in English (US). Its **body must contain exactly two text variables**:
   ```
   Ngculwini Miracle Centre — Youth Activities Calendar
   {{1}}

   {{2}}

   This is an automated calendar reminder. Please check the calendar for updates.
   ```
   The first variable is the reminder subject and the second is the reminder details. The template name and language must match the approved template exactly. Meta approval, recipient opt-in and applicable WhatsApp policies are required.
3. Add these as **Worker secrets** (never commit them): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`, and `WHATSAPP_RECIPIENTS`. For `WHATSAPP_RECIPIENTS`, use comma-separated full international numbers in digits-only format, including the country code. Verify that both numbers are correct and WhatsApp-enabled before activating delivery.
4. Set the Worker plain-text variable `NOTIFY_PROVIDER` to `whatsapp_cloud_api`, then run one controlled test from the account owner's secure environment. Check the notification log and Meta message status before relying on production reminders.

The code records each recipient's result separately and retries failed/generated notification runs on the next scheduled execution. A status of `sent` means Meta accepted the API request, not that the recipient's handset has confirmed delivery.
