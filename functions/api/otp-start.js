// POST /api/otp-start  { name, email, phone }
// Generates a 6-digit code, stores it in KV for 10 minutes, and asks the
// Google Apps Script mailer (see email-otp-google-apps-script.gs) to email
// it to the student. Phone is stored alongside the code so it gets locked
// into the verified session token once the code is confirmed, but the
// phone number itself is NOT OTP-verified in this version (see README).

const OTP_TTL_SECONDS = 600; // 10 minutes
const RESEND_COOLDOWN_SECONDS = 45;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.TUTOR_KV) return json({ error: "Server not configured (KV missing)." }, 500);
  if (!env.OTP_MAILER_URL || !env.OTP_MAILER_SECRET) {
    return json({ error: "Email verification is not configured yet. Please try again later." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const phone = String(body.phone || "").replace(/[^\d+]/g, "").slice(0, 20);
  const grade = String(body.grade || "").trim().slice(0, 20);

  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400);
  }
  if (!phone || phone.replace(/\D/g, "").length < 8) {
    return json({ error: "Please enter a valid phone number (with country code)." }, 400);
  }

  // Cooldown so a student can't spam "send code" and burn the mailer quota.
  const cooldownKey = `otpcooldown:${email}`;
  if (await env.TUTOR_KV.get(cooldownKey)) {
    return json({ error: "A code was just sent — please wait a moment before requesting another." }, 429);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const record = { code, name, phone, grade, attempts: 0, createdAt: Date.now() };
  await env.TUTOR_KV.put(`otp:${email}`, JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS });
  await env.TUTOR_KV.put(cooldownKey, "1", { expirationTtl: RESEND_COOLDOWN_SECONDS });

  try {
    const mailRes = await fetch(env.OTP_MAILER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.OTP_MAILER_SECRET, to: email, code, name }),
    });
    if (!mailRes.ok) {
      console.error("Mailer error:", mailRes.status, await mailRes.text());
      return json({ error: "Couldn't send the verification email. Please try again." }, 502);
    }
  } catch (err) {
    console.error("Mailer fetch failed:", err);
    return json({ error: "Couldn't send the verification email. Please try again." }, 502);
  }

  return json({ ok: true });
}

export async function onRequestGet() {
  return json({ error: "Use POST." }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
