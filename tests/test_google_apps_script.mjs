import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const rows = [];
const sentMail = [];
const properties = new Map([
  ["INQUIRY_SHEET_ID", "private-sheet-id"],
  ["INQUIRY_NOTIFICATION_EMAIL", "lodge@example.test"],
  ["INQUIRY_REPORT_RECIPIENT", "reports@example.test"],
  ["INQUIRY_API_TOKEN", "inquiry-secret"],
  ["WEEKLY_REPORT_TOKEN", "report-secret"]
]);
const cache = new Map();
const sheet = {
  getLastRow: () => rows.length,
  appendRow: (row) => rows.push(row),
  setFrozenRows: () => {}
};
const context = {
  console: { error: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || "" }) },
  CacheService: { getScriptCache: () => ({
    get: (key) => cache.get(key),
    put: (key, value) => cache.set(key, value)
  }) },
  SpreadsheetApp: { openById: () => ({
    getSheetByName: (name) => name === "All Inquiries" && rows.length ? sheet : null,
    insertSheet: (name) => name === "All Inquiries" ? sheet : null
  }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    computeDigest: (_algorithm, text) => new TextEncoder().encode(text),
    base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString("base64url"),
    formatString: (_pattern, value) => String(value).padStart(6, "0")
  },
  MailApp: {
    getRemainingDailyQuota: () => 100,
    sendEmail: (message) => sentMail.push(message)
  },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput: (content) => ({
      content,
      setMimeType: () => ({ getContent: () => content }),
      getContent: () => content
    })
  }
};
vm.runInNewContext(fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), context);

const event = (data) => ({ postData: { contents: JSON.stringify(data) } });
const inquiry = {
  action: "submit",
  token: "inquiry-secret",
  turnstileVerified: true,
  inquiryType: "INDIVIDUAL",
  name: "=formula-like visitor",
  email: "visitor@example.test",
  reason: "Interested in Freemasonry",
  message: "A private message."
};

const accepted = JSON.parse(context.doPost(event(inquiry)).getContent());
assert.equal(accepted.status, "received");
assert.equal(rows.length, 2);
assert.equal(JSON.stringify(rows[0]), JSON.stringify([
  "Inquiry ID", "Timestamp", "Inquiry Type", "Name", "Organization", "Organization Type",
  "Email", "Phone", "Reason", "Related Event", "Message", "Status", "Assigned To", "Internal Notes"
]));
assert.equal(rows[1][3], "'=formula-like visitor");
assert.equal(rows[1][11], "NEW");
assert.equal(sentMail.length, 1);
assert.match(sentMail[0].subject, /Interested in Freemasonry/);
assert.equal(sentMail[0].to, "lodge@example.test");

const unauthorized = JSON.parse(context.doPost(event({ ...inquiry, token: "wrong" })).getContent());
assert.equal(unauthorized.error, "not_authorized");
assert.equal(rows.length, 2);
const duplicate = JSON.parse(context.doPost(event(inquiry)).getContent());
assert.equal(duplicate.error, "duplicate_recent_submission");
assert.equal(rows.length, 2);

const report = JSON.parse(context.doPost(event({
  action: "weekly_report",
  token: "report-secret",
  report: "Private weekly report."
})).getContent());
assert.equal(report.status, "sent");
assert.equal(sentMail.length, 2);
assert.equal(sentMail[1].to, "reports@example.test");
assert.match(sentMail[1].body, /Private weekly report/);

console.log("Apps Script authorization, immediate Sheet append, safe cell handling, duplicate guard, and private email: PASS");
