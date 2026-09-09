/**
* OTP_MAILER_URL ; Web App URL : https://script.google.com/macros/s/AKfycbwM0T4YgX1GOEVBr2aZwDhlz4z2C8c-2Tkwuk73i5hzQFtcLPDy0dl3yoONlms-j-jw/exec
 * Email OTP mailer for the "Maths with Ankush" AI Tutor.
 *
 * WHY THIS EXISTS: Cloudflare Pages Functions can't send email on their
 * own, and setting up a transactional email service (Resend/SendGrid)
 * needs a custom domain to verify — which this site doesn't have yet
 * (it's on a workers.dev subdomain). Your Gmail account can already send
 * mail for free, so this tiny script turns it into an email API.
 *
 * SETUP (one-time, ~5 minutes):
 *  1. Go to https://script.google.com -> New project.
 *  2. Delete the placeholder code and paste this whole file in.
 *  3. Replace SHARED_SECRET below with a long random string (e.g. generate
 *     one at https://1password.com/password-generator/, 32+ characters).
 *     Keep a copy of it — you'll paste the SAME value into Cloudflare as
 *     the OTP_MAILER_SECRET environment variable.
 *  4. Click Deploy -> New deployment -> type: "Web app".
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  5. Click Deploy, authorize the permissions Google asks for (this is
 *     your own script sending mail from your own Gmail — safe to approve).
 *  6. Copy the Web App URL it gives you (ends in /exec). That's your
 *     OTP_MAILER_URL for Cloudflare.
 *
 * QUOTA: a personal Gmail account can send ~100 emails/day this way,
 * a Google Workspace account ~1,500/day — far more than a tutoring
 * site's OTP volume needs. If you ever hit the ceiling, that's a good
 * problem to have and worth revisiting with a dedicated email service.
 */

function doPost(e) {
  var SHARED_SECRET = "3GI-h3cghLXtF3xZ1fm-yKSAIO8MpG3DjLwa_hjz3QE";

  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ ok: false, error: "bad json" });
  }

  if (!data || data.secret !== SHARED_SECRET) {
    return respond({ ok: false, error: "unauthorized" });
  }

  var to = data.to;
  var code = data.code;
  var name = data.name || "there";

  if (!to || !code) {
    return respond({ ok: false, error: "missing fields" });
  }

  var subject = "Your Maths with Ankush verification code: " + code;
  var body =
    "Hi " + name + ",\n\n" +
    "Your verification code for the AI Maths Tutor is: " + code + "\n\n" +
    "This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.\n\n" +
    "— Maths with Ankush";

  GmailApp.sendEmail(to, subject, body);
  return respond({ ok: true });
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
