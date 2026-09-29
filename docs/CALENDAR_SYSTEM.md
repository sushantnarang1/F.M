# Public calendar and website deployment

## Current status

The static event-list renderer, public-calendar API synchronizer, and GitHub Pages deployment workflow are implemented. No Lodge calendar, API key, GitHub Pages domain, or GitHub Actions run has yet been configured or verified. The local `data/events.json` is intentionally empty until a public calendar is configured.

## Calendar separation and ownership

Use the Lodge Google account as the owner of two distinct calendars:

1. **Copestone-Ophir — Public Events** — public-read event information; used for the website and event sync.
2. **Copestone-Ophir — Private Lodge Calendar** — private; never use its ID in `site-config.js`, GitHub variables, calendar API sync, public iframe, or website code.

Website access is limited to the public calendar ID and a Google Calendar API key stored as a GitHub Actions secret. The API key is restricted to the Google Calendar API; the sync requests data only for the public calendar ID. The website receives a static feed containing public event fields only—not attendee lists, owners, or private-calendar information.

## Create the calendars

1. Sign in to the Lodge Google account and create both calendars using the names above.
2. Open **Settings and sharing** for **Copestone-Ophir — Public Events**. Under access permissions for events, enable public access with the least-privileged setting that allows public event details to be shown. Review each event description/location before saving; a public calendar is public.
3. Do not enable public access on **Copestone-Ophir — Private Lodge Calendar**. Never copy its ID to this repository, GitHub, Cloudflare, or the public site.
4. Give an authorized officer edit access to the appropriate calendar through Google Calendar's **Share with specific people** controls. Revoke access when their Lodge role ends.
5. Copy only the **Public Events** calendar ID from its settings.
6. Create a Google Cloud project and enable **Google Calendar API**. Create an API key, restrict its API to Google Calendar API, and save it as the GitHub Actions secret `GOOGLE_CALENDAR_API_KEY`.
7. In **Repository Settings → Secrets and variables → Actions → Variables**, set `PUBLIC_CALENDAR_ID` to the public calendar ID. In Secrets, set `GOOGLE_CALENDAR_API_KEY` to the restricted key.
8. Set `publicCalendarId` in `site-config.js` to that same public ID if you want the optional embedded agenda. This ID is public by design; never enter the Private Calendar ID here.

No service account or OAuth account-wide calendar access is used by the public site. The read-only API key is used only by the scheduled workflow.

## Event administration

Future Lodge officers do routine event management in Google Calendar—not GitHub:

1. Sign in to the Lodge Google account (or an officer account with edit permission).
2. Select **Copestone-Ophir — Public Events**.
3. Create, edit, reschedule, or cancel an event there. Canceled items and events that have ended are omitted from the site feed.
4. Keep title, date/time, end time, public location, and any public description accurate. Do not add private meeting details, attendee information, internal notes, or sensitive personal data.
5. The website's list and homepage feed refresh on the next scheduled GitHub Pages calendar sync, every six hours. A GitHub Pages deployment also synchronizes the calendar. Google Calendar's own embedded agenda, if enabled, reads only the public calendar.
6. Visitors use the event's Google Calendar details link to view/add that actual event to their calendar. “Contact us about this event” pre-fills the Events reason and event name in the inquiry form.

The event list is chronological and mobile-first. All-day events use the calendar's exclusive end date; times on the website are displayed in Eastern time. Only approximately the first 400 upcoming events returned by the public calendar API are synchronized.

## GitHub Pages and GoDaddy

1. In the GitHub repository, go to **Settings → Pages** and choose **GitHub Actions** as the build/deployment source.
2. To enable event synchronization, configure the Actions secret `GOOGLE_CALENDAR_API_KEY` and repository variable `PUBLIC_CALENDAR_ID`. If those values are not set yet, Pages can still deploy and the website shows the empty-feed message.
3. Push the site to the repository's default `main` branch or run **Actions → Deploy website → Run workflow**. The scheduled refresh runs every six hours. Review the workflow summary/result before treating a deployment as live.
4. Add `copestoneophir108.com` as the Pages custom domain and follow GitHub's current verification and DNS instructions.
5. In GoDaddy DNS, add the exact records GitHub Pages instructs for the apex domain and/or `www`; remove conflicting parking/forwarding records only after confirming the record values. Do not guess or change mail-related MX records.
6. Wait for DNS propagation and GitHub Pages to issue HTTPS. Test the root page plus `/history/`, `/events/`, `/gallery/`, `/contact/`, and `/thank-you/` over HTTPS.
7. Test a new public test event, an edit, a reschedule, and a cancellation; allow up to six hours for the scheduled feed refresh, or manually trigger deployment to test sooner.

The project has no earlier deployment configuration and the Git remote contains no established site deployment in this workspace. Domain ownership alone does not mean GitHub Pages is already active.

## Troubleshooting

- Calendar workflow reports missing configuration: set `PUBLIC_CALENDAR_ID` as a repository **variable** and `GOOGLE_CALENDAR_API_KEY` as a repository **secret**.
- API returns forbidden/not found: confirm the public calendar's public-event permissions, exact ID, Calendar API enablement, key restriction, and that the ID is for **Public Events**, not the private calendar.
- Website still shows old information: run the Deploy website workflow manually and verify `data/events.json` in the deployed artifact. A cancellation, changed event end time, or no-longer-upcoming event is removed on the next successful sync.
- Public calendar details appear too private: immediately edit the event/calendar visibility in Google Calendar and verify the website feed. Do not put sensitive information in public calendar entries.
- Officer needs access: have a current calendar owner share the relevant calendar with their Google account using the minimum role required; no code or GitHub access is needed for routine event management.
- Pages deployment fails: configure GitHub Pages to use Actions, verify workflow permissions, ensure the calendar secret/variable exist, and inspect the sanitized workflow error. Never print or paste the API key into an issue or log.
