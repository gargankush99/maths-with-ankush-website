// Handles POST /api/otp-verify  { email, code }
// Checks the code against what otp-start stored in KV. On success, issues
// a signed session token (30 days) binding email+name+phone, and logs the
// verified sign-up into the same Google Sheet the homepage trial-booking
// form writes to.

import { signToken } from "./token.js";

const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 5;

// Same endpoint the homepage "Book my free trial" form posts to
// (see sheetUrl in index.html) — already public in that page's source.
const LEAD_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyB4HQ_Tiz41-QmBDS7t5okz60BD2ddmqqXPtB19zRcaxGFUycrXKgJBsXattLlrAoX8g/exec";

export async function handleOtpVerify(request, env, ctx) {
  if (!env.TUTOR_KV) return json({ error: "Server not configured (KV missing)." }, 500);
  if (!env.OTP_SIGNING_SECRET) return json({ error: "Server not configured (signing secret missing)." }, 500);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const code = String(body.code || "").trim();

  if (!email || !code) return json({ error: "Missing email or code." }, 400);

  const kvKey = `otp:${email}`;
  const raw = await env.TUTOR_KV.get(kvKey);
  if (!raw) {
    return json({ error: "That code has expired. Please request a new one." }, 400);
  }

  const record = JSON.parse(raw);

  if (record.attempts >= MAX_ATTEMPTS) {
    await env.TUTOR_KV.delete(kvKey);
    return json({ error: "Too many incorrect attempts. Please request a new code." }, 429);
  }

  if (record.code !== code) {
    record.attempts += 1;
    await env.TUTOR_KV.put(kvKey, JSON.stringify(record), { expirationTtl: 600 });
    return json({ error: "That code isn't right. Please check and try again." }, 400);
  }

  await env.TUTOR_KV.delete(kvKey);

  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = await signToken(
    { email, name: record.name, phone: record.phone, exp },
    env.OTP_SIGNING_SECRET
  );

  ctx.waitUntil(logLeadToSheet({ email, name: record.name, phone: record.phone, grade: record.grade }));

  return json({ ok: true, token, name: record.name, phone: record.phone, expiresAt: exp });
}

async function logLeadToSheet(lead) {
  try {
    var countryCode = "";
    var phoneDigits = lead.phone || "";
    var m = /^(\+\d{1,3})(\d.*)$/.exec(phoneDigits);
    if (m) {
      countryCode = m[1];
      phoneDigits = m[2];
    }
    var params = new URLSearchParams({
      name: lead.name || "",
      grade: lead.grade || "Not specified",
      countryCode: countryCode,
      phone: phoneDigits,
      message: "Verified email: " + lead.email + " — signed up via the AI Tutor widget (not a trial-booking request).",
      source: "AI Tutor",
    });
    await fetch(LEAD_SHEET_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    console.error("Lead sheet log failed:", err);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
