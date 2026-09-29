const INDIVIDUAL_REASONS = new Set([
  "Interested in Freemasonry",
  "Visiting the Lodge",
  "Lodge History / Historical Research",
  "Events",
  "Community Involvement",
  "Historical Photograph or Document",
  "Other"
]);

const ORGANIZATION_REASONS = new Set([
  "Community Partnership",
  "Event Collaboration",
  "Venue / Lodge Inquiry",
  "Historical Research",
  "Media / Press",
  "Charitable or Civic Initiative",
  "Masonic Organization",
  "Other"
]);

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Cache-Control": "no-store"
    }
  });
}

function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function verifyChallenge(token, secret, ip) {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return false;
    return (await response.json()).success === true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const allowedOrigins = (env.ALLOWED_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    if (!allowedOrigins.includes(origin)) return new Response("Not found", { status: 404 });
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
          "Vary": "Origin"
        }
      });
    }
    if (request.method !== "POST") return json({ error: "Request not accepted." }, 405, origin);
    if (!env.INQUIRY_SCRIPT_URL || !env.APPS_SCRIPT_TOKEN || !env.TURNSTILE_SECRET_KEY) {
      return json({ error: "Inquiry service is not configured." }, 503, origin);
    }
    let input;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 40000) {
        return json({ error: "Request is too large." }, 413, origin);
      }
      input = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid request." }, 400, origin);
    }
    if (!input || typeof input !== "object") return json({ error: "Invalid request." }, 400, origin);
    if (clean(input.website, 300)) return json({ status: "received" }, 200, origin);

    const inquiryType = input.inquiryType === "organization" ? "ORGANIZATION" : input.inquiryType === "individual" ? "INDIVIDUAL" : "";
    const name = clean(input.name, 120);
    const organization = clean(input.organization, 160);
    const contactPerson = clean(input.contactPerson, 120);
    const email = clean(input.email, 254);
    const phone = clean(input.phone, 40);
    const organizationType = clean(input.organizationType, 100);
    const reason = clean(input.reason, 120);
    const relatedEvent = clean(input.relatedEvent, 200);
    const message = clean(input.message, 5000);
    const reasons = inquiryType === "INDIVIDUAL" ? INDIVIDUAL_REASONS : ORGANIZATION_REASONS;
    if (!inquiryType || !name || (inquiryType === "ORGANIZATION" && !organization) ||
      (inquiryType === "ORGANIZATION" && !contactPerson) || !validEmail(email) ||
      !reasons.has(reason) || message.length < 3) {
      return json({ error: "Please review the required fields and try again." }, 400, origin);
    }
    if (typeof input.turnstileToken !== "string" ||
      !(await verifyChallenge(input.turnstileToken, env.TURNSTILE_SECRET_KEY, request.headers.get("CF-Connecting-IP")))) {
      return json({ error: "Please complete the spam-prevention check and try again." }, 400, origin);
    }

    const payload = {
      action: "submit",
      token: env.APPS_SCRIPT_TOKEN,
      inquiryType,
      name,
      organization,
      contactPerson,
      email,
      phone,
      organizationType,
      reason,
      relatedEvent,
      message,
      turnstileVerified: true
    };
    try {
      const response = await fetch(env.INQUIRY_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) return json({ error: "Unable to save the inquiry. Please try again later." }, 502, origin);
      const result = await response.json();
      if (result.status !== "received") return json({ error: "Unable to save the inquiry. Please try again later." }, 502, origin);
      return json({ status: "received" }, 200, origin);
    } catch {
      return json({ error: "Inquiry service is temporarily unavailable. Please try again later." }, 502, origin);
    }
  }
};
