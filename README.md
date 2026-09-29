# Copestone-Ophir Lodge No. 108

A mobile-first static website and public historical archive for Copestone-Ophir Lodge No. 108, Free & Accepted Masons, at 225 Kearny Avenue, Kearny, New Jersey 07032.

## Project structure

- `index.html`, `history/`, `events/`, `gallery/`, `contact/`, and `thank-you/` are static pages; CSS and JavaScript live at the repository root.
- `assets/` contains optimized web copies of the supplied Masonic illustration, lodge photograph, lodge emblem detail, Grand Lodge of New Jersey seal, and Great 8th Masonic District emblem; `assets/originals/` preserves the original uploaded files in the repository, and originals are excluded from the public deployment. Captions intentionally identify unknown dates and context.
- `data/events.json` is a public-only event feed refreshed by the GitHub Pages workflow.
- `cloudflare-worker/` validates form submissions, checks Cloudflare Turnstile, and passes accepted inquiries to Apps Script.
- `apps-script/Code.gs` stores inquiries in a private Google Sheet and sends private email notifications.
- `scripts/weekly_inquiry_report.py` reads the private sheet with read-only service-account access and sends a weekly report through Apps Script.
- `scripts/sync_public_calendar.py` reads only the configured public Google Calendar.
- `.github/workflows/` publishes the static website and sends the Thursday inquiry report.

This repository has no application framework, package manager, database server, or existing server-side application. Local preview: `python3 -m http.server 8000`, then open `http://localhost:8000`.

## Architecture

The public website is static HTML/CSS/JavaScript and is intended for GitHub Pages. The browser never receives Google credentials or access to a private calendar or Sheet. The contact form sends through a Cloudflare Worker (free tier, `workers.dev` endpoint) for origin checks, server-side validation, and Turnstile verification; the Worker calls a Google Apps Script web app, which runs as the Lodge Google account and writes immediately to the private inquiry Sheet. A separate GitHub Actions service account has read-only access to that Sheet for reporting only.

The public calendar sync uses a restricted Google Calendar API key in a scheduled GitHub Action and reads only `PUBLIC_CALENDAR_ID`. The private lodge calendar is never used by the site, Worker, or sync script.

**External integrations are implemented as source code and configuration points, but are not live until the setup in `docs/INQUIRY_SYSTEM.md` and `docs/CALENDAR_SYSTEM.md` is complete.** No credentials, real Google resources, or live inquiries have been configured or tested.

## Required configuration

See:

- [Inquiry system setup](docs/INQUIRY_SYSTEM.md)
- [Calendar and deployment setup](docs/CALENDAR_SYSTEM.md)

In short, configuration requires a Lodge-owned Google account, a private Sheet, a public Calendar, a Google Cloud project and read-only service account, a Cloudflare Turnstile widget, a deployed Cloudflare Worker, Apps Script properties, and GitHub Actions secrets/variables. GitHub Pages may deploy the site before the integrations are configured; until then the event list is empty and the online form directs visitors to email/phone. The GoDaddy domain must be pointed to Pages before the site is public.

## Historical accuracy

The original charter date of Copestone Lodge No. 147 and the consolidation date involving Ophir Lodge No. 108 are explicitly unresolved. The year 1916 refers to the Temple's construction; the June 1941 record is not a lodge founding date. Direct archival citations were not included with the research summary, so the History page identifies the supplied source types and marks direct references for verification instead of inventing source URLs.

## Validation

Run the static checks and tests:

```sh
python3 -m unittest discover -s tests -v
node --check script.js
node --check cloudflare-worker/src/index.js
node tests/test_cloudflare_worker.mjs
node tests/test_google_apps_script.mjs
```

The deployment workflows require the external configuration described in the docs. They cannot be considered operational until a successful Actions deployment and real authorized Google/Turnstile tests are observed.
