#!/usr/bin/env python3
"""Build a static, public-only event feed from the Lodge's public Calendar."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


FIELDS = "items(id,summary,start,end,location,description,htmlLink,status,visibility),nextPageToken"


def fetch_events(calendar_id: str, api_key: str, now: datetime) -> list[dict]:
    params = {
        "key": api_key,
        "timeMin": now.isoformat(timespec="seconds"),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": "100",
        "showDeleted": "false",
        "fields": FIELDS,
    }
    base_url = "https://www.googleapis.com/calendar/v3/calendars/"
    url = base_url + urllib.parse.quote(calendar_id, safe="") + "/events?" + urllib.parse.urlencode(params)
    events: list[dict] = []
    while url and len(events) < 400:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.load(response)
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            raise RuntimeError("Unable to retrieve the public events calendar.") from error

        if not isinstance(payload, dict) or not isinstance(payload.get("items", []), list):
            raise RuntimeError("The public calendar returned an invalid response.")
        for item in payload.get("items", []):
            if item.get("status") == "cancelled" or item.get("visibility") in {"private", "confidential"}:
                continue
            start_value = item.get("start", {})
            end_value = item.get("end", {})
            start = start_value.get("dateTime") or start_value.get("date")
            end = end_value.get("dateTime") or end_value.get("date")
            title = item.get("summary")
            if not start or not end or not isinstance(title, str) or not title.strip():
                continue
            event = {
                "id": str(item.get("id", ""))[:256],
                "title": title.strip()[:200],
                "start": start,
                "end": end,
                "allDay": "date" in start_value and "dateTime" not in start_value,
                "location": str(item.get("location", ""))[:300],
                "description": str(item.get("description", ""))[:2500],
                "htmlLink": str(item.get("htmlLink", ""))[:1000],
            }
            events.append(event)
        page_token = payload.get("nextPageToken")
        if page_token and len(events) < 400:
            params["pageToken"] = page_token
            url = base_url + urllib.parse.quote(calendar_id, safe="") + "/events?" + urllib.parse.urlencode(params)
        else:
            url = ""
    return events


def main() -> int:
    calendar_id = os.environ.get("PUBLIC_CALENDAR_ID", "").strip()
    api_key = os.environ.get("GOOGLE_CALENDAR_API_KEY", "").strip()
    if not calendar_id or not api_key:
        print("Calendar sync requires PUBLIC_CALENDAR_ID and GOOGLE_CALENDAR_API_KEY.")
        return 1
    try:
        events = fetch_events(calendar_id, api_key, datetime.now(timezone.utc))
        output = {
            "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "events": events,
        }
        path = Path("data/events.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except RuntimeError as error:
        print(str(error))
        return 1
    print(f"Public calendar synchronized: {len(events)} upcoming event(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
