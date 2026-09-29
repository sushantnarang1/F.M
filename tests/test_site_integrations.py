import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from scripts.sync_public_calendar import fetch_events
from scripts.weekly_inquiry_report import create_report


ROOT = Path(__file__).resolve().parents[1]


class CalendarSyncTests(unittest.TestCase):
    def test_filters_cancelled_and_private_events_and_limits_public_fields(self):
        response = {
            "items": [
                {
                    "id": "public-1",
                    "summary": "Public Dinner",
                    "start": {"dateTime": "2027-01-23T18:00:00-05:00"},
                    "end": {"dateTime": "2027-01-23T20:00:00-05:00"},
                    "location": "225 Kearny Avenue",
                    "description": "Community dinner",
                    "htmlLink": "https://calendar.google.com/calendar/event?eid=public-1",
                    "status": "confirmed",
                    "visibility": "public",
                    "attendees": [{"email": "private@example.test"}],
                },
                {
                    "id": "private-1",
                    "summary": "Private event",
                    "start": {"dateTime": "2027-01-24T18:00:00-05:00"},
                    "end": {"dateTime": "2027-01-24T19:00:00-05:00"},
                    "visibility": "private",
                },
                {
                    "id": "cancelled-1",
                    "summary": "Cancelled",
                    "start": {"date": "2027-01-25"},
                    "end": {"date": "2027-01-26"},
                    "status": "cancelled",
                },
            ]
        }

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps(response).encode()

        with patch("scripts.sync_public_calendar.urllib.request.urlopen", return_value=Response()):
            events = fetch_events("public-calendar-id", "api-key", datetime.now(timezone.utc))

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["title"], "Public Dinner")
        self.assertNotIn("attendees", events[0])
        self.assertNotIn("visibility", events[0])


class WeeklyReportTests(unittest.TestCase):
    def test_report_contains_recent_summary_without_contact_or_message_data(self):
        rows = [
            [
                "Inquiry ID", "Timestamp", "Inquiry Type", "Name", "Organization",
                "Email", "Phone", "Reason", "Related Event", "Message", "Status",
                "Assigned To", "Internal Notes",
            ],
            [
                "COP-000001", "9/27/2026 10:00:00 AM", "INDIVIDUAL", "John Sample",
                "", "private@example.test", "555-0101", "Interested in Freemasonry",
                "", "private message", "NEW", "", "private note",
            ],
            [
                "COP-000002", "9/28/2026 11:30:00 AM", "ORGANIZATION", "Jane Sample",
                "Kearny Historical Society", "secret@example.test", "", "Historical Research",
                "", "archive message", "FOLLOW-UP", "", "",
            ],
            [
                "COP-000003", "9/01/2026 11:30:00 AM", "INDIVIDUAL", "Older Sample",
                "", "", "", "Other", "", "", "CLOSED", "", "",
            ],
        ]
        report, counts = create_report(rows, datetime(2026, 9, 29, 17, tzinfo=timezone.utc))

        self.assertEqual(counts["total"], 2)
        self.assertEqual(counts["individual"], 1)
        self.assertEqual(counts["organization"], 1)
        self.assertEqual(counts["historical"], 1)
        self.assertEqual(counts["membership"], 1)
        self.assertEqual(counts["new_status"], 1)
        self.assertEqual(counts["follow_up"], 1)
        self.assertIn("John Sample", report)
        self.assertIn("Kearny Historical Society", report)
        for private_value in ("private@example.test", "555-0101", "private message", "private note", "secret@example.test"):
            self.assertNotIn(private_value, report)

    def test_empty_week_is_successful_and_clear(self):
        rows = [["Inquiry ID", "Timestamp", "Inquiry Type", "Name", "Organization", "Email", "Phone", "Reason", "Related Event", "Message", "Status", "Assigned To", "Internal Notes"]]
        report, counts = create_report(rows, datetime(2026, 9, 29, tzinfo=timezone.utc))
        self.assertEqual(counts["total"], 0)
        self.assertIn("No new inquiries were received this week.", report)


class HistoricalContentTests(unittest.TestCase):
    def test_timeline_keeps_unresolved_dates_explicit(self):
        content = (ROOT / "history" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Before 1900", content)
        self.assertIn("Copestone Temple", content)
        self.assertIn("Exact date unknown", content)
        self.assertIn("The date has not been confirmed", content)
        self.assertIn("June 1941", content)
        self.assertIn("It is not the founding date", content)
        self.assertIn("Do you know more about our history?", content)
        self.assertNotIn("chartered in 1917", content.lower())

    def test_gallery_has_neutral_captions_for_unverified_images(self):
        content = (ROOT / "gallery" / "index.html").read_text(encoding="utf-8")
        self.assertIn("date and occasion unknown", content)
        self.assertIn("Official seal status has not been independently verified", content)
        for asset in (
            "lodge-members.jpg",
            "lodge-emblem.jpg",
            "gemini-masonic-illustration.jpg",
            "lodge-emblem-screenshot.jpg",
            "grand-lodge-new-jersey-seal.jpg",
            "eighth-masonic-district.png",
        ):
            self.assertIn(asset, content)


if __name__ == "__main__":
    unittest.main()
