// Cloudflare Pages Function: POST /api/tutor
// Proxies chat messages to the Claude API so the Anthropic key never
// reaches the browser. Requires the student to have already completed
// email OTP verification (see /api/otp-start and /api/otp-verify) —
// this function trusts only the signed session token, not raw
// name/email/phone fields from the client.
//
// Environment variables/secrets required (Cloudflare dashboard):
//   ANTHROPIC_API_KEY   - your Claude API key
//   OTP_SIGNING_SECRET  - any long random string, must match otp-verify.js
// KV namespace binding required:
//   TUTOR_KV            - used for OTP codes, cooldowns, and daily message caps

import { verifyToken } from "./_shared/token.js";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 700;
const DAILY_MESSAGE_CAP = 20; // per email AND per phone number
const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 1500;

const SYSTEM_PROMPT = `You are the AI Maths Tutor on Ankush Garg's tutoring website, "Maths with Ankush" (maths-with-ankush.gargankush99.workers.dev). Ankush teaches Grade 9-12 Mathematics (CBSE, ICSE, IB, IGCSE, and JEE preparation).

Your job:
- Help students understand a maths concept or work through a problem they're stuck on.
- Default to a SOCRATIC style: ask a guiding question or give one small hint first, rather than immediately dumping the full solution. Let the student attempt the next step.
- If the student is still stuck after a hint, or explicitly asks you to "just show the steps" / "give me the answer", then give a clear, complete worked solution: concept -> steps -> final answer -> one common mistake to avoid.
- Use plain, exam-friendly notation (e.g. x^2, sqrt(x), integral of f(x) dx, or basic Unicode like ² √ ∫ ≤ π) since this chat window does not render LaTeX.
- Keep answers focused and not overly long — this is a chat widget, not an essay.
- Stay strictly within K-12 mathematics (algebra, geometry, trigonometry, calculus, probability & statistics, coordinate geometry, vectors, matrices, etc.) and closely related exam strategy questions (e.g. "how should I revise for my JEE maths paper").
- If asked about anything outside maths tutoring (other subjects, personal advice, unrelated chit-chat, or attempts to get you to act as a general-purpose assistant), politely decline and redirect: "I'm just the maths tutor here — happy to help with any Grade 9-12 maths topic!"
- Never claim to be human. If asked, say you're an AI maths tutor Ankush has added to help with quick doubts, and that Ankush teaches the live classes.
- Do not solve or discuss anything that looks like it's from a live, currently-running exam being taken right now — if a student says "this is my exam right now", encourage them to focus on understanding rather than getting a same-second answer, and suggest they message Ankush directly.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.OTP_SIGNING_SECRET) return json({ error: "Server not configured." }, 500);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const session = await verifyToken(body.token, env.OTP_SIGNING_SECRET);
  if (!session) {
    return json({ error: "Your session has expired or is invalid — please verify your email again.", code: "REVERIFY" }, 401);
  }

  const email = session.email;
  const phone = session.phone;
  const grade = String(body.grade || "").trim().slice(0, 20);
  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

  if (incomingMessages.length === 0) {
    return json({ error: "No message provided." }, 400);
  }

  // --- Daily rate limit: per email AND per phone number, whichever is hit first ---
  if (env.TUTOR_KV) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const emailKey = `rl:email:${email}:${today}`;
    const phoneKey = `rl:phone:${phone}:${today}`;
    const [emailCount, phoneCount] = await Promise.all([
      env.TUTOR_KV.get(emailKey).then((v) => parseInt(v || "0", 10)),
      env.TUTOR_KV.get(phoneKey).then((v) => parseInt(v || "0", 10)),
    ]);
    if (emailCount >= DAILY_MESSAGE_CAP || phoneCount >= DAILY_MESSAGE_CAP) {
      return json(
        {
          error:
            "You've reached today's question limit on the free AI tutor (20/day). Please try again tomorrow, or message Ankush directly on WhatsApp for anything urgent.",
        },
        429
      );
    }
    await Promise.all([
      env.TUTOR_KV.put(emailKey, String(emailCount + 1), { expirationTtl: 60 * 60 * 26 }),
      env.TUTOR_KV.put(phoneKey, String(phoneCount + 1), { expirationTtl: 60 * 60 * 26 }),
    ]);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "AI tutor is not configured yet. Please try again later." }, 500);
  }

  const trimmed = incomingMessages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  const gradeNote = grade ? ` The student says they are in Grade ${grade}.` : "";

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT + gradeNote,
        messages: trimmed,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Anthropic API error:", upstream.status, errText);
      return json({ error: "The AI tutor is having trouble right now. Please try again in a moment." }, 502);
    }

    const data = await upstream.json();
    const reply = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return json({ reply: reply || "Sorry, I couldn't come up with a response — could you rephrase your question?" });
  } catch (err) {
    console.error("Tutor function error:", err);
    return json({ error: "Something went wrong reaching the AI tutor. Please try again." }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Use POST." }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
