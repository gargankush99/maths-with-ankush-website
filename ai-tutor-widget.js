/* AI Maths Tutor widget for Maths with Ankush.
   Self-contained: injects its own button, panel, styles and logic.
   Verifies the student's email via a one-time code before unlocking
   chat, then talks to /api/tutor with a signed session token — the
   Claude API key never reaches the browser. */
(function () {
  var NAVY = "#1b2a4b";
  var NAVY_DARK = "#15223f";
  var GOLD = "#ed9f17";
  var CREAM = "#faf7f0";
  var SESSION_KEY = "mwaTutorSession";
  var MAX_INPUT_CHARS = 600;
  var RESEND_COOLDOWN_MS = 45000;

  var css = "" +
    "#mwa-tutor-btn{position:fixed;bottom:22px;right:22px;z-index:9999;background:" + GOLD + ";color:" + NAVY_DARK + ";border:none;border-radius:999px;padding:14px 20px;font-family:'Source Sans 3',sans-serif;font-weight:700;font-size:15px;box-shadow:0 10px 28px rgba(27,42,75,.35);cursor:pointer;display:flex;align-items:center;gap:9px;}" +
    "#mwa-tutor-btn:hover{filter:brightness(1.05);}" +
    "#mwa-tutor-panel{position:fixed;bottom:22px;right:22px;z-index:10000;width:370px;max-width:calc(100vw - 28px);height:540px;max-height:calc(100vh - 40px);background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.32);display:none;flex-direction:column;overflow:hidden;font-family:'Source Sans 3',sans-serif;}" +
    "#mwa-tutor-panel.mwa-open{display:flex;}" +
    "#mwa-tutor-head{background:" + NAVY + ";color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;flex:none;}" +
    "#mwa-tutor-head-title{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;}" +
    "#mwa-tutor-head-sub{color:#c3cad8;font-size:12px;margin-top:2px;}" +
    "#mwa-tutor-close{background:transparent;border:none;color:#c3cad8;font-size:22px;cursor:pointer;line-height:1;padding:2px 4px;}" +
    "#mwa-tutor-body{flex:1;overflow-y:auto;padding:16px;background:" + CREAM + ";display:flex;flex-direction:column;gap:10px;}" +
    ".mwa-msg{max-width:85%;padding:10px 13px;border-radius:10px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;}" +
    ".mwa-msg-user{align-self:flex-end;background:" + NAVY + ";color:#fff;border-bottom-right-radius:2px;}" +
    ".mwa-msg-bot{align-self:flex-start;background:#fff;color:" + NAVY_DARK + ";border:1px solid #ece3d0;border-bottom-left-radius:2px;}" +
    ".mwa-msg-err{align-self:flex-start;background:#fdecec;color:#8a2b2b;border:1px solid #f3caca;}" +
    "#mwa-tutor-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid #ece3d0;background:#fff;flex:none;}" +
    "#mwa-tutor-input{flex:1;resize:none;border:1px solid #e0d8c6;border-radius:8px;padding:9px 11px;font-family:inherit;font-size:14px;color:" + NAVY_DARK + ";max-height:80px;}" +
    "#mwa-tutor-send{background:" + GOLD + ";color:" + NAVY_DARK + ";border:none;border-radius:8px;padding:0 16px;font-weight:700;cursor:pointer;font-size:14px;}" +
    "#mwa-tutor-send:disabled{opacity:.5;cursor:default;}" +
    "#mwa-tutor-gate{padding:20px;display:flex;flex-direction:column;gap:12px;background:" + CREAM + ";flex:1;overflow-y:auto;}" +
    "#mwa-tutor-gate p{font-size:14px;color:#51596b;margin:0 0 4px;line-height:1.5;}" +
    "#mwa-tutor-gate input,#mwa-tutor-gate select{padding:11px 12px;border:1px solid #e0d8c6;border-radius:6px;font-size:14.5px;font-family:inherit;color:" + NAVY_DARK + ";}" +
    "#mwa-tutor-gate button.mwa-primary{margin-top:4px;background:" + GOLD + ";color:" + NAVY_DARK + ";border:none;border-radius:6px;padding:12px;font-weight:700;font-size:15px;cursor:pointer;}" +
    "#mwa-tutor-gate button.mwa-primary:disabled{opacity:.55;cursor:default;}" +
    "#mwa-tutor-gate button.mwa-link{background:none;border:none;color:" + NAVY + ";font-weight:600;font-size:13px;cursor:pointer;padding:4px 0;text-align:left;}" +
    "#mwa-tutor-gate button.mwa-link:disabled{color:#9aa3b5;cursor:default;}" +
    "#mwa-tutor-gate-note{font-size:11.5px;color:#8a8270;margin-top:2px;}" +
    "#mwa-tutor-gate-error{font-size:13px;color:#8a2b2b;background:#fdecec;border:1px solid #f3caca;border-radius:6px;padding:8px 10px;display:none;}" +
    "@media (max-width:480px){#mwa-tutor-panel{right:14px;bottom:14px;width:calc(100vw - 28px);}#mwa-tutor-btn{right:14px;bottom:14px;}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.id = "mwa-tutor-btn";
  btn.innerHTML = "<span style=\"font-family:'Playfair Display',serif;font-size:18px;\">&Sigma;</span> Ask AI Tutor";
  document.body.appendChild(btn);

  var panel = document.createElement("div");
  panel.id = "mwa-tutor-panel";
  panel.innerHTML =
    '<div id="mwa-tutor-head">' +
      '<div><div id="mwa-tutor-head-title">AI Maths Tutor</div><div id="mwa-tutor-head-sub">Grade 9–12 · quick doubts, guided hints</div></div>' +
      '<button id="mwa-tutor-close" aria-label="Close">×</button>' +
    '</div>' +
    '<div id="mwa-tutor-gate">' +
      '<div id="mwa-tutor-gate-error"></div>' +
      '<div id="mwa-gate-step-details">' +
        '<p>Quick intro so Ankush knows who’s asking — we’ll email you a one-time code to confirm it’s really you.</p>' +
        '<input id="mwa-gate-name" placeholder="Your name" maxlength="100">' +
        '<input id="mwa-gate-email" placeholder="Your email" type="email" maxlength="200">' +
        '<input id="mwa-gate-phone" placeholder="Phone number (with country code, e.g. +91...)" maxlength="20">' +
        '<select id="mwa-gate-grade">' +
          '<option value="">Grade (optional)</option>' +
          '<option value="9">Grade 9</option><option value="10">Grade 10</option>' +
          '<option value="11">Grade 11</option><option value="12">Grade 12</option>' +
          '<option value="JEE">JEE aspirant</option>' +
        '</select>' +
        '<button class="mwa-primary" id="mwa-gate-send-code">Send verification code</button>' +
        '<div id="mwa-tutor-gate-note">This tutor guides you through problems step by step — for full personalised classes, <a href="#contact" style="color:' + NAVY + ';font-weight:700;">book a free trial with Ankush</a>.</div>' +
      '</div>' +
      '<div id="mwa-gate-step-otp" style="display:none;">' +
        '<p>Enter the 6-digit code we just emailed to <strong id="mwa-gate-otp-email"></strong>.</p>' +
        '<input id="mwa-gate-code" placeholder="6-digit code" maxlength="6" inputmode="numeric">' +
        '<button class="mwa-primary" id="mwa-gate-verify">Verify &amp; start chatting</button>' +
        '<button class="mwa-link" id="mwa-gate-resend">Resend code</button>' +
        '<button class="mwa-link" id="mwa-gate-back">&larr; Edit details</button>' +
      '</div>' +
    '</div>' +
    '<div id="mwa-tutor-body" style="display:none;"></div>' +
    '<div id="mwa-tutor-input-row" style="display:none;">' +
      '<textarea id="mwa-tutor-input" rows="1" maxlength="' + MAX_INPUT_CHARS + '" placeholder="Type your maths question…"></textarea>' +
      '<button id="mwa-tutor-send">Send</button>' +
    '</div>';
  document.body.appendChild(panel);

  var body = panel.querySelector("#mwa-tutor-body");
  var inputRow = panel.querySelector("#mwa-tutor-input-row");
  var gate = panel.querySelector("#mwa-tutor-gate");
  var gateError = panel.querySelector("#mwa-tutor-gate-error");
  var stepDetails = panel.querySelector("#mwa-gate-step-details");
  var stepOtp = panel.querySelector("#mwa-gate-step-otp");
  var input = panel.querySelector("#mwa-tutor-input");
  var sendBtn = panel.querySelector("#mwa-tutor-send");
  var resendBtn = panel.querySelector("#mwa-gate-resend");

  var history = []; // {role, content}
  var session = null; // {name, email, phone, token, expiresAt}
  try {
    var stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.token && parsed.expiresAt > Date.now()) session = parsed;
    }
  } catch (e) {}

  var pending = { name: "", email: "", phone: "", grade: "" }; // details captured before OTP confirms

  function showGateError(msg) {
    gateError.textContent = msg;
    gateError.style.display = msg ? "block" : "none";
  }

  function openPanel() {
    panel.classList.add("mwa-open");
    if (session) showChat();
  }
  function closePanel() {
    panel.classList.remove("mwa-open");
  }
  btn.addEventListener("click", openPanel);
  panel.querySelector("#mwa-tutor-close").addEventListener("click", closePanel);

  function showChat() {
    gate.style.display = "none";
    body.style.display = "flex";
    inputRow.style.display = "flex";
    if (body.children.length === 0) {
      addMessage("bot", "Hi " + session.name.split(" ")[0] + "! I'm your AI maths tutor. Tell me what you're stuck on — a specific question, or a concept you'd like explained.");
    }
    input.focus();
  }

  function showGate() {
    body.style.display = "none";
    inputRow.style.display = "none";
    gate.style.display = "flex";
    stepDetails.style.display = "block";
    stepOtp.style.display = "none";
    showGateError("");
  }

  // --- Step 1: collect details, request a code ---
  panel.querySelector("#mwa-gate-send-code").addEventListener("click", function () {
    var name = panel.querySelector("#mwa-gate-name").value.trim();
    var email = panel.querySelector("#mwa-gate-email").value.trim();
    var phone = panel.querySelector("#mwa-gate-phone").value.trim();
    var grade = panel.querySelector("#mwa-gate-grade").value;

    if (!name) return showGateError("Please enter your name.");
    if (!email || email.indexOf("@") === -1) return showGateError("Please enter a valid email address.");
    if (!phone || phone.replace(/\D/g, "").length < 8) return showGateError("Please enter a valid phone number, with country code.");

    pending = { name: name, email: email, phone: phone, grade: grade };
    showGateError("");
    var btnEl = this;
    btnEl.disabled = true;
    btnEl.textContent = "Sending…";

    fetch("/api/otp-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pending),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok) {
          showGateError(result.data.error || "Couldn't send the code. Please try again.");
          return;
        }
        panel.querySelector("#mwa-gate-otp-email").textContent = email;
        stepDetails.style.display = "none";
        stepOtp.style.display = "block";
        startResendCooldown();
        panel.querySelector("#mwa-gate-code").focus();
      })
      .catch(function () { showGateError("Couldn't reach the server. Check your connection and try again."); })
      .finally(function () {
        btnEl.disabled = false;
        btnEl.textContent = "Send verification code";
      });
  });

  // --- Step 2: verify the code ---
  panel.querySelector("#mwa-gate-verify").addEventListener("click", function () {
    var code = panel.querySelector("#mwa-gate-code").value.trim();
    if (!/^\d{6}$/.test(code)) return showGateError("Enter the 6-digit code from your email.");

    showGateError("");
    var btnEl = this;
    btnEl.disabled = true;
    btnEl.textContent = "Verifying…";

    fetch("/api/otp-verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: pending.email, code: code }),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok) {
          showGateError(result.data.error || "That code didn't work. Please try again.");
          return;
        }
        session = {
          name: result.data.name || pending.name,
          email: pending.email,
          phone: result.data.phone || pending.phone,
          grade: pending.grade,
          token: result.data.token,
          expiresAt: result.data.expiresAt,
        };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
        showChat();
      })
      .catch(function () { showGateError("Couldn't reach the server. Check your connection and try again."); })
      .finally(function () {
        btnEl.disabled = false;
        btnEl.textContent = "Verify & start chatting";
      });
  });

  function startResendCooldown() {
    var until = Date.now() + RESEND_COOLDOWN_MS;
    resendBtn.disabled = true;
    var tick = function () {
      var remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend code";
        return;
      }
      resendBtn.textContent = "Resend code (" + remaining + "s)";
      setTimeout(tick, 1000);
    };
    tick();
  }

  resendBtn.addEventListener("click", function () {
    if (resendBtn.disabled) return;
    fetch("/api/otp-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pending),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok) { showGateError(result.data.error || "Couldn't resend the code."); return; }
        showGateError("");
        startResendCooldown();
      })
      .catch(function () { showGateError("Couldn't reach the server."); });
  });

  panel.querySelector("#mwa-gate-back").addEventListener("click", function () {
    stepOtp.style.display = "none";
    stepDetails.style.display = "block";
    showGateError("");
  });

  function addMessage(kind, text) {
    var div = document.createElement("div");
    div.className = "mwa-msg mwa-msg-" + kind;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function sendMessage() {
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "auto";
    history.push({ role: "user", content: text });
    addMessage("user", text);

    sendBtn.disabled = true;
    var thinking = addMessage("bot", "Thinking…");

    fetch("/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: session.token,
        grade: session.grade,
        messages: history,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        thinking.remove();
        if (!result.ok) {
          if (result.data.code === "REVERIFY") {
            session = null;
            try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
            showGate();
            showGateError("Your session expired — please verify your email again.");
            history.pop();
            return;
          }
          addMessage("err", result.data.error || "Something went wrong. Please try again.");
          history.pop();
          return;
        }
        history.push({ role: "assistant", content: result.data.reply });
        addMessage("bot", result.data.reply);
      })
      .catch(function () {
        thinking.remove();
        addMessage("err", "Couldn't reach the AI tutor — check your connection and try again.");
        history.pop();
      })
      .finally(function () {
        sendBtn.disabled = false;
        input.focus();
      });
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 80) + "px";
  });
})();
