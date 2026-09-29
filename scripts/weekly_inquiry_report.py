#!/usr/bin/env python3
"""Create a private weekly report from the inquiry Sheet without logging PII."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo



SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
SHEET_RANGE = "'All Inquiries'!A:M"
LOCAL_ZONE = ZoneInfo("America/New_York")
HISTORICAL_REASONS = {
    "lodge history / historical research",
    "historical photograph or document",
    "historical research",
}


def sheets_rows(sheet_id: str, service_account_json: str) -> list[list[str]]:
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        info = json.loads(service_account_json)
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=[SCOPE]
        )
        credentials.refresh(Request())
        query = urllib.parse.urlencode({"valueRenderOption": "FORMATTED_VALUE"})
        range_path = urllib.parse.quote(SHEET_RANGE, safe="")
        url = (
            "https://sheets.googleapis.com/v4/spreadsheets/"
            + urllib.parse.quote(sheet_id, safe="")
            + "/values/"
            + range_path
            + "?"
            + query
        )
        request = urllib.request.Request(
            url,
            headers={"Authorization": "Bearer " + credentials.token, "Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
        rows = payload.get("values", [])
        if not isinstance(rows, list):
            raise ValueError
        return rows
    except Exception as error:
        raise RuntimeError("Unable to retrieve inquiry records.") from error


def parse_timestamp(value: str) -> datetime | None:
    value = value.strip()
    for parser in (
        lambda text: datetime.fromisoformat(text.replace("Z", "+00:00")),
        lambda text: datetime.strptime(text, "%m/%d/%Y %I:%M:%S %p"),
        lambda text: datetime.strptime(text, "%m/%d/%Y %I:%M %p"),
    ):
        try:
            date = parser(value)
            return date.replace(tzinfo=LOCAL_ZONE) if date.tzinfo is None else date
        except ValueError:
            continue
    return None


def create_report(rows: list[list[str]], now: datetime) -> tuple[str, dict[str, int]]:
    header = rows[0] if rows else []
    if not header:
        return "Unable to retrieve inquiry records.", {}
    columns = {str(label).strip(): index for index, label in enumerate(header)}
    needed = {"Inquiry ID", "Timestamp", "Inquiry Type", "Name", "Organization", "Reason", "Status"}
    if not needed.issubset(columns):
        return "Unable to retrieve inquiry records.", {}

    start = now - timedelta(days=7)
    recent = []
    for row in rows[1:]:
        try:
            timestamp = parse_timestamp(row[columns["Timestamp"]])
        except IndexError:
            continue
        if timestamp and start <= timestamp <= now:
            recent.append((row, timestamp))

    individual = sum(cell(row, columns, "Inquiry Type").upper() == "INDIVIDUAL" for row, _ in recent)
    organization = sum(cell(row, columns, "Inquiry Type").upper() == "ORGANIZATION" for row, _ in recent)
    categories = Counter(cell(row, columns, "Reason") or "Unspecified" for row, _ in recent)
    historical = sum(
        cell(row, columns, "Reason").strip().lower() in HISTORICAL_REASONS
        for row, _ in recent
    )
    outstanding = Counter(
        cell(row, columns, "Status").upper() or "NEW"
        for row in rows[1:]
        if (cell(row, columns, "Status").upper() or "NEW") in {"NEW", "CONTACTED", "FOLLOW-UP"}
    )
    start_local = start.astimezone(LOCAL_ZONE)
    now_local = now.astimezone(LOCAL_ZONE)
    lines = [
        "COPESTONE-OPHIR LODGE NO. 108",
        "",
        "WEEKLY INQUIRY REPORT",
        "",
        f"Reporting Period: {start_local:%B %-d} – {now_local:%B %-d, %Y}",
        "",
        f"TOTAL NEW INQUIRIES: {len(recent)}",
        f"INDIVIDUAL: {individual}",
        f"ORGANIZATION: {organization}",
        "",
        "BY CATEGORY:",
    ]
    if categories:
        lines.extend(f"{reason}: {count}" for reason, count in sorted(categories.items()))
    else:
        lines.append("No categories this week.")
    lines.extend(["", "OUTSTANDING INQUIRIES (all open inquiries):"])
    lines.extend(f"{status}: {outstanding.get(status, 0)}" for status in ("NEW", "CONTACTED", "FOLLOW-UP"))
    lines.extend(["", f"HISTORICAL ARCHIVE: {historical} new historical archive inquiry(ies).", ""])
    if not recent:
        lines.extend(["No new inquiries were received this week.", ""])
    else:
        lines.extend(["NEW INQUIRIES", ""])
        for row, timestamp in sorted(recent, key=lambda entry: entry[1]):
            inquiry_type = cell(row, columns, "Inquiry Type").title()
            name = cell(row, columns, "Name")
            organization_name = cell(row, columns, "Organization")
            display_name = organization_name + " — " + name if organization_name else name
            lines.extend(
                [
                    cell(row, columns, "Inquiry ID"),
                    display_name,
                    inquiry_type,
                    cell(row, columns, "Reason"),
                    "Received: " + timestamp.astimezone(LOCAL_ZONE).strftime("%B %-d"),
                    "",
                ]
            )
    counts = {
        "total": len(recent),
        "individual": individual,
        "organization": organization,
        "historical": historical,
        "membership": categories.get("Interested in Freemasonry", 0),
        "new_status": outstanding.get("NEW", 0),
        "follow_up": outstanding.get("FOLLOW-UP", 0),
    }
    return "\n".join(lines), counts


def cell(row: list[str], columns: dict[str, int], name: str) -> str:
    index = columns[name]
    return str(row[index]).strip() if index < len(row) else ""


def email_report(endpoint: str, token: str, report: str) -> None:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps({"action": "weekly_report", "token": token, "report": report}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        if result.get("status") != "sent":
            raise RuntimeError
    except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as error:
        raise RuntimeError("Unable to deliver the weekly inquiry report.") from error


def write_job_summary(counts: dict[str, int]) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    content = (
        "## Copestone-Ophir Lodge No. 108 — Weekly Inquiry Report\n\n"
        f"- Total inquiries: {counts['total']}\n"
        f"- Individuals: {counts['individual']}\n"
        f"- Organizations: {counts['organization']}\n"
        f"- Membership inquiries: {counts['membership']}\n"
        f"- Historical archive inquiries: {counts['historical']}\n"
    )
    with open(summary_path, "a", encoding="utf-8") as summary:
        summary.write(content)


def main() -> int:
    sheet_id = os.environ.get("INQUIRY_SHEET_ID", "").strip()
    credentials = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    endpoint = os.environ.get("REPORT_WEBHOOK_URL", "").strip()
    token = os.environ.get("REPORT_WEBHOOK_TOKEN", "")
    if not all((sheet_id, credentials, endpoint, token)):
        print("Weekly report requires configured Google Sheets and email secrets.")
        return 1
    try:
        rows = sheets_rows(sheet_id, credentials)
        report, counts = create_report(rows, datetime.now(timezone.utc))
        if not counts:
            print("Unable to retrieve inquiry records.")
            return 1
        email_report(endpoint, token, report)
        write_job_summary(counts)
    except RuntimeError as error:
        print(str(error))
        return 1
    print(
        "Weekly inquiry report delivered. "
        f"Total: {counts['total']}; individual: {counts['individual']}; "
        f"organization: {counts['organization']}; historical: {counts['historical']}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
