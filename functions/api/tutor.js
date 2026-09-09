// Cloudflare Pages Function: POST /api/tutor
// Proxies chat messages to the Claude API so the Anthropic key never
// reaches the browser. Requires:
//   - Environment variable/secret: ANTHROPIC_API_KEY
//   - (Optional but recommended) KV namespace binding: TUTOR_KV
//     used for a simple per-email daily question cap.
//
// Set these in the Cloudflare dashboard:
//   Workers & Pages -> maths-with-ankush -> Settings -> Environment variables
//   Workers & Pages -> maths-with-ankush -> Settings -> Functions -> KV namespace bindings

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 700;
const DAILY_MESSAGE_CAP = 40; // per student email, resets ~daily
const MAX_HISTORY_MESSAGES = 16; // keep the payload (and cost) bounded
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

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const grade = String(body.grade || "").trim().slice(0, 20);
  const incomingMessages = Array.isArray(body.messages) ? body.messages : [];

  if (!name || !email || !email.includes("@")) {
    return json({ error: "Please enter your name and a valid email to use the AI tutor." }, 400);
  }
  if (incomingMessages.length === 0) {
    return json({ error: "No message provided." }, 400);
  }

  // --- Simple daily rate limit per email, via KV (skipped if TUTOR_KV isn't bound) ---
  if (env.TUTOR_KV) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const kvKey = `rl:${email}:${today}`;
    const current = parseInt((await env.TUTOR_KV.get(kvKey)) || "0", 10);
    if (current >= DAILY_MESSAGE_CAP) {
      return json(
        {
          error:
            "You've reached today's question limit on the free AI tutor. Please try again tomorrow, or message Ankush directly on WhatsApp for anything urgent.",
        },
        429
      );
    }
    await env.TUTOR_KV.put(kvKey, String(current + 1), { expirationTtl: 60 * 60 * 26 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "AI tutor is not configured yet. Please try again later." }, 500);
  }

  // --- Trim & sanitise conversation history to keep tokens (and cost) bounded ---
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
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
