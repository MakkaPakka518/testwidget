/**
 * Bilibili 扫码登录 Worker（D1 + 设备绑定）
 *
 * 设计要点：
 *   1. 每个浏览器分配一个签名设备 Cookie，扫码票据与登录会话都绑定该设备，
 *      其他浏览器无法轮询或读取你的扫码结果，避免串号。
 *   2. 会话存 D1，Cookie 用 AES-GCM 加密后入库，明文只在下发 B站请求时短暂解密。
 *   3. 对外只暴露 bk_ 随机 key，数据库按 SHA-256 哈希索引。
 *   4. /api/proxy 有严格域名+路径白名单，不是开放代理。
 *
 * 绑定：
 *   - D1: DB
 * 密钥：
 *   - ACCESS_SALT     >= 16 位随机串
 *   - COOKIE_SECRET   >= 32 位随机串
 */

const BILI_API = "https://api.bilibili.com";
const PASSPORT = "https://passport.bilibili.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = "https://www.bilibili.com/";
const DEVICE_COOKIE = "bili_dev";
const DEVICE_MAX_AGE = 60 * 60 * 24 * 365;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const QR_TTL_SECONDS = 300;
const QR_RATE_LIMIT = 20;
const MAX_SESSIONS_PER_DEVICE = 5;
const QR_SCRIPT = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const QR_SRI = "sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k";

const ALLOWED_HOSTS = new Set(["api.bilibili.com", "api.live.bilibili.com", "passport.bilibili.com", "api.vc.bilibili.com"]);
const ALLOWED_PATHS = [
  /^\/x\/web-interface\/nav$/,
  /^\/x\/web-interface\/view$/,
  /^\/x\/web-interface\/popular$/,
  /^\/x\/web-interface\/ranking\/v2$/,
  /^\/x\/web-interface\/search\/type$/,
  /^\/x\/web-interface\/search\/all\/v2$/,
  /^\/x\/web-interface\/card$/,
  /^\/x\/web-interface\/archive\/relation$/,
  /^\/x\/player\/playurl$/,
  /^\/x\/player\/wbi\/playurl$/,
  /^\/x\/player\/v2\/playurl$/,
  /^\/x\/space\/wbi\/arc\/search$/,
  /^\/x\/space\/arc\/search$/,
  /^\/x\/relation\/followings$/,
  /^\/x\/feed\/feed\/all$/,
  /^\/xlive\/web-interface\/v1\/second\/getList$/,
  /^\/xlive\/web-room\/v2\/index\/getRoomPlayInfo$/,
  /^\/room\/v1\/Room\/get_info$/
];

/* ------------------------------ 基础工具 ------------------------------ */

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra
    }
  });
}

function html(body, setCookie) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'self' 'unsafe-inline' ${QR_SCRIPT}; img-src data:; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(body, { status: 200, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const ok = origin === "" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return ok
    ? {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Bili-Key",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        Vary: "Origin"
      }
    : {};
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64urlEncode(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text) {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function requireSecret(value, name) {
  const secret = String(value || "");
  if (secret.length < 16) throw new Error(`${name} 未配置或过短`);
  return secret;
}

/* ------------------------------ 密钥派生 ------------------------------ */

async function deriveKey(secret, info, usage) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("bili-worker-v2"), info: new TextEncoder().encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

async function encryptText(env, text, info) {
  const key = await deriveKey(requireSecret(env.COOKIE_SECRET, "COOKIE_SECRET"), info, "encrypt");
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return `${b64urlEncode(iv)}.${b64urlEncode(data)}`;
}

async function decryptText(env, payload, info) {
  const [ivPart, dataPart] = String(payload || "").split(".");
  if (!ivPart || !dataPart) throw new Error("bad payload");
  const key = await deriveKey(requireSecret(env.COOKIE_SECRET, "COOKIE_SECRET"), info, "decrypt");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64urlDecode(ivPart) },
    key,
    b64urlDecode(dataPart)
  );
  return new TextDecoder().decode(plain);
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------ 设备 Cookie ------------------------------ */

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const parts = raw.split(";");
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

async function resolveDevice(request, env) {
  const salt = requireSecret(env.ACCESS_SALT, "ACCESS_SALT");
  const existing = readCookie(request, DEVICE_COOKIE);
  if (existing && existing.includes(".")) {
    const [id, sig] = existing.split(".");
    if (/^[a-f0-9]{32}$/.test(id)) {
      const expect = await hmacHex(`${salt}:device`, id);
      if (sig === expect) return { deviceId: id, setCookie: "" };
    }
  }
  const deviceId = randomHex(16);
  const sig = await hmacHex(`${salt}:device`, deviceId);
  const cookie = `${DEVICE_COOKIE}=${deviceId}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DEVICE_MAX_AGE}`;
  return { deviceId, setCookie: cookie };
}

function withCookie(response, setCookie) {
  if (!setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", setCookie);
  return new Response(response.body, { status: response.status, headers });
}

/* ------------------------------ B站请求 ------------------------------ */

async function fetchBili(target, cookie) {
  const headers = {
    "User-Agent": UA,
    Referer: REFERER,
    Origin: "https://www.bilibili.com",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9"
  };
  if (cookie) headers.Cookie = cookie;
  return fetch(target, { headers, redirect: "follow" });
}

function parseSetCookie(response) {
  const jar = {};
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  list.forEach((line) => {
    const pair = String(line).split(";")[0];
    const index = pair.indexOf("=");
    if (index <= 0) return;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (name) jar[name] = value;
  });
  return jar;
}

function slimCookie(jar) {
  return ["SESSDATA", "bili_jct", "DedeUserID", "DedeUserID__ckMd5", "sid", "buvid3", "buvid4", "b_nut"]
    .filter((name) => jar[name])
    .map((name) => `${name}=${jar[name]}`)
    .join("; ");
}

async function navInfo(cookie) {
  try {
    const res = await fetchBili(`${BILI_API}/x/web-interface/nav`, cookie);
    const body = await res.json();
    const data = (body && body.data) || {};
    return {
      isLogin: !!data.isLogin,
      uname: data.uname || "",
      mid: data.mid || 0,
      vip: !!(data.vipStatus === 1 || data.vipType),
      level: data.level_info ? Number(data.level_info.current_level || 0) : 0
    };
  } catch (error) {
    return { isLogin: false, uname: "", mid: 0, vip: false, level: 0 };
  }
}

/* ------------------------------ 数据库 ------------------------------ */

async function ensureDevice(env, deviceId) {
  const ts = nowSeconds();
  await env.DB
    .prepare("INSERT INTO devices (id, created_at, last_seen_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at")
    .bind(deviceId, ts, ts)
    .run();
}

async function cleanupExpired(env) {
  const ts = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM qr_tickets WHERE expires_at < ?").bind(ts),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(ts)
  ]);
}

async function createQrTicket(env, deviceId, qrKey) {
  const ts = nowSeconds();
  await env.DB
    .prepare("INSERT INTO qr_tickets (qr_key, device_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(qrKey, deviceId, ts, ts + QR_TTL_SECONDS)
    .run();
}

async function takeQrTicket(env, deviceId, qrKey) {
  const row = await env.DB
    .prepare("SELECT qr_key, device_id, expires_at FROM qr_tickets WHERE qr_key = ? AND device_id = ?")
    .bind(qrKey, deviceId)
    .first();
  if (!row) return null;
  if (Number(row.expires_at) < nowSeconds()) {
    await env.DB.prepare("DELETE FROM qr_tickets WHERE qr_key = ?").bind(qrKey).run();
    return null;
  }
  return row;
}

async function qrRateExceeded(env, deviceId) {
  const since = nowSeconds() - 3600;
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM qr_tickets WHERE device_id = ? AND created_at > ?")
    .bind(deviceId, since)
    .first();
  return Number(row && row.c || 0) >= QR_RATE_LIMIT;
}

async function sessionCount(env, deviceId) {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM sessions WHERE device_id = ? AND expires_at > ?")
    .bind(deviceId, nowSeconds())
    .first();
  return Number(row && row.c || 0);
}

async function insertSession(env, deviceId, rawKey, cookie, info) {
  const keyHash = await sha256Hex(`bili-key:${requireSecret(env.ACCESS_SALT, "ACCESS_SALT")}:${rawKey}`);
  const cookieEnc = await encryptText(env, cookie, "bili-cookie-v2");
  const keyEnc = await encryptText(env, rawKey, `bili-key-${deviceId}`);
  const ts = nowSeconds();
  await env.DB
    .prepare("INSERT INTO sessions (id, device_id, key_hash, key_enc, cookie_enc, info_json, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(randomHex(16), deviceId, keyHash, keyEnc, cookieEnc, JSON.stringify(info), ts, ts + SESSION_TTL_SECONDS, ts)
    .run();
  return keyHash;
}

async function findSessionByKey(env, rawKey) {
  if (!/^bk_[a-f0-9]{32}$/.test(String(rawKey || ""))) return null;
  const keyHash = await sha256Hex(`bili-key:${requireSecret(env.ACCESS_SALT, "ACCESS_SALT")}:${rawKey}`);
  const row = await env.DB
    .prepare("SELECT id, device_id, cookie_enc, info_json, expires_at FROM sessions WHERE key_hash = ?")
    .bind(keyHash)
    .first();
  if (!row) return null;
  if (Number(row.expires_at) < nowSeconds()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(row.id).run();
    return null;
  }
  const cookie = await decryptText(env, row.cookie_enc, "bili-cookie-v2");
  let info = {};
  try { info = JSON.parse(row.info_json || "{}"); } catch (error) {}
  return { id: row.id, deviceId: row.device_id, cookie, info };
}

async function listDeviceSessions(env, deviceId) {
  const rows = await env.DB
    .prepare("SELECT id, key_enc, info_json, created_at, expires_at FROM sessions WHERE device_id = ? AND expires_at > ? ORDER BY created_at DESC")
    .bind(deviceId, nowSeconds())
    .all();
  const results = [];
  for (const row of rows.results || []) {
    try {
      const key = await decryptText(env, row.key_enc, `bili-key-${deviceId}`);
      let info = {};
      try { info = JSON.parse(row.info_json || "{}"); } catch (error) {}
      results.push({ id: row.id, key, info, createdAt: row.created_at, expiresAt: row.expires_at });
    } catch (error) {
      // 设备不匹配或密钥已轮换，跳过
    }
  }
  return results;
}

/* ------------------------------ 页面 ------------------------------ */

function pageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>B站扫码登录</title>
<script src="${QR_SCRIPT}" integrity="${QR_SRI}" crossorigin="anonymous"></script>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1115;color:#e8eaed;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;padding:16px;box-sizing:border-box}
.card{background:#171a21;border:1px solid #262b36;border-radius:18px;padding:26px;width:min(94vw,440px);box-shadow:0 24px 64px rgba(0,0,0,.45)}
h1{font-size:19px;margin:0 0 6px;font-weight:600}
p.sub{margin:0 0 18px;color:#9aa3b2;font-size:13px;line-height:1.6}
#qr{display:flex;align-items:center;justify-content:center;background:#fff;border-radius:14px;padding:16px;min-height:232px}
#qr svg{display:block;width:200px;height:200px}
.status{margin-top:16px;padding:12px 14px;border-radius:12px;background:#1e222b;color:#b9c2d0;font-size:13px;line-height:1.6;word-break:break-all}
.status.ok{background:#14301f;color:#7ee2a8}
.status.err{background:#33191b;color:#ff9aa2}
button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:11px;background:#00a1d6;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
button.ghost{background:#262b36;color:#c9d1dc;font-weight:500}
h2{font-size:14px;margin:22px 0 10px;color:#9aa3b2;font-weight:600}
.session{border:1px solid #262b36;border-radius:12px;padding:12px;margin-bottom:10px;background:#12151b}
.session .who{font-size:13px;color:#dfe4ea;margin-bottom:6px}
.session code{display:block;padding:8px;border-radius:8px;background:#0b0d11;border:1px dashed #3a4352;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#8fd3ff;user-select:all;word-break:break-all}
.session .meta{font-size:11px;color:#6f7787;margin-top:6px}
.session button{margin-top:8px;padding:7px;font-size:12px;background:#3a2028;color:#ff9aa2}
.empty{font-size:12px;color:#6f7787}
.tip{margin-top:16px;font-size:12px;color:#6f7787;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <h1>B站扫码登录</h1>
  <p class="sub">用 B站 App 扫码并确认。登录凭据只会绑定到当前浏览器，其他浏览器看不到你的 key。</p>
  <div id="qr"></div>
  <div id="status" class="status">正在获取二维码…</div>
  <button id="refresh" disabled>重新生成二维码</button>

  <h2>本浏览器已登录的 key</h2>
  <div id="sessions"><div class="empty">暂无</div></div>

  <p class="tip">把 key 填入 rex 模块的「登录 Key」。key 有效期 30 天，换浏览器需要重新扫码。</p>
</div>
<script>
(function(){
  var statusEl = document.getElementById('status');
  var qrEl = document.getElementById('qr');
  var refreshBtn = document.getElementById('refresh');
  var sessionsEl = document.getElementById('sessions');
  var timer = null;

  function setStatus(text, cls){
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
    statusEl.textContent = text;
  }

  function fmt(ts){
    try { return new Date(ts * 1000).toLocaleString(); } catch (e) { return ''; }
  }

  function loadSessions(){
    fetch('/api/session', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(!data.ok || !data.sessions || !data.sessions.length){
          sessionsEl.innerHTML = '<div class="empty">暂无</div>';
          return;
        }
        sessionsEl.innerHTML = '';
        data.sessions.forEach(function(item){
          var box = document.createElement('div');
          box.className = 'session';
          var who = document.createElement('div');
          who.className = 'who';
          who.textContent = (item.info && item.info.uname ? item.info.uname : '未知账号') + (item.info && item.info.mid ? ' (UID ' + item.info.mid + ')' : '');
          var code = document.createElement('code');
          code.textContent = item.key;
          var meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = '到期：' + fmt(item.expiresAt);
          var btn = document.createElement('button');
          btn.textContent = '删除这个 key';
          btn.addEventListener('click', function(){
            fetch('/api/revoke?id=' + encodeURIComponent(item.id), { method: 'POST' })
              .then(function(){ loadSessions(); })
              .catch(function(){});
          });
          box.appendChild(who);
          box.appendChild(code);
          box.appendChild(meta);
          box.appendChild(btn);
          sessionsEl.appendChild(box);
        });
      })
      .catch(function(){});
  }

  function renderQr(text){
    qrEl.innerHTML = '';
    try {
      var qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      setStatus('二维码渲染失败，请刷新重试', 'err');
    }
  }

  function stop(){
    if(timer){ clearInterval(timer); timer = null; }
  }

  function start(){
    stop();
    refreshBtn.disabled = true;
    qrEl.innerHTML = '';
    setStatus('正在获取二维码…');
    fetch('/api/qr', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(!data.ok){ throw new Error(data.error || '获取失败'); }
        renderQr(data.url);
        setStatus('请用 B站 App 扫码');
        refreshBtn.disabled = false;
        timer = setInterval(function(){
          fetch('/api/poll?key=' + encodeURIComponent(data.key), { cache: 'no-store' })
            .then(function(r){ return r.json(); })
            .then(function(res){
              if(!res.ok){ return; }
              if(res.code === 0 && res.accessKey){
                stop();
                refreshBtn.disabled = false;
                setStatus('登录成功' + (res.uname ? '（' + res.uname + '）' : '') + '，key 已生成，可在下方查看', 'ok');
                loadSessions();
              } else if(res.code === 86101){
                setStatus('等待扫码…');
              } else if(res.code === 86090){
                setStatus('已扫码，请在手机上确认');
              } else if(res.code === 86038){
                stop();
                refreshBtn.disabled = false;
                setStatus('二维码已过期，请重新生成', 'err');
              }
            })
            .catch(function(){});
        }, 2000);
      })
      .catch(function(e){
        setStatus(e.message || '获取二维码失败', 'err');
        refreshBtn.disabled = false;
      });
  }

  refreshBtn.addEventListener('click', start);
  loadSessions();
  start();
})();
</script>
</body>
</html>`;
}

/* ------------------------------ 路由 ------------------------------ */

async function handle(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request);
  const { deviceId, setCookie } = await resolveDevice(request, env);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await ensureDevice(env, deviceId);
    return html(pageHtml(), setCookie);
  }

  if (url.pathname === "/health") {
    return withCookie(json({ ok: true, service: "bili-login-worker", storage: "d1" }, 200, cors), setCookie);
  }

  if (url.pathname === "/api/qr") {
    await ensureDevice(env, deviceId);
    if (await qrRateExceeded(env, deviceId)) {
      return withCookie(json({ ok: false, error: "请求过于频繁，请稍后再试" }, 429, cors), setCookie);
    }
    try {
      await cleanupExpired(env);
      const res = await fetchBili(`${PASSPORT}/x/passport-login/web/qrcode/generate`, "");
      const body = await res.json();
      if (body.code !== 0 || !body.data) throw new Error("二维码生成失败");
      const qrKey = String(body.data.qrcode_key || "");
      if (!/^[A-Za-z0-9]{20,64}$/.test(qrKey)) throw new Error("二维码参数异常");
      await createQrTicket(env, deviceId, qrKey);
      return withCookie(json({ ok: true, url: body.data.url, key: qrKey }, 200, cors), setCookie);
    } catch (error) {
      return withCookie(json({ ok: false, error: error.message || "二维码生成失败" }, 502, cors), setCookie);
    }
  }

  if (url.pathname === "/api/poll") {
    const qrKey = url.searchParams.get("key") || "";
    if (!/^[A-Za-z0-9]{20,64}$/.test(qrKey)) {
      return withCookie(json({ ok: false, error: "invalid key" }, 400, cors), setCookie);
    }
    const ticket = await takeQrTicket(env, deviceId, qrKey);
    if (!ticket) {
      return withCookie(json({ ok: false, error: "ticket_not_found_or_other_device" }, 404, cors), setCookie);
    }
    try {
      const res = await fetchBili(`${PASSPORT}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrKey)}&source=main-fe-header`, "");
      const body = await res.json();
      const data = (body && body.data) || {};
      const code = Number(data.code);
      if (code === 0) {
        const cookie = slimCookie(parseSetCookie(res));
        if (!cookie.includes("SESSDATA=")) {
          return withCookie(json({ ok: false, error: "未取得登录凭据，请重试" }, 502, cors), setCookie);
        }
        if (await sessionCount(env, deviceId) >= MAX_SESSIONS_PER_DEVICE) {
          await env.DB.prepare("DELETE FROM qr_tickets WHERE qr_key = ?").bind(qrKey).run();
          return withCookie(json({ ok: false, error: "该浏览器保存的 key 已达上限，请先删除旧 key" }, 429, cors), setCookie);
        }
        const info = await navInfo(cookie);
        const accessKey = `bk_${randomHex(16)}`;
        await insertSession(env, deviceId, accessKey, cookie, info);
        await env.DB.prepare("DELETE FROM qr_tickets WHERE qr_key = ?").bind(qrKey).run();
        return withCookie(json({ ok: true, code: 0, accessKey, uname: info.uname || "", mid: info.mid || 0 }, 200, cors), setCookie);
      }
      return withCookie(json({ ok: true, code, message: data.message || "" }, 200, cors), setCookie);
    } catch (error) {
      return withCookie(json({ ok: false, error: error.message || "轮询失败" }, 502, cors), setCookie);
    }
  }

  if (url.pathname === "/api/session") {
    const sessions = await listDeviceSessions(env, deviceId);
    return withCookie(json({ ok: true, sessions }, 200, cors), setCookie);
  }

  if (url.pathname === "/api/revoke" && request.method === "POST") {
    const id = url.searchParams.get("id") || "";
    if (!/^[a-f0-9]{32}$/.test(id)) {
      return withCookie(json({ ok: false, error: "invalid id" }, 400, cors), setCookie);
    }
    const row = await env.DB.prepare("SELECT id FROM sessions WHERE id = ? AND device_id = ?").bind(id, deviceId).first();
    if (!row) return withCookie(json({ ok: false, error: "not found" }, 404, cors), setCookie);
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return withCookie(json({ ok: true }, 200, cors), setCookie);
  }

  if (url.pathname === "/api/me") {
    const key = request.headers.get("X-Bili-Key") || url.searchParams.get("key") || "";
    const session = await findSessionByKey(env, key);
    if (!session) return json({ ok: false, error: "invalid_or_expired_key" }, 401, cors);
    return json({ ok: true, info: session.info }, 200, cors);
  }

  if (url.pathname === "/api/proxy") {
    const key = request.headers.get("X-Bili-Key") || url.searchParams.get("key") || "";
    const session = await findSessionByKey(env, key);
    if (!session) return json({ ok: false, error: "invalid_or_expired_key" }, 401, cors);

    let target;
    try {
      target = new URL(url.searchParams.get("url") || "");
    } catch (error) {
      return json({ ok: false, error: "invalid target" }, 400, cors);
    }
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname) || !ALLOWED_PATHS.some((re) => re.test(target.pathname))) {
      return json({ ok: false, error: "target_not_allowed" }, 403, cors);
    }
    try {
      const upstream = await fetchBili(target.toString(), session.cookie);
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ...cors
        }
      });
    } catch (error) {
      return json({ ok: false, error: "upstream_failed" }, 502, cors);
    }
  }

  return json({ ok: false, error: "not_found" }, 404, cors);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      return json({ ok: false, error: error.message || "internal_error" }, 500, {});
    }
  }
};
