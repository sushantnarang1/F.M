# Inquiry system operations

## Current status

The static form, Cloudflare Worker, Apps Script Sheet writer, email notifications, and scheduled report code are implemented. The service is **not live or tested against a Lodge Google account**. Do not collect public inquiries until configuration, authorization, and an end-to-end test are complete. Until then, visitors can use the published Lodge email and phone.

## Flow and data boundaries

1. A visitor selects Individual or Organization and submits the accessible contact form.
2. The browser posts to the configured Cloudflare Worker. It does not connect to Google directly.
3. The Worker checks the allowed website origin, field lengths/types/reasons, a hidden honeypot, and Cloudflare Turnstile server-side. It forwards accepted inquiries to Apps Script using a shared private token.
4. Apps Script revalidates the fields, takes a short script lock, appends the inquiry immediately to the private `All Inquiries` sheet, assigns an ID, and sets status to `NEW`.
5. Apps Script emails the configured Lodge inbox. The message is private and includes the visitor's contact details so an officer can reply.
6. Each Thursday, GitHub Actions reads the Sheet using a dedicated service account with **Viewer** access only. It generates a private email report through Apps Script. Its console output and GitHub job summary contain counts only.

The sheet stores: Inquiry ID, Timestamp, Inquiry Type, Name, Organization, Organization Type, Email, Phone, Reason, Related Event, Message, Status, Assigned To, Internal Notes. Only normal administration occurs in Sheets; no officer needs GitHub for inquiry management.

## Google Sheet and account configuration

1. Sign in to the Lodge Google account; **do not share its password**.
2. Create a Google Sheet named `Copestone-Ophir Lodge — Inquiry Management`.
3. Create a tab named `All Inquiries`. The one-time `authorizeLodgeServices` setup helper creates the header row if it is missing; the header sequence is defined in `apps-script/Code.gs`.
4. Keep the Sheet restricted. Share it only with current Lodge officers who need access and, after creating it below, the report service-account email as **Viewer**. Never publish the Sheet to the web.
5. Record the Sheet ID from its URL (`/spreadsheets/d/<ID>/edit`) for Apps Script and GitHub Actions.
6. Use the Lodge Google account as Apps Script owner. In script.google.com, create a project and paste `apps-script/Code.gs`.
7. In **Project Settings → Script properties**, set:
   - `INQUIRY_SHEET_ID` — private Sheet ID.
   - `INQUIRY_NOTIFICATION_EMAIL` — Lodge inbox for immediate inquiry notifications.
   - `INQUIRY_REPORT_RECIPIENT` — configurable Lodge inbox for weekly reports.
   - `INQUIRY_API_TOKEN` — random secret shared only with the Cloudflare Worker.
   - `WEEKLY_REPORT_TOKEN` — a separate random secret shared only with GitHub Actions.
8. Generate both tokens with a password manager or `openssl rand -hex 32`. Do not put them in source code or browser configuration.
9. In the Apps Script editor, run `authorizeLodgeServices` once and grant only the displayed Sheet and Mail permissions to the Lodge account. Then deploy **Deploy → New deployment → Web app**, execute as the Lodge account, and restrict access to anyone because the Worker must call the endpoint. The script validates a secret token before either operation. Store the resulting `/exec` URL privately.
10. Keep this Apps Script URL/token private; do not publish it in HTML, a README, or GitHub logs.

## Cloudflare Worker and spam prevention

1. Create a free Cloudflare account and install Wrangler locally (not in the website browser).
2. Set `ALLOWED_ORIGIN` in `cloudflare-worker/wrangler.toml` to the exact production origin, `https://copestoneophir108.com`. Add `http://localhost:8000` only to a development Worker if you need local testing; remove it for production.
3. Deploy from the repository root: `npx wrangler@4 deploy --config cloudflare-worker/wrangler.toml`. Note the resulting `workers.dev` URL.
4. Add Worker secrets with `npx wrangler secret put INQUIRY_SCRIPT_URL`, `npx wrangler secret put APPS_SCRIPT_TOKEN`, and `npx wrangler secret put TURNSTILE_SECRET_KEY`. Paste values interactively; do not put them in shell command arguments or terminal logs.
5. In Cloudflare Turnstile, create a Managed widget restricted to `copestoneophir108.com`. Put its public site key in `site-config.js` as `turnstileSiteKey`.
6. Set `inquiryApiUrl` in `site-config.js` to the Worker URL. These two values are public configuration, not secrets. Deploy the website again.

Turnstile plus the honeypot provide lightweight bot filtering; Apps Script also suppresses rapid repeat submissions from the same email address for 15 minutes. This is not a per-IP quota system. Turnstile must be configured before enabling the online form. The Worker checks origin and validates all incoming values; Apps Script independently checks authorization and required fields. Visitor data is never printed to the Worker or workflow logs.

## Inquiry categories and privacy

Individual reasons: Interested in Freemasonry; Visiting the Lodge; Lodge History / Historical Research; Events; Community Involvement; Historical Photograph or Document; Other.

Organization reasons: Community Partnership; Event Collaboration; Venue / Lodge Inquiry; Historical Research; Media / Press; Charitable or Civic Initiative; Masonic Organization; Other.

Historical reasons are internally treated and reported as historical archive inquiries. Event inquiries include the selected event name in `Related Event`. Historical material remains a private inquiry until an officer reviews and explicitly approves it for publication.

File attachments are **not enabled**. The current backend stores inquiry text only; it does not store files in the public repository. People with photographs/documents should contact the Lodge Secretary to arrange a private submission. Before accepting uploads, the Lodge should configure a restricted Google Drive archive folder, access/retention policy, file scanning and file-size limits.

## Officer workflow

Officers open the private Sheet and update the `Status` cell to `NEW`, `CONTACTED`, `FOLLOW-UP`, or `CLOSED`; they may fill `Assigned To` and `Internal Notes`. Do not put internal notes, messages, email addresses, or phone numbers in public web content. Add or remove officer Sheet permissions in Google Drive as officers change.

## Notifications and weekly report

Immediate email subject: `New Copestone-Ophir Inquiry — [CATEGORY]`. It includes the inquiry ID, type, name, organization when relevant, reason, timestamp, and visitor contact details/message. Delivery uses Google Apps Script `MailApp` from the Lodge-owned account. If notification email fails after the Sheet append, the inquiry remains stored; the script records only a non-sensitive failure note in its execution log.

GitHub Actions runs every Thursday at `14:00 UTC` (**10:00 AM Eastern during EDT; 9:00 AM during EST**). It reports the previous seven days, category totals, inquiry IDs, names/organizations, dates, status totals, and the number of historical inquiries by private email. It does not include email addresses, phone numbers, message text, or internal notes. No-inquiry weeks are emailed as a successful report and do not fail the workflow. The Actions job summary contains aggregate counts only.

To run a test/report manually: repository → **Actions → Weekly inquiry report → Run workflow**. To change the report recipient, update `INQUIRY_REPORT_RECIPIENT` in Apps Script Script properties. The report workflow does not need to change.

## GitHub Actions secrets

Add these in **Repository Settings → Secrets and variables → Actions → Secrets**:

| Secret | Value |
|---|---|
| `INQUIRY_SHEET_ID` | The private inquiry Sheet ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service-account JSON key for the read-only reporting identity |
| `REPORT_WEBHOOK_URL` | The deployed Apps Script `/exec` URL |
| `REPORT_WEBHOOK_TOKEN` | Same random value as Apps Script `WEEKLY_REPORT_TOKEN` |

The Apps Script `INQUIRY_API_TOKEN` is entered only as the Cloudflare Worker secret `APPS_SCRIPT_TOKEN`, not as a GitHub secret. The public site key and Worker URL are set in `site-config.js`; the Turnstile secret exists only in the Worker.

### Read-only reporting service account

1. In Google Cloud Console, create/select a project and enable **Google Sheets API**.
2. Create a service account for weekly reporting and a JSON key. Store the JSON contents only as `GOOGLE_SERVICE_ACCOUNT_JSON` in GitHub Actions Secrets.
3. Share the private inquiry Sheet with the service account's `client_email` as **Viewer**, never Editor.
4. Do not enable Domain-Wide Delegation or Gmail access. This identity only reads the inquiry sheet; weekly mail is sent by the Lodge-owned Apps Script.
5. Rotate/revoke the JSON key if it is ever exposed. Never commit it.

## Troubleshooting

- Form reports service unavailable: check Worker deployment, `ALLOWED_ORIGIN`, Worker secrets, Apps Script deployment URL, and Turnstile domain/widget keys. Review Cloudflare/Apps Script execution logs without copying inquiry data into public issues.
- Sheet row absent: confirm `INQUIRY_SHEET_ID`, the `All Inquiries` tab, Apps Script authorization, web-app deployment version, and `INQUIRY_API_TOKEN` match.
- Row stored but immediate email absent: check `INQUIRY_NOTIFICATION_EMAIL`, Apps Script Mail quota/authorization, and the Lodge inbox's spam folder. The Sheet remains the record of truth.
- Weekly workflow fails: check all four Actions secrets; confirm service-account JSON is valid, the Sheet is shared Viewer to that service account, Google Sheets API is enabled, and the Apps Script report token matches.
- Weekly email absent: check `INQUIRY_REPORT_RECIPIENT`, Apps Script authorization and daily MailApp quota, `REPORT_WEBHOOK_URL`, and `REPORT_WEBHOOK_TOKEN`.
- Actions job summaries and standard output must remain aggregate-only. Do not add raw row dumps or enable debug logging around personal data.
