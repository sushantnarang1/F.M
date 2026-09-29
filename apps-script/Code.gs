const HEADERS = [
  "Inquiry ID", "Timestamp", "Inquiry Type", "Name", "Organization", "Organization Type", "Email",
  "Phone", "Reason", "Related Event", "Message", "Status", "Assigned To", "Internal Notes"
];

function doPost(event) {
  let input;
  try {
    if (!event || !event.postData || !event.postData.contents) throw new Error("Request body is missing.");
    input = JSON.parse(event.postData.contents);
  } catch (_error) {
    return jsonResponse({ error: "invalid_request" });
  }

  const properties = PropertiesService.getScriptProperties();
  if (input.action === "submit") {
    if (!constantTimeEquals_(input.token, properties.getProperty("INQUIRY_API_TOKEN"))) {
      return jsonResponse({ error: "not_authorized" });
    }
    return saveInquiry_(input);
  }
  if (input.action === "weekly_report") {
    if (!constantTimeEquals_(input.token, properties.getProperty("WEEKLY_REPORT_TOKEN"))) {
      return jsonResponse({ error: "not_authorized" });
    }
    return emailWeeklyReport_(input);
  }
  return jsonResponse({ error: "unknown_action" });
}

function saveInquiry_(input) {
  if (input.turnstileVerified !== true) return jsonResponse({ error: "verification_required" });
  const inquiryType = input.inquiryType === "ORGANIZATION" ? "ORGANIZATION" :
    input.inquiryType === "INDIVIDUAL" ? "INDIVIDUAL" : "";
  const name = cleanText_(input.name, 120);
  const organization = cleanText_(input.organization, 160);
  const email = cleanText_(input.email, 254);
  const phone = cleanText_(input.phone, 40);
  const reason = cleanText_(input.reason, 120);
  const message = cleanText_(input.message, 5000);
  if (!inquiryType || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      message.length < 3 || (inquiryType === "ORGANIZATION" && !organization)) {
    return jsonResponse({ error: "invalid_fields" });
  }

  const normalizedEmail = email.toLowerCase();
  const cache = CacheService.getScriptCache();
  const cacheKey = "recent-inquiry:" + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizedEmail)
  ).slice(0, 40);
  if (cache.get(cacheKey)) return jsonResponse({ error: "duplicate_recent_submission" });

  let inquiryId;
  let timestamp;
  try {
    const sheet = getInquirySheet_();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const rowNumber = sheet.getLastRow();
      const sequence = Math.max(1, rowNumber);
      inquiryId = "COP-" + Utilities.formatString("%06d", sequence);
      timestamp = new Date();
      sheet.appendRow([
        inquiryId,
        timestamp,
        inquiryType,
        safeCell_(name),
        safeCell_(organization),
        safeCell_(cleanText_(input.organizationType, 100)),
        safeCell_(email),
        safeCell_(phone),
        safeCell_(reason),
        safeCell_(cleanText_(input.relatedEvent, 200)),
        safeCell_(message),
        "NEW",
        "",
        ""
      ]);
    } finally {
      lock.releaseLock();
    }
  } catch (_error) {
    console.error("Inquiry storage failed.");
    return jsonResponse({ error: "storage_unavailable" });
  }
  cache.put(cacheKey, "1", 900);

  try {
    notifyLodge_(input, inquiryId, timestamp);
  } catch (_error) {
    console.error("Inquiry notification failed; inquiry remains stored.");
  }
  return jsonResponse({ status: "received", inquiryId: inquiryId });
}

function getInquirySheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("INQUIRY_SHEET_ID");
  if (!id) throw new Error("Inquiry sheet is not configured.");
  const spreadsheet = SpreadsheetApp.openById(id);
  let sheet = spreadsheet.getSheetByName("All Inquiries");
  if (!sheet) sheet = spreadsheet.insertSheet("All Inquiries");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }

  function authorizeLodgeServices() {
    getInquirySheet_();
    MailApp.getRemainingDailyQuota();
  }
  return sheet;
}

function notifyLodge_(input, inquiryId, timestamp) {
  const recipient = PropertiesService.getScriptProperties().getProperty("INQUIRY_NOTIFICATION_EMAIL");
  if (!recipient) throw new Error("Notification address is not configured.");
  const category = input.reason === "Lodge History / Historical Research" ||
    input.reason === "Historical Photograph or Document" || input.reason === "Historical Research"
    ? "Historical Archive" : cleanText_(input.reason, 120);
  const name = cleanText_(input.name, 120);
  const organization = cleanText_(input.organization, 160);
  const email = cleanText_(input.email, 254);
  const phone = cleanText_(input.phone, 40);
  const message = cleanText_(input.message, 5000);
  const relatedEvent = cleanText_(input.relatedEvent, 200);
  const body = [
    "New Copestone-Ophir inquiry",
    "Inquiry ID: " + inquiryId,
    "Inquiry type: " + input.inquiryType,
    "Name: " + name,
    organization ? "Organization: " + organization : "",
    "Reason: " + category,
    "Received: " + timestamp.toISOString(),
    relatedEvent ? "Related event: " + relatedEvent : "",
    "",
    "Email: " + email,
    phone ? "Phone: " + phone : "",
    "",
    "Message:",
    message
  ].filter(function (line) { return line !== ""; }).join("\n");
  MailApp.sendEmail({
    to: recipient,
    subject: "New Copestone-Ophir Inquiry — " + category,
    body: body
  });
}

function emailWeeklyReport_(input) {
  const recipient = PropertiesService.getScriptProperties().getProperty("INQUIRY_REPORT_RECIPIENT");
  const report = cleanText_(input.report, 35000);
  if (!recipient || !report) return jsonResponse({ error: "report_not_configured" });
  try {
    MailApp.sendEmail({
      to: recipient,
      subject: "Copestone-Ophir No. 108 — Weekly Inquiry Report",
      body: report
    });
    return jsonResponse({ status: "sent" });
  } catch (_error) {
    console.error("Weekly report email failed.");
    return jsonResponse({ error: "report_email_failed" });
  }
}

function cleanText_(value, maximum) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maximum);
}

function safeCell_(value) {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function constantTimeEquals_(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) return false;
  let difference = provided.length ^ expected.length;
  const length = Math.max(provided.length, expected.length);
  for (let index = 0; index < length; index++) {
    difference |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
