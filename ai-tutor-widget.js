/* AI Maths Tutor widget for Maths with Ankush.
   Self-contained: injects its own button, panel, styles and logic.
   Talks to /api/tutor (a Cloudflare Pages Function) — never calls
   the Claude API directly from the browser. */
(function () {
  var NAVY = "#1b2a4b";
  var NAVY_DARK = "#15223f";
  var GOLD = "#ed9f17";
  var CREAM = "#faf7f0";
  var LEAD_KEY = "mwaTutorLead";
  var MAX_INPUT_CHARS = 600;

  var css = "" +
    "#mwa-tutor-btn{position:fixed;bottom:22px;right:22px;z-index:9999;background:" + GOLD + ";color:" + NAVY_DARK + ";border:none;border-radius:999px;padding:14px 20px;font-family:'Source Sans 3',sans-serif;font-weight:700;font-size:15px;box-shadow:0 10px 28px rgba(27,42,75,.35);cursor:pointer;display:flex;align-items:center;gap:9px;}" +
    "#mwa-tutor-btn:hover{filter:brightness(1.05);}" +
    "#mwa-tutor-panel{position:fixed;bottom:22px;right:22px;z-index:10000;width:360px;max-width:calc(100vw - 28px);height:520px;max-height:calc(100vh - 40px);background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.32);display:none;flex-direction:column;overflow:hidden;font-family:'Source Sans 3',sans-serif;}" +
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
    "#mwa-tutor-gate{padding:20px;display:flex;flex-direction:column;gap:12px;background:" + CREAM + ";flex:1;}" +
    "#mwa-tutor-gate p{font-size:14px;color:#51596b;margin:0 0 4px;line-height:1.5;}" +
    "#mwa-tutor-gate input,#mwa-tutor-gate select{padding:11px 12px;border:1px solid #e0d8c6;border-radius:6px;font-size:14.5px;font-family:inherit;color:" + NAVY_DARK + ";}" +
    "#mwa-tutor-gate button{margin-top:4px;background:" + GOLD + ";color:" + NAVY_DARK + ";border:none;border-radius:6px;padding:12px;font-weight:700;font-size:15px;cursor:pointer;}" +
    "#mwa-tutor-gate-note{font-size:11.5px;color:#8a8270;margin-top:2px;}" +
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
      '<p>Quick intro so Ankush knows who’s asking — this also helps us keep the tutor free for everyone.</p>' +
      '<input id="mwa-gate-name" placeholder="Your name" maxlength="100">' +
      '<input id="mwa-gate-email" placeholder="Your email" type="email" maxlength="200">' +
      '<select id="mwa-gate-grade">' +
        '<option value="">Grade (optional)</option>' +
        '<option value="9">Grade 9</option><option value="10">Grade 10</option>' +
        '<option value="11">Grade 11</option><option value="12">Grade 12</option>' +
        '<option value="JEE">JEE aspirant</option>' +
      '</select>' +
      '<button id="mwa-gate-start">Start chatting</button>' +
      '<div id="mwa-tutor-gate-note">This tutor guides you through problems step by step — for full personalised classes, <a href="#contact" style="color:' + NAVY + ';font-weight:700;">book a free trial with Ankush</a>.</div>' +
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
  var input = panel.querySelector("#mwa-tutor-input");
  var sendBtn = panel.querySelector("#mwa-tutor-send");

  var history = []; // {role, content}
  var lead = null;
  try {
    var stored = localStorage.getItem(LEAD_KEY);
    if (stored) lead = JSON.parse(stored);
  } catch (e) {}

  function openPanel() {
    panel.classList.add("mwa-open");
    if (lead && lead.name && lead.email) showChat();
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
      addMessage("bot", "Hi " + lead.name.split(" ")[0] + "! I'm your AI maths tutor. Tell me what you're stuck on — a specific question, or a concept you'd like explained.");
    }
    input.focus();
  }

  panel.querySelector("#mwa-gate-start").addEventListener("click", function () {
    var name = panel.querySelector("#mwa-gate-name").value.trim();
    var email = panel.querySelector("#mwa-gate-email").value.trim();
    var grade = panel.querySelector("#mwa-gate-grade").value;
    if (!name || !email || email.indexOf("@") === -1) {
      alert("Please enter your name and a valid email to start.");
      return;
    }
    lead = { name: name, email: email, grade: grade };
    try {
      localStorage.setItem(LEAD_KEY, JSON.stringify(lead));
    } catch (e) {}
    showChat();
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
        name: lead.name,
        email: lead.email,
        grade: lead.grade,
        messages: history,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        thinking.remove();
        if (!result.ok) {
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
