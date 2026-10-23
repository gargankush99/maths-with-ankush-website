/**
 * Maths with Ankush — Verified Reviews (v1)
 * ------------------------------------------------------------
 * One Cloudflare Worker that provides:
 *   /          Full reviews page (Google-review style)
 *   /embed     Compact widget to embed in the website's testimonials section
 *   /write     Review form (opened from a private, single-use invite link)
 *   /admin     Ankush's private inbox: create invite links, approve/decline, reply
 *
 * Needs two things set in the Cloudflare dashboard:
 *   1. A D1 database bound to this Worker with the variable name  DB
 *   2. A secret named  ADMIN_KEY  (your admin password, 12+ characters)
 * Tables are created automatically on first visit.
 */

const SITE = {
  brand: 'Maths with Ankush',
  teacher: 'Ankush',
  siteUrl: 'https://maths-with-ankush.gargankush99.workers.dev/',
};

/* ───────────────────────── Database ───────────────────────── */

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, label TEXT NOT NULL, role TEXT NOT NULL, grade TEXT, board TEXT, created_at INTEGER NOT NULL, used_at INTEGER)'
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, grade TEXT, board TEXT, rating INTEGER NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reply TEXT, reply_at INTEGER, created_at INTEGER NOT NULL, decided_at INTEGER)"
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at)'),
  ]);
  schemaReady = true;
}

/* ───────────────────────── Helpers ───────────────────────── */

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

function page(body, opts = {}) {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
  if (opts.noframe) headers['X-Frame-Options'] = 'DENY';
  return new Response(body, { headers });
}

function cleanLine(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(v, max) {
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function makeToken() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

function adminCheck(request, env) {
  if (!env.ADMIN_KEY || String(env.ADMIN_KEY).length < 12) return 'setup';
  const h = request.headers.get('Authorization') || '';
  return h === 'Bearer ' + env.ADMIN_KEY ? 'ok' : 'denied';
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/* ───────────────────────── Public API ───────────────────────── */

async function publicReviews(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, role, grade, board, rating, body, reply, reply_at, created_at FROM reviews WHERE status = 'approved' ORDER BY created_at DESC"
  ).all();
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  for (const r of results) {
    dist[r.rating] = (dist[r.rating] || 0) + 1;
    total += r.rating;
  }
  const count = results.length;
  return json(
    {
      summary: { count, average: count ? Math.round((total / count) * 10) / 10 : 0, distribution: dist },
      reviews: results,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}

async function inviteInfo(env, token) {
  token = cleanLine(token, 40);
  if (!token) return json({ valid: false });
  const inv = await env.DB.prepare('SELECT token, label, role, grade, board, used_at FROM invites WHERE token = ?')
    .bind(token)
    .first();
  if (!inv) return json({ valid: false });
  return json({ valid: true, used: !!inv.used_at, label: inv.label, role: inv.role, grade: inv.grade, board: inv.board });
}

async function submitReview(request, env) {
  const b = await readJson(request);
  if (!b) return json({ error: 'Invalid request.' }, 400);

  const token = cleanLine(b.token, 40);
  const name = cleanLine(b.name, 40);
  const body = cleanText(b.body, 1500);
  const rating = Number(b.rating);

  if (!token) return json({ error: 'This review link is missing its code.' }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: 'Please choose a star rating.' }, 400);
  if (name.length < 2) return json({ error: 'Please enter the name you would like shown.' }, 400);
  if (body.length < 20) return json({ error: 'Please write at least a sentence or two (20+ characters).' }, 400);
  if (b.consent !== true) return json({ error: 'Please tick the box agreeing to your review being shown publicly.' }, 400);

  const inv = await env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first();
  if (!inv) return json({ error: 'This review link is not valid. Please ask Ankush for a new one.' }, 404);
  if (inv.role === 'student' && b.guardian !== true) {
    return json({ error: 'Please confirm you are 18+ or that a parent/guardian has agreed.' }, 400);
  }
  const existing = await env.DB.prepare('SELECT id FROM reviews WHERE token = ?').bind(token).first();
  if (existing || inv.used_at) return json({ error: 'A review has already been submitted from this link. Thank you!' }, 409);

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO reviews (token, name, role, grade, board, rating, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(token, name, inv.role, inv.grade || null, inv.board || null, rating, body, 'pending', now),
    env.DB.prepare('UPDATE invites SET used_at = ? WHERE token = ?').bind(now, token),
  ]);
  return json({ ok: true });
}

/* ───────────────────────── Admin API ───────────────────────── */

const ROLES = ['parent', 'student'];
const GRADES = ['', '9', '10', '11', '12'];
const BOARDS = ['', 'CBSE', 'ICSE', 'IB', 'IGCSE', 'State board'];
const STATUSES = ['approved', 'rejected', 'pending'];

async function adminRoutes(request, env, p) {
  const method = request.method;

  if (p === '/api/admin/check' && method === 'GET') return json({ ok: true });

  if (p === '/api/admin/reviews' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT r.*, i.label AS invite_label FROM reviews r LEFT JOIN invites i ON i.token = r.token ORDER BY r.created_at DESC'
    ).all();
    return json({ reviews: results });
  }

  const m = p.match(/^\/api\/admin\/reviews\/(\d+)$/);
  if (m && method === 'POST') {
    const b = await readJson(request);
    if (!b) return json({ error: 'Invalid request.' }, 400);
    const sets = [];
    const vals = [];
    if (b.action !== undefined) {
      if (!STATUSES.includes(b.action)) return json({ error: 'Unknown action.' }, 400);
      sets.push('status = ?', 'decided_at = ?');
      vals.push(b.action, Date.now());
    }
    if (typeof b.reply === 'string') {
      const reply = cleanText(b.reply, 1000);
      sets.push('reply = ?', 'reply_at = ?');
      vals.push(reply || null, reply ? Date.now() : null);
    }
    if (!sets.length) return json({ error: 'Nothing to update.' }, 400);
    await env.DB.prepare('UPDATE reviews SET ' + sets.join(', ') + ' WHERE id = ?')
      .bind(...vals, Number(m[1]))
      .run();
    return json({ ok: true });
  }

  if (p === '/api/admin/invites' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT i.*, r.status AS review_status FROM invites i LEFT JOIN reviews r ON r.token = i.token ORDER BY i.created_at DESC'
    ).all();
    return json({ invites: results });
  }

  if (p === '/api/admin/invites' && method === 'POST') {
    const b = await readJson(request);
    if (!b) return json({ error: 'Invalid request.' }, 400);
    const label = cleanLine(b.label, 60);
    const role = String(b.role || '');
    const grade = String(b.grade || '');
    const board = String(b.board || '');
    if (label.length < 2) return json({ error: 'Enter who this link is for.' }, 400);
    if (!ROLES.includes(role)) return json({ error: 'Choose parent or student.' }, 400);
    if (!GRADES.includes(grade)) return json({ error: 'Choose a valid grade.' }, 400);
    if (!BOARDS.includes(board)) return json({ error: 'Choose a valid board.' }, 400);
    const token = makeToken();
    await env.DB.prepare('INSERT INTO invites (token, label, role, grade, board, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(token, label, role, grade || null, board || null, Date.now())
      .run();
    return json({ ok: true, token });
  }

  return json({ error: 'Not found' }, 404);
}

/* ───────────────────────── Router ───────────────────────── */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (!env.DB) {
        return new Response('Setup incomplete: bind a D1 database to this Worker with the variable name "DB".', { status: 500 });
      }
      await ensureSchema(env);

      if (request.method === 'GET') {
        if (p === '/') return page(fullPage());
        if (p === '/embed') return page(embedPage());
        if (p === '/write') return page(writePage());
        if (p === '/admin') return page(adminPage(), { noframe: true });
        if (p === '/api/reviews') return publicReviews(env);
        if (p === '/api/invite') return inviteInfo(env, url.searchParams.get('t'));
      }
      if (request.method === 'POST' && p === '/api/reviews') return submitReview(request, env);

      if (p.startsWith('/api/admin/')) {
        const auth = adminCheck(request, env);
        if (auth === 'setup') return json({ error: 'Set a secret named ADMIN_KEY (12+ characters) on this Worker first.' }, 500);
        if (auth !== 'ok') return json({ error: 'Wrong admin key.' }, 401);
        return adminRoutes(request, env, p);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: 'Server error', detail: String((e && e.message) || e) }, 500);
    }
  },
};

/* ═════════════════════════ PAGES ═════════════════════════ */

const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">';

/* Brand colours live here — change --accent to match the site */
const BASE_CSS = `
:root{--ink:#1f2937;--muted:#6b7280;--line:#e5e7eb;--card:#ffffff;--soft:#f8fafc;--accent:#1e3a8a;--accent-soft:#eff6ff;--star:#f5a623;--star-off:#dadce0;--ok:#15803d;--ok-soft:#ecfdf5;--bad:#b91c1c;--bad-soft:#fef2f2}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--soft);line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
button,input,select,textarea{font:inherit;color:inherit}
.st{fill:var(--star-off);display:inline-block;vertical-align:middle;flex-shrink:0}
.st.on{fill:var(--star)}
.avgstars{position:relative;display:inline-block;white-space:nowrap;line-height:0}
.avgstars .fill{position:absolute;top:0;left:0;overflow:hidden;white-space:nowrap}
.sum{display:flex;gap:28px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 24px}
.sum-left{text-align:center;min-width:120px}
.avg{font-size:48px;font-weight:700;line-height:1}
.cnt{font-size:13px;color:var(--muted);margin-top:6px}
.bars{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.bar{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)}
.bar span{width:8px;text-align:right}
.track{flex:1;height:9px;background:#eceff3;border-radius:6px;overflow:hidden}
.fillbar{height:100%;background:var(--star);border-radius:6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px}
.card header{display:flex;gap:12px;align-items:center}
.av{width:40px;height:40px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:17px;flex-shrink:0}
.nm{font-weight:600;font-size:15px}
.badge{display:inline-flex;align-items:flex-start;gap:4px;font-size:12px;color:var(--ok);font-weight:500}
.badge svg{width:13px;height:13px;fill:var(--ok);flex-shrink:0;margin-top:3px}
.meta{display:flex;align-items:center;gap:8px}
.when{font-size:13px;color:var(--muted)}
.txt{font-size:14px;white-space:pre-line;color:#374151}
.clamp{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.more{background:none;border:0;color:var(--accent);font-size:13px;font-weight:600;cursor:pointer;align-self:flex-start;padding:0}
.reply{background:var(--soft);border-left:3px solid var(--accent);border-radius:8px;padding:10px 12px;font-size:13px}
.rh{font-weight:600;font-size:13px;margin-bottom:2px}
.rh span{font-weight:400;color:var(--muted)}
.reply p{white-space:pre-line;color:#374151}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:28px;text-align:center;color:var(--muted);font-size:14px}
`;

/* Shared renderer used by the full page and the embed */
const RENDER_JS = `
var PALETTE=['#1a73e8','#d93025','#188038','#e37400','#9334e6','#007b83','#c5221f','#3949ab'];
var STAR_PATH='M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z';
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function colourFor(s){var h=0;for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;}return PALETTE[h%PALETTE.length];}
function stars(n,size,on){var o='';for(var i=1;i<=5;i++){o+='<svg class="st'+((on||i<=n)?' on':'')+'" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" aria-hidden="true"><path d="'+STAR_PATH+'"/></svg>';}return o;}
function avgStars(avg,size){var pct=Math.max(0,Math.min(100,avg/5*100));return '<span class="avgstars" role="img" aria-label="'+avg+' out of 5 stars"><span>'+stars(0,size)+'</span><span class="fill" style="width:'+pct+'%">'+stars(5,size,true)+'</span></span>';}
function ago(ms){var d=Math.floor((Date.now()-ms)/86400000);if(d<1)return 'today';if(d<2)return 'yesterday';if(d<7)return d+' days ago';var w=Math.floor(d/7);if(d<30)return w===1?'a week ago':w+' weeks ago';var m=Math.floor(d/30);if(d<365)return m<=1?'a month ago':m+' months ago';var y=Math.floor(d/365);return y===1?'a year ago':y+' years ago';}
var TICK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9L3.2 15.8l.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2zm-1.2 13.2l5.6-5.6-1.4-1.4-4.2 4.2-2-2-1.4 1.4z"/></svg>';
function badge(r){var t='Verified '+(r.role==='student'?'student':'parent');if(r.grade)t+=' · Grade '+esc(r.grade);if(r.board)t+=' · '+esc(r.board);return '<span class="badge">'+TICK+t+'</span>';}
function card(r,compact){
  var initial=esc((r.name||'?').trim().charAt(0).toUpperCase());
  var h='<article class="card"><header><div class="av" style="background:'+colourFor(r.name||'')+'">'+initial+'</div><div><div class="nm">'+esc(r.name)+'</div>'+badge(r)+'</div></header>';
  h+='<div class="meta" role="img" aria-label="Rated '+r.rating+' out of 5">'+stars(r.rating,16)+'<span class="when">'+ago(r.created_at)+'</span></div>';
  h+='<p class="txt clamp">'+esc(r.body)+'</p><button class="more" hidden>Read more</button>';
  if(r.reply){h+='<div class="reply"><div class="rh">Reply from Ankush <span>· '+ago(r.reply_at||r.created_at)+'</span></div><p class="'+(compact?'clamp2':'')+'">'+esc(r.reply)+'</p></div>';}
  return h+'</article>';
}
function summary(s){
  var h='<div class="sum"><div class="sum-left"><div class="avg">'+s.average.toFixed(1)+'</div>'+avgStars(s.average,18)+'<div class="cnt">'+s.count+' review'+(s.count===1?'':'s')+'</div></div><div class="bars">';
  for(var k=5;k>=1;k--){var n=s.distribution[k]||0;var pct=s.count?Math.round(n/s.count*100):0;h+='<div class="bar" aria-label="'+k+' star: '+n+'"><span>'+k+'</span><div class="track"><div class="fillbar" style="width:'+pct+'%"></div></div></div>';}
  return h+'</div></div>';
}
function wireMore(root){
  var cards=root.querySelectorAll('.card');
  for(var i=0;i<cards.length;i++){(function(c){var t=c.querySelector('.txt');var b=c.querySelector('.more');if(t.scrollHeight>t.clientHeight+2){b.hidden=false;b.onclick=function(){var open=t.classList.toggle('clamp');b.textContent=open?'Read more':'Show less';};}})(cards[i]);}
}
function sortList(list,how){
  var a=list.slice();
  if(how==='highest')a.sort(function(x,y){return y.rating-x.rating||y.created_at-x.created_at;});
  else if(how==='lowest')a.sort(function(x,y){return x.rating-y.rating||y.created_at-x.created_at;});
  else a.sort(function(x,y){return y.created_at-x.created_at;});
  return a;
}
`;

function fullPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reviews — ${SITE.brand}</title>
<meta name="description" content="Verified reviews from students and parents of ${SITE.brand}.">
${FONT}<style>${BASE_CSS}
.top{background:var(--card);border-bottom:1px solid var(--line)}
.top div{max-width:1040px;margin:0 auto;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.top a{text-decoration:none;font-weight:700;color:var(--ink)}
.top .cta{background:var(--accent);color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600}
.wrap{max-width:1040px;margin:0 auto;padding:28px 16px 48px}
h1{font-size:26px;font-weight:800;margin-bottom:6px}
.lede{color:var(--muted);font-size:14px;margin-bottom:18px}
.toolbar{display:flex;justify-content:space-between;align-items:center;margin:22px 0 12px;gap:12px;flex-wrap:wrap}
.toolbar select{border:1px solid var(--line);border-radius:999px;padding:7px 12px;background:var(--card);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;align-items:start}
.how{margin-top:32px;background:var(--accent-soft);border:1px solid #dbeafe;border-radius:14px;padding:18px 20px}
.how h2{font-size:15px;margin-bottom:8px}
.how li{font-size:13px;color:#334155;margin:4px 0 4px 18px}
@media(max-width:560px){.sum{flex-direction:column;align-items:stretch;gap:14px}.avg{font-size:40px}h1{font-size:22px}}
</style></head><body>
<div class="top"><div><a href="${SITE.siteUrl}">← ${SITE.brand}</a><a class="cta" href="${SITE.siteUrl}#contact">Book a free trial</a></div></div>
<main class="wrap">
<h1>Reviews from students &amp; parents</h1>
<p class="lede">Every review here comes from an enrolled student or their parent.</p>
<div id="sum"></div>
<div class="toolbar"><strong id="count" style="font-size:14px"></strong>
<label style="font-size:13px;color:var(--muted)">Sort by&nbsp;<select id="sort"><option value="newest">Newest</option><option value="highest">Highest rating</option><option value="lowest">Lowest rating</option></select></label></div>
<div id="list" class="grid"></div>
<section class="how"><h2>How these reviews are collected</h2><ul>
<li>Each review comes from a private, single-use link sent only to an enrolled student or parent — so every reviewer is a real ${SITE.brand} family.</li>
<li>Ankush can approve or reply to a review, but cannot edit what the reviewer wrote.</li>
<li>Reviews are declined only if they contain personal information or abusive language — never for being critical.</li>
<li>The overall rating is calculated from every approved review, including lower ratings.</li>
</ul></section>
</main>
<script>${RENDER_JS}
var ALL=[];
function draw(){var list=sortList(ALL,document.getElementById('sort').value);var el=document.getElementById('list');el.innerHTML=list.map(function(r){return card(r,false);}).join('');wireMore(el);}
fetch('/api/reviews').then(function(r){return r.json();}).then(function(d){
  ALL=d.reviews||[];
  if(!ALL.length){document.getElementById('sum').innerHTML='<div class="empty">Reviews from enrolled families will appear here soon.</div>';document.querySelector('.toolbar').style.display='none';return;}
  document.getElementById('sum').innerHTML=summary(d.summary);
  document.getElementById('count').textContent=d.summary.count+' review'+(d.summary.count===1?'':'s');
  draw();
}).catch(function(){document.getElementById('sum').innerHTML='<div class="empty">Reviews could not be loaded right now. Please refresh.</div>';});
document.getElementById('sort').onchange=draw;
</script></body></html>`;
}

function embedPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reviews — ${SITE.brand}</title><meta name="robots" content="noindex">
${FONT}<style>${BASE_CSS}
html,body{background:transparent}
body{padding:4px}
.emb{display:flex;gap:14px;align-items:stretch}
.emb .sum{flex-direction:column;align-items:stretch;gap:14px;width:230px;flex-shrink:0;padding:18px}
.rail{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;flex:1;min-width:0}
.rail .card{width:290px;flex-shrink:0;scroll-snap-align:start}
.rail .clamp{-webkit-line-clamp:6}
.clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--muted)}
.foot a{font-weight:600;font-size:13px;text-decoration:none}
@media(max-width:640px){
 .emb{flex-direction:column}
 .emb .sum{width:auto;flex-direction:row;align-items:center;padding:12px 16px}
 .emb .bars{display:none}
 .emb .sum-left{display:flex;align-items:center;gap:10px;text-align:left}
 .emb .avg{font-size:32px}.emb .cnt{margin:0}
 .rail .card{width:82vw;max-width:300px}
}
</style></head><body>
<div class="emb"><div id="sum"></div><div class="rail" id="list"></div></div>
<div class="foot"><span>✓ Collected via private links sent only to enrolled families</span><a id="all" href="/" target="_blank" rel="noopener">See all reviews →</a></div>
<script>${RENDER_JS}
fetch('/api/reviews').then(function(r){return r.json();}).then(function(d){
  var list=d.reviews||[];
  if(!list.length){document.querySelector('.emb').innerHTML='<div class="empty" style="flex:1">Reviews from enrolled families will appear here soon.</div>';document.getElementById('all').style.display='none';return;}
  document.getElementById('sum').innerHTML=summary(d.summary);
  var el=document.getElementById('list');
  el.innerHTML=sortList(list,'newest').slice(0,12).map(function(r){return card(r,true);}).join('');
  wireMore(el);
  document.getElementById('all').textContent='See all '+d.summary.count+' review'+(d.summary.count===1?'':'s')+' →';
}).catch(function(){});
</script></body></html>`;
}

function writePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Write a review — ${SITE.brand}</title><meta name="robots" content="noindex">
${FONT}<style>${BASE_CSS}
.wrap{max-width:560px;margin:0 auto;padding:28px 16px 48px}
.box{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}
h1{font-size:22px;font-weight:800;margin-bottom:4px}
.sub{color:var(--muted);font-size:14px;margin-bottom:20px}
label.f{display:block;font-weight:600;font-size:14px;margin:18px 0 6px}
.hint{font-weight:400;color:var(--muted);font-size:12px}
input[type=text],textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;font-size:15px;background:#fff}
input[type=text]:focus,textarea:focus{outline:2px solid var(--accent-soft);border-color:var(--accent)}
textarea{min-height:150px;resize:vertical}
.picker{display:flex;gap:4px;align-items:center}
.picker button{background:none;border:0;cursor:pointer;padding:2px;line-height:0}
.picker button:focus-visible{outline:2px solid var(--accent);border-radius:6px}
.plabel{margin-left:10px;font-size:14px;color:var(--muted);font-weight:500}
.chk{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#374151;margin-top:14px}
.chk input{margin-top:3px;width:16px;height:16px;flex-shrink:0}
.btn{margin-top:22px;width:100%;background:var(--accent);color:#fff;border:0;border-radius:12px;padding:13px;font-size:15px;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.6;cursor:default}
.err{margin-top:12px;background:var(--bad-soft);color:var(--bad);border-radius:10px;padding:10px 12px;font-size:13px;display:none}
.counter{text-align:right;font-size:12px;color:var(--muted);margin-top:4px}
.done{text-align:center;padding:12px 0}
.done .big{font-size:44px}
.brand{text-align:center;font-weight:700;margin-bottom:16px;color:var(--accent)}
</style></head><body><main class="wrap">
<div class="brand">${SITE.brand}</div>
<div class="box" id="box"><p class="sub">Loading…</p></div>
</main>
<script>
var STAR_PATH='M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z';
var LABELS=['','Poor','Fair','Good','Very good','Excellent'];
var token=new URLSearchParams(location.search).get('t')||'';
var box=document.getElementById('box');
var rating=0, INV=null;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function msg(icon,title,text){box.innerHTML='<div class="done"><div class="big">'+icon+'</div><h1>'+title+'</h1><p class="sub" style="margin:8px 0 0">'+text+'</p></div>';}
function paintStars(n){var bs=document.querySelectorAll('.picker button');for(var i=0;i<bs.length;i++){bs[i].querySelector('svg').style.fill=(i<n)?'var(--star)':'var(--star-off)';bs[i].setAttribute('aria-checked',String(i+1===rating));}document.getElementById('plabel').textContent=LABELS[n]||'Tap a star';}
function form(inv){
  var who=inv.role==='student'?'student':'parent';
  var ctx=(inv.grade?'Grade '+esc(inv.grade):'')+(inv.board?(inv.grade?' · ':'')+esc(inv.board):'');
  var h='<h1>How have the classes been?</h1><p class="sub">This private link was created for <strong>'+esc(inv.label)+'</strong>'+(ctx?' ('+ctx+')':'')+'. Your honest feedback — good or bad — helps other families decide and helps Ankush improve.</p>';
  h+='<label class="f">Your rating</label><div class="picker" role="radiogroup" aria-label="Star rating">';
  for(var i=1;i<=5;i++){h+='<button type="button" role="radio" aria-checked="false" aria-label="'+i+' star'+(i>1?'s':'')+' — '+LABELS[i]+'" data-v="'+i+'"><svg viewBox="0 0 24 24" width="38" height="38" style="fill:var(--star-off)"><path d="'+STAR_PATH+'"/></svg></button>';}
  h+='<span class="plabel" id="plabel">Tap a star</span></div>';
  h+='<label class="f" for="body">Your review <span class="hint">— what changed, what you liked, what could be better</span></label><textarea id="body" maxlength="1500" placeholder="e.g. My daughter used to dread calculus. After two months her test scores went from… The one thing I would improve is…"></textarea><div class="counter" id="counter">0 / 1500</div>';
  h+='<label class="f" for="name">Name to show publicly <span class="hint">— first name and surname initial is enough</span></label><input type="text" id="name" maxlength="40" placeholder="e.g. Priya S.">';
  h+='<p class="hint" style="margin-top:6px">It will appear as: <strong>Verified '+who+(ctx?' · '+ctx:'')+'</strong></p>';
  h+='<label class="chk"><input type="checkbox" id="consent"><span>I agree that the name above, my rating and my review can be shown publicly on the ${SITE.brand} website.</span></label>';
  if(inv.role==='student'){h+='<label class="chk"><input type="checkbox" id="guardian"><span>I am 18 or older, or my parent/guardian has agreed to this review being published.</span></label>';}
  h+='<div class="err" id="err"></div><button class="btn" id="send">Submit review</button>';
  box.innerHTML=h;
  var bs=document.querySelectorAll('.picker button');
  for(var j=0;j<bs.length;j++){(function(b){var v=Number(b.getAttribute('data-v'));b.onclick=function(){rating=v;paintStars(v);};b.onmouseenter=function(){paintStars(v);};b.onmouseleave=function(){paintStars(rating);};})(bs[j]);}
  var body=document.getElementById('body');body.oninput=function(){document.getElementById('counter').textContent=body.value.length+' / 1500';};
  document.getElementById('send').onclick=submit;
}
function showErr(t){var e=document.getElementById('err');e.textContent=t;e.style.display='block';}
function submit(){
  var g=document.getElementById('guardian');
  var payload={token:token,rating:rating,body:document.getElementById('body').value,name:document.getElementById('name').value,consent:document.getElementById('consent').checked,guardian:g?g.checked:undefined};
  if(!rating)return showErr('Please choose a star rating.');
  if(payload.body.trim().length<20)return showErr('Please write at least a sentence or two (20+ characters).');
  if(payload.name.trim().length<2)return showErr('Please enter the name you would like shown.');
  if(!payload.consent)return showErr('Please tick the box agreeing to your review being shown publicly.');
  if(g&&!g.checked)return showErr('Please confirm you are 18+ or that a parent/guardian has agreed.');
  var btn=document.getElementById('send');btn.disabled=true;btn.textContent='Sending…';
  fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
   .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
   .then(function(res){if(!res.ok){btn.disabled=false;btn.textContent='Submit review';return showErr(res.j.error||'Something went wrong. Please try again.');}
     msg('🙏','Thank you!','Your review has been received. It will appear on the website after a quick check (usually within a day).');})
   .catch(function(){btn.disabled=false;btn.textContent='Submit review';showErr('Network problem — please check your connection and try again.');});
}
if(!token){msg('🔗','Link incomplete','This page needs a private review link. Please ask Ankush on WhatsApp for yours.');}
else{fetch('/api/invite?t='+encodeURIComponent(token)).then(function(r){return r.json();}).then(function(inv){
  if(!inv.valid)return msg('🔗','Link not recognised','This review link isn\\'t valid. Please ask Ankush on WhatsApp for a new one.');
  if(inv.used)return msg('✅','Already received','A review has already been submitted from this link. Thank you for taking the time!');
  INV=inv;form(inv);
}).catch(function(){msg('⚠️','Could not load','Please check your connection and refresh the page.');});}
</script></body></html>`;
}

function adminPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reviews admin — ${SITE.brand}</title><meta name="robots" content="noindex,nofollow">
${FONT}<style>${BASE_CSS}
.wrap{max-width:900px;margin:0 auto;padding:22px 16px 60px}
h1{font-size:20px;font-weight:800}
.bar0{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.tab{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer}
.tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.tab .n{opacity:.75;font-weight:500;margin-left:4px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.item{border-top:1px solid var(--line);padding:16px 0}
.item:first-child{border-top:0;padding-top:0}
.who{font-size:12px;color:var(--muted);margin-top:2px}
.acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.b{border:1px solid var(--line);background:#fff;border-radius:10px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer}
.b.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
.b.ok{background:var(--ok);color:#fff;border-color:var(--ok)}
.b.no{color:var(--bad);border-color:#fecaca}
textarea,input[type=text],input[type=password],select{width:100%;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:14px;background:#fff}
textarea{min-height:70px;margin-top:8px}
.row{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px}
@media(max-width:640px){.row{grid-template-columns:1fr 1fr}}
.lbl{font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block}
.newlink{margin-top:14px;background:var(--ok-soft);border:1px solid #bbf7d0;border-radius:12px;padding:14px;display:none}
.code{font-family:ui-monospace,Consolas,monospace;font-size:13px;word-break:break-all;background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
td,th{text-align:left;padding:9px 8px;border-top:1px solid var(--line);vertical-align:top}
th{font-size:11px;letter-spacing:.5px;color:var(--muted);text-transform:uppercase;border-top:0}
.pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600;background:var(--soft);border:1px solid var(--line)}
.p-approved{background:var(--ok-soft);color:var(--ok);border-color:#bbf7d0}
.p-rejected{background:var(--bad-soft);color:var(--bad);border-color:#fecaca}
.p-pending{background:#fffbeb;color:#b45309;border-color:#fde68a}
.login{max-width:380px;margin:60px auto}
.note{font-size:12px;color:var(--muted);margin-top:10px}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:9px 16px;border-radius:999px;font-size:13px;display:none}
</style></head><body><main class="wrap" id="app"></main><div class="toast" id="toast"></div>
<script>
var STAR_PATH='M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z';
var KEY=''; try{KEY=sessionStorage.getItem('rk')||'';}catch(e){}
var TAB='pending', REVIEWS=[], INVITES=[];
var app=document.getElementById('app');
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function stars(n){var o='';for(var i=1;i<=5;i++){o+='<svg class="st'+(i<=n?' on':'')+'" viewBox="0 0 24 24" width="15" height="15"><path d="'+STAR_PATH+'"/></svg>';}return o;}
function dt(ms){return ms?new Date(ms).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';}
function toast(t){var e=document.getElementById('toast');e.textContent=t;e.style.display='block';clearTimeout(window.__t);window.__t=setTimeout(function(){e.style.display='none';},2200);}
function api(path,opts){opts=opts||{};opts.headers={'Content-Type':'application/json','Authorization':'Bearer '+KEY};
  return fetch(path,opts).then(function(r){return r.json().then(function(j){if(r.status===401){logout('Wrong admin key.');throw new Error('auth');}if(!r.ok)throw new Error(j.error||'Request failed');return j;});});}
function logout(m){KEY='';try{sessionStorage.removeItem('rk');}catch(e){}login(m);}
function login(m){
  app.innerHTML='<div class="login panel"><h1>Reviews admin</h1><p class="note" style="margin-bottom:14px">${SITE.brand}</p><label class="lbl" for="k">Admin key</label><input type="password" id="k" autocomplete="current-password"><button class="b pri" id="go" style="margin-top:12px;width:100%">Sign in</button>'+(m?'<p class="note" style="color:var(--bad)">'+esc(m)+'</p>':'')+'</div>';
  var go=function(){KEY=document.getElementById('k').value.trim();api('/api/admin/check').then(function(){try{sessionStorage.setItem('rk',KEY);}catch(e){}load();}).catch(function(e){if(e.message!=='auth')login(e.message);});};
  document.getElementById('go').onclick=go;document.getElementById('k').onkeydown=function(e){if(e.key==='Enter')go();};
}
function load(){Promise.all([api('/api/admin/reviews'),api('/api/admin/invites')]).then(function(r){REVIEWS=r[0].reviews;INVITES=r[1].invites;render();}).catch(function(e){if(e.message!=='auth')toast(e.message);});}
function count(s){return REVIEWS.filter(function(r){return r.status===s;}).length;}
function render(){
  var tabs=[['pending','Pending'],['approved','Approved'],['rejected','Declined'],['invites','Invite links']];
  var h='<div class="bar0"><h1>Reviews admin</h1><div style="display:flex;gap:8px"><a class="b" href="/" target="_blank">View public page ↗</a><button class="b" id="out">Sign out</button></div></div><div class="tabs">';
  tabs.forEach(function(t){var n=t[0]==='invites'?INVITES.length:count(t[0]);h+='<button class="tab'+(TAB===t[0]?' on':'')+'" data-t="'+t[0]+'">'+t[1]+'<span class="n">'+n+'</span></button>';});
  h+='</div><div class="panel" id="panel"></div>';
  app.innerHTML=h;
  document.getElementById('out').onclick=function(){logout('');};
  app.querySelectorAll('.tab').forEach(function(b){b.onclick=function(){TAB=b.getAttribute('data-t');render();};});
  if(TAB==='invites')renderInvites();else renderReviews();
}
function renderReviews(){
  var list=REVIEWS.filter(function(r){return r.status===TAB;});
  var p=document.getElementById('panel');
  if(!list.length){p.innerHTML='<p class="note" style="margin:0">Nothing here yet.</p>';return;}
  p.innerHTML=list.map(function(r){
    var ctx=(r.role==='student'?'Student':'Parent')+(r.grade?' · Grade '+esc(r.grade):'')+(r.board?' · '+esc(r.board):'');
    var a='<div class="item" data-id="'+r.id+'"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong>'+esc(r.name)+'</strong> '+stars(r.rating)+'<div class="who">'+ctx+' · invite: '+esc(r.invite_label||'—')+' · '+dt(r.created_at)+'</div></div><span class="pill p-'+r.status+'">'+r.status+'</span></div>';
    a+='<p class="txt" style="margin-top:8px">'+esc(r.body)+'</p>';
    a+='<label class="lbl" style="margin-top:12px">Public reply from Ankush (optional)</label><textarea data-reply placeholder="Thank you! …">'+esc(r.reply||'')+'</textarea>';
    a+='<div class="acts">';
    if(r.status!=='approved')a+='<button class="b ok" data-a="approved">Approve &amp; publish</button>';
    if(r.status!=='rejected')a+='<button class="b no" data-a="rejected">Decline</button>';
    if(r.status!=='pending')a+='<button class="b" data-a="pending">Move to pending</button>';
    a+='<button class="b" data-save>Save reply</button></div></div>';
    return a;}).join('');
  p.querySelectorAll('.item').forEach(function(it){
    var id=it.getAttribute('data-id');
    it.querySelectorAll('[data-a]').forEach(function(b){b.onclick=function(){var act=b.getAttribute('data-a');
      if(act==='rejected'&&!confirm('Decline this review? Only do this for personal information or abusive language — not for criticism.'))return;
      api('/api/admin/reviews/'+id,{method:'POST',body:JSON.stringify({action:act,reply:it.querySelector('[data-reply]').value})}).then(function(){toast(act==='approved'?'Published':'Updated');load();}).catch(function(e){toast(e.message);});};});
    it.querySelector('[data-save]').onclick=function(){api('/api/admin/reviews/'+id,{method:'POST',body:JSON.stringify({reply:it.querySelector('[data-reply]').value})}).then(function(){toast('Reply saved');load();}).catch(function(e){toast(e.message);});};
  });
}
function opt(v,l){return '<option value="'+v+'">'+l+'</option>';}
function renderInvites(){
  var p=document.getElementById('panel');
  var h='<h2 style="font-size:15px;margin-bottom:4px">Create a private review link</h2><p class="note" style="margin:0 0 12px">One link per family. It works once, and the review shows as “Verified”.</p>';
  h+='<div class="row"><div><label class="lbl">Who is it for? (private)</label><input type="text" id="label" placeholder="e.g. Riya Sharma\\'s mother"></div>';
  h+='<div><label class="lbl">Reviewer</label><select id="role">'+opt('parent','Parent')+opt('student','Student')+'</select></div>';
  h+='<div><label class="lbl">Grade</label><select id="grade">'+opt('','—')+opt('9','Grade 9')+opt('10','Grade 10')+opt('11','Grade 11')+opt('12','Grade 12')+'</select></div>';
  h+='<div><label class="lbl">Board</label><select id="board">'+opt('','—')+opt('CBSE','CBSE')+opt('ICSE','ICSE')+opt('IB','IB')+opt('IGCSE','IGCSE')+opt('State board','State board')+'</select></div></div>';
  h+='<button class="b pri" id="mk" style="margin-top:12px">Create link</button>';
  h+='<div class="newlink" id="nl"><strong>Link ready</strong><div class="code" id="link"></div><div class="acts" style="margin-top:0"><button class="b" id="cp">Copy link</button><a class="b ok" id="wa" target="_blank" rel="noopener" style="text-decoration:none">Send on WhatsApp</a></div></div>';
  h+='<table><thead><tr><th>For</th><th>Details</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>';
  INVITES.forEach(function(i){
    var st=i.review_status?('<span class="pill p-'+i.review_status+'">Review '+i.review_status+'</span>'):'<span class="pill">Not used yet</span>';
    h+='<tr><td>'+esc(i.label)+'</td><td>'+(i.role==='student'?'Student':'Parent')+(i.grade?' · Gr '+esc(i.grade):'')+(i.board?' · '+esc(i.board):'')+'</td><td>'+dt(i.created_at)+'</td><td>'+st+'</td><td>'+(i.review_status?'':'<button class="b" data-copy="'+esc(i.token)+'">Copy</button>')+'</td></tr>';
  });
  h+='</tbody></table>';
  p.innerHTML=h;
  p.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){copy(location.origin+'/write?t='+b.getAttribute('data-copy'));};});
  document.getElementById('mk').onclick=function(){
    var body={label:document.getElementById('label').value,role:document.getElementById('role').value,grade:document.getElementById('grade').value,board:document.getElementById('board').value};
    api('/api/admin/invites',{method:'POST',body:JSON.stringify(body)}).then(function(r){
      var link=location.origin+'/write?t='+r.token;
      INVITES.unshift({token:r.token,label:body.label,role:body.role,grade:body.grade,board:body.board,created_at:Date.now()});
      render();
      document.getElementById('nl').style.display='block';
      document.getElementById('link').textContent=link;
      document.getElementById('cp').onclick=function(){copy(link);};
      var text='Hi! Thank you for being part of ${SITE.brand} 🙏 Could you spare 2 minutes to share honest feedback about the classes? This private link is just for you: '+link;
      document.getElementById('wa').href='https://wa.me/?text='+encodeURIComponent(text);
    }).catch(function(e){toast(e.message);});
  };
}
function copy(t){if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){toast('Link copied');},function(){prompt('Copy this link:',t);});}else{prompt('Copy this link:',t);}}
if(KEY){api('/api/admin/check').then(load).catch(function(e){if(e.message!=='auth')login(e.message);});}else{login('');}
</script></body></html>`;
}
