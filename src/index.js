// Worker entrypoint. Handles the three /api/* routes for the AI Tutor
// (email OTP + chat), and serves every other request as a static asset
// from the site itself (index.html, grade pages, resources, images...).
//
// This file is what makes maths-with-ankush a real Worker instead of a
// "static assets only" deployment — that distinction matters because a
// static-assets-only Worker cannot have KV bindings, secrets, or run any
// server-side code at all, which is why /api/* returned bare 404s before
// this file existed.

import { handleOtpStart } from "./otp-start.js";
import { handleOtpVerify } from "./otp-verify.js";
import { handleTutor } from "./tutor.js";

const ROUTES = {
  "/api/otp-start": handleOtpStart,
  "/api/otp-verify": handleOtpVerify,
  "/api/tutor": handleTutor,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];

    if (handler) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Use POST." }), {
          status: 405,
          headers: { "content-type": "application/json" },
        });
      }
      return handler(request, env, ctx);
    }

    // Not an API route — serve the static site as before.
    return env.ASSETS.fetch(request);
  },
};
