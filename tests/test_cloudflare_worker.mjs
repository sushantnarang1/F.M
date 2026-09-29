import assert from "node:assert/strict";
import worker from "../cloudflare-worker/src/index.js";

const allowedOrigin = "https://copestoneophir108.com";
const env = {
  ALLOWED_ORIGIN: allowedOrigin,
  INQUIRY_SCRIPT_URL: "https://script.google.com/macros/s/example/exec",
  APPS_SCRIPT_TOKEN: "private-backend-token",
  TURNSTILE_SECRET_KEY: "private-turnstile-secret"
};

const input = {
  inquiryType: "individual",
  name: "Test visitor",
  email: "visitor@example.test",
  reason: "Interested in Freemasonry",
  message: "A test inquiry.",
  turnstileToken: "valid-turnstile-token"
};

async function request(body, origin = allowedOrigin) {
  return worker.fetch(new Request("https://worker.example/submit", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }), env);
}

const fetchCalls = [];
globalThis.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options });
  if (String(url).includes("siteverify")) {
    return { ok: true, json: async () => ({ success: true }) };
  }
  return { ok: true, json: async () => ({ status: "received", inquiryId: "COP-000001" }) };
};

const accepted = await request(input);
assert.equal(accepted.status, 200);
assert.equal((await accepted.json()).status, "received");
assert.equal(fetchCalls.length, 2);
const forwarded = JSON.parse(fetchCalls[1].options.body);
assert.equal(forwarded.action, "submit");
assert.equal(forwarded.token, env.APPS_SCRIPT_TOKEN);
assert.equal(forwarded.email, input.email);
assert.equal(forwarded.turnstileVerified, true);

const forbidden = await request(input, "https://unapproved.example");
assert.equal(forbidden.status, 404);

const preflight = await worker.fetch(new Request("https://worker.example/submit", {
  method: "OPTIONS",
  headers: { Origin: allowedOrigin }
}), env);
assert.equal(preflight.status, 204);

const invalid = await request({ ...input, email: "invalid" });
assert.equal(invalid.status, 400);

const spam = await request({ ...input, website: "bot-filled" });
assert.equal(spam.status, 200);
assert.equal((await spam.json()).status, "received");
assert.equal(fetchCalls.length, 2);

console.log("Worker CORS, validation, honeypot, Turnstile verification, and backend forwarding: PASS");
