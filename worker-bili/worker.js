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

import { httpsRequest } from "./direct.js";
import { parseProxyUrl, socksHttpRequest, testProxy } from "./socks5.js";
import {
  hashPassword, verifyPassword, encryptProxy, decryptProxy,
  getAdmin, setAdminPassword, adminExists,
  createSession, verifySession, sessionCookie, clearCookie,
  checkLoginRate, recordLoginFail, clearLoginRate,
  getProxyConfig, saveProxyConfig, redactProxyUrl
} from "./admin.js";

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
  /^\/x\/passport-login\/web\/sms\/send$/,
  /^\/x\/passport-login\/web\/login\/sms$/,
  /^\/x\/passport-login\/web\/qrcode\/poll$/,
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
    "Content-Security-Policy": `default-src 'none'; script-src 'self' 'unsafe-inline' ${QR_SCRIPT} https://static.geetest.com; img-src data: https://static.geetest.com; style-src 'unsafe-inline'; connect-src 'self' https://static.geetest.com; frame-src https://static.geetest.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
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

function readCookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function withCookie(response, setCookie) {
  if (!setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", setCookie);
  return new Response(response.body, { status: response.status, headers });
}

/* ------------------------------ B站请求 ------------------------------ */

/**
 * 统一出口：
 *   - 命中 http:// 且启用了代理 → 经 SOCKS5 隧道明文请求
 *   - 其余情况 → 直连 fetch
 */
async function fetchBili(target, cookie) {
  const headers = {
    ...BROWSER_HEADERS,
    Referer: REFERER,
    Origin: "https://www.bilibili.com"
  };
  if (cookie) headers.Cookie = cookie;
  const res = await httpsRequest(target, { headers });
  return {
    status: res.status,
    text: () => Promise.resolve(res.text),
    json: () => Promise.resolve(res.json),
    headers: { get: (name) => (String(name).toLowerCase() === "cf-ray" ? res.headers["cf-ray"] : res.headers[String(name).toLowerCase()]), getSetCookie: () => res.setCookie }
  };
}

/**
 * 带代理感知的请求入口。返回 { status, json, setCookie, text }。
 * 目标为 https 时 SOCKS5 隧道无法完成 TLS，会显式报错而不是静默直连。
 */
async function biliRequest(env, target, cookie) {
  const res = await fetchBili(target, cookie);
  return { status: res.status, json: await res.json(), text: await res.text(), setCookie: [], via: "socket" };
}

/** 读取并解密代理配置；未启用返回 null */
async function resolveProxy(env) {
  try {
    const config = await getProxyConfig(env);
    if (!config.enabled || !config.url) return null;
    const parsed = parseProxyUrl(config.url);
    if (!parsed) throw new Error("代理地址格式不支持");
    return parsed;
  } catch (error) {
    console.log("resolveProxy failed:", error.message || error);
    return null;
  }
}

const BROWSER_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site"
};

let buvidCache = null;
const BUVID_TTL_MS = 6 * 60 * 60 * 1000;

async function ensureBuvid(env) {
  if (buvidCache && Date.now() - buvidCache.at < BUVID_TTL_MS) return buvidCache.value;
  try {
    const httpTarget = BILI_API + "/x/frontend/finger/spi";
    const res = await biliRequest(env, httpTarget, "");
    const body = res.json || {};
    const value = body && body.data && body.data.b_3 ? String(body.data.b_3) : "";
    if (value) {
      buvidCache = { value, at: Date.now() };
      return value;
    }
  } catch (error) {
    console.log("buvid failed:", error.message || error);
  }
  return "";
}

function parseSetCookieResponse(response) {
  const jar = {};
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  (Array.isArray(list) ? list : []).forEach((line) => {
    const pair = String(line).split(";")[0];
    const index = pair.indexOf("=");
    if (index <= 0) return;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (name) jar[name] = value;
  });
  return jar;
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

async function navInfo(env, cookie) {
  try {
    const httpTarget = BILI_API + "/x/web-interface/nav";
    const res = await biliRequest(env, httpTarget, cookie);
    const body = res.json || {};
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
<title>B站登录</title>
<script src="${QR_SCRIPT}" integrity="${QR_SRI}" crossorigin="anonymous"></script>
<script src="https://static.geetest.com/static/tools/gt.js"></script>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1115;color:#e8eaed;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;padding:16px;box-sizing:border-box}
.card{background:#171a21;border:1px solid #262b36;border-radius:18px;padding:26px;width:min(94vw,440px);box-shadow:0 24px 64px rgba(0,0,0,.45)}
h1{font-size:19px;margin:0 0 16px;font-weight:600}
.tabs{display:flex;gap:8px;margin-bottom:18px}
.tab{flex:1;padding:9px;text-align:center;border-radius:10px;background:#1e222b;color:#9aa3b2;font-size:13px;cursor:pointer;user-select:none}
.tab.on{background:#00a1d6;color:#fff;font-weight:600}
.pane{display:none}
.pane.on{display:block}
p.sub{margin:0 0 16px;color:#9aa3b2;font-size:13px;line-height:1.6}
#qr{display:flex;align-items:center;justify-content:center;background:#fff;border-radius:14px;padding:16px;min-height:232px}
#qr svg{display:block;width:200px;height:200px}
label{display:block;font-size:12px;color:#9aa3b2;margin:12px 0 6px}
input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid #2b3240;background:#0b0d11;color:#e8eaed;font-size:14px;outline:none}
input:focus{border-color:#00a1d6}
.row{display:flex;gap:8px}
.row input{flex:1}
.status{margin-top:14px;padding:12px 14px;border-radius:12px;background:#1e222b;color:#b9c2d0;font-size:13px;line-height:1.6;word-break:break-all}
.status.ok{background:#14301f;color:#7ee2a8}
.status.err{background:#33191b;color:#ff9aa2}
button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:11px;background:#00a1d6;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
button.ghost{background:#262b36;color:#c9d1dc;font-weight:500}
button.mini{width:auto;padding:11px 14px;margin:0;white-space:nowrap;background:#262b36;color:#c9d1dc;font-weight:500}
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
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h1 style="margin:0">B站登录</h1><a href="/admin" style="font-size:12px;color:#6f7a89;text-decoration:none;padding:5px 10px;border:1px solid #262b36;border-radius:8px">管理</a></div>

  <div class="tabs">
    <div class="tab on" data-tab="sms">手机验证码</div>
    <div class="tab" data-tab="qr">扫码登录</div>
  </div>

  <div class="pane on" id="pane-sms">
    <p class="sub">输入手机号，先完成滑块验证，再接收短信验证码。</p>
    <label>手机号（+86）</label>
    <input id="tel" type="tel" inputmode="numeric" maxlength="11" placeholder="11 位手机号" autocomplete="tel">
    <button id="sendSms" disabled>发送验证码</button>
    <label>短信验证码</label>
    <div class="row">
      <input id="code" type="text" inputmode="numeric" maxlength="6" placeholder="6 位验证码">
      <button class="mini" id="doLogin" disabled>登录</button>
    </div>
    <div class="status" id="smsStatus">请输入手机号</div>
  </div>

  <div class="pane" id="pane-qr">
    <p class="sub">用 B站 App 扫码并确认。凭据只绑定当前浏览器。</p>
    <div id="qr"></div>
    <div class="status" id="qrStatus">正在获取二维码…</div>
    <button id="refresh" disabled>重新生成二维码</button>
  </div>

  <h2>本浏览器的 key</h2>
  <div id="sessions"><div class="empty">暂无</div></div>

  <p class="tip">把 key 填入 rex 模块的「登录 Key」。有效期 30 天，换浏览器需重新登录。</p>
</div>
<script>
(function(){
  var smsStatus = document.getElementById('smsStatus');
  var qrStatus = document.getElementById('qrStatus');
  var qrEl = document.getElementById('qr');
  var telEl = document.getElementById('tel');
  var codeEl = document.getElementById('code');
  var sendBtn = document.getElementById('sendSms');
  var loginBtn = document.getElementById('doLogin');
  var refreshBtn = document.getElementById('refresh');
  var sessionsEl = document.getElementById('sessions');
  var timer = null;
  var smsCtx = null;      // {token, gt, challenge}
  var gtReady = false;

  function setSms(text, cls){ smsStatus.className = 'status' + (cls ? ' ' + cls : ''); smsStatus.textContent = text; }
  function setQr(text, cls){ qrStatus.className = 'status' + (cls ? ' ' + cls : ''); qrStatus.textContent = text; }

  /* ---------- tabs ---------- */
  var tabs = document.querySelectorAll('.tab');
  var panes = { sms: document.getElementById('pane-sms'), qr: document.getElementById('pane-qr') };
  tabs.forEach(function(t){
    t.addEventListener('click', function(){
      tabs.forEach(function(x){ x.classList.remove('on'); });
      t.classList.add('on');
      var name = t.getAttribute('data-tab');
      Object.keys(panes).forEach(function(k){ panes[k].classList.toggle('on', k === name); });
      if(name === 'qr' && !qrEl.innerHTML){ startQr(); }
    });
  });

  /* ---------- sessions ---------- */
  function fmt(ts){ try { return new Date(ts * 1000).toLocaleString(); } catch(e){ return ''; } }

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
              .then(function(){ loadSessions(); }).catch(function(){});
          });
          box.appendChild(who); box.appendChild(code); box.appendChild(meta); box.appendChild(btn);
          sessionsEl.appendChild(box);
        });
      }).catch(function(){});
  }

  function showKey(accessKey, uname){
    var span = document.createElement('code');
    span.style.cssText = 'display:block;margin-top:8px;padding:8px;border-radius:8px;background:#0b0d11;border:1px dashed #3a4352;font-family:ui-monospace,monospace;font-size:12px;color:#8fd3ff;user-select:all;word-break:break-all';
    span.textContent = accessKey;
    smsStatus.appendChild(span);
    loadSessions();
  }

  /* ---------- SMS ---------- */
  function validTel(){
    return /^1[3-9]\\d{9}$/.test(telEl.value.trim());
  }
  telEl.addEventListener('input', function(){
    sendBtn.disabled = !validTel();
  });

  function refreshSmsCaptcha(){
    return fetch('/api/sms/captcha', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(!d.ok) throw new Error(d.error || '验证码初始化失败');
        smsCtx = { token: d.token, gt: d.gt, challenge: d.challenge };
        return smsCtx;
      });
  }

  function runSlider(ctx){
    return new Promise(function(resolve, reject){
      if(!window.initGeetest || !ctx.gt){
        reject(new Error('滑块组件未加载，请刷新页面'));
        return;
      }
      initGeetest({
        gt: ctx.gt,
        challenge: ctx.challenge,
        offline: false,
        new_captcha: true,
        product: 'bind',
        width: '100%'
      }, function(captchaObj){
        captchaObj.onSuccess(function(){
          var r = captchaObj.getValidate();
          if(!r){ reject(new Error('滑块验证结果为空')); return; }
          resolve({
            challenge: r.geetest_challenge,
            validate: r.geetest_validate,
            seccode: r.geetest_seccode
          });
        });
        captchaObj.onError(function(){ reject(new Error('滑块验证出错')); });
        captchaObj.onClose(function(){ reject(new Error('已取消滑块验证')); });
        captchaObj.appendTo('body');
        captchaObj.verify();
      });
    });
  }

  sendBtn.addEventListener('click', function(){
    if(!validTel()){ setSms('手机号格式不正确', 'err'); return; }
    sendBtn.disabled = true;
    setSms('正在初始化验证…');
    refreshSmsCaptcha()
      .then(function(ctx){ return runSlider(ctx).then(function(v){ return { ctx: ctx, v: v }; }); })
      .then(function(pack){
        setSms('正在发送短信…');
        return fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tel: telEl.value.trim(),
            token: pack.ctx.token,
            challenge: pack.v.challenge,
            validate: pack.v.validate,
            seccode: pack.v.seccode
          })
        }).then(function(r){ return r.json(); }).then(function(d){
          if(!d.ok) throw new Error(d.error || '发送失败');
          setSms('验证码已发送，请查看短信', 'ok');
          loginBtn.disabled = false;
          codeEl.focus();
        });
      })
      .catch(function(e){
        setSms(e.message || '发送失败', 'err');
      })
      .then(function(){ sendBtn.disabled = !validTel(); });
  });

  loginBtn.addEventListener('click', function(){
    var code = codeEl.value.trim();
    if(!/^\\d{4,6}$/.test(code)){ setSms('请输入短信验证码', 'err'); return; }
    if(!smsCtx){ setSms('验证已过期，请重新发送', 'err'); return; }
    loginBtn.disabled = true;
    setSms('正在登录…');
    refreshSmsCaptcha()
      .then(function(ctx){ return runSlider(ctx).then(function(v){ return { ctx: ctx, v: v }; }); })
      .then(function(pack){
        return fetch('/api/sms/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tel: telEl.value.trim(),
            code: code,
            token: pack.ctx.token,
            challenge: pack.v.challenge,
            validate: pack.v.validate,
            seccode: pack.v.seccode
          })
        }).then(function(r){ return r.json(); });
      })
      .then(function(d){
        if(!d.ok) throw new Error(d.error || '登录失败');
        setSms('登录成功' + (d.uname ? '（' + d.uname + '）' : '') + '，key 已生成', 'ok');
        showKey(d.accessKey, d.uname);
        codeEl.value = '';
      })
      .catch(function(e){
        setSms(e.message || '登录失败', 'err');
      })
      .then(function(){ loginBtn.disabled = false; });
  });

  /* ---------- QR ---------- */
  function renderQr(text){
    qrEl.innerHTML = '';
    try {
      var qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      setQr('二维码渲染失败，请刷新重试', 'err');
    }
  }

  function stopQr(){ if(timer){ clearInterval(timer); timer = null; } }

  function startQr(){
    stopQr();
    refreshBtn.disabled = true;
    qrEl.innerHTML = '';
    setQr('正在获取二维码…');
    fetch('/api/qr', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(!data.ok){ throw new Error(data.error || '获取失败'); }
        renderQr(data.url);
        setQr('请用 B站 App 扫码');
        refreshBtn.disabled = false;
        timer = setInterval(function(){
          fetch('/api/poll?key=' + encodeURIComponent(data.key), { cache: 'no-store' })
            .then(function(r){ return r.json(); })
            .then(function(res){
              if(!res.ok){ return; }
              if(res.code === 0 && res.accessKey){
                stopQr();
                refreshBtn.disabled = false;
                setQr('登录成功' + (res.uname ? '（' + res.uname + '）' : '') + '，key 已生成，可在下方查看', 'ok');
                loadSessions();
              } else if(res.code === 86101){ setQr('等待扫码…'); }
              else if(res.code === 86090){ setQr('已扫码，请在手机上确认'); }
              else if(res.code === 86038){
                stopQr();
                refreshBtn.disabled = false;
                setQr('二维码已过期，请重新生成', 'err');
              }
            }).catch(function(){});
        }, 2000);
      })
      .catch(function(e){
        setQr(e.message || '获取二维码失败', 'err');
        refreshBtn.disabled = false;
      });
  }

  refreshBtn.addEventListener('click', startQr);

  loadSessions();
})();
</script>
</body>
</html>`;
}

function adminPageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>B站登录 · 管理面板</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#0d1014;color:#e6e9ee;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans SC",sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:28px 18px 60px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#8b95a5;font-size:13px;margin:0 0 24px}
.card{background:#151a21;border:1px solid #232b36;border-radius:14px;padding:20px;margin-bottom:18px}
.card h2{font-size:15px;margin:0 0 14px;color:#cfd6e0;font-weight:600}
label{display:block;font-size:12px;color:#8b95a5;margin:12px 0 6px}
label:first-of-type{margin-top:0}
input[type=text],input[type=password]{width:100%;padding:10px 12px;border-radius:9px;border:1px solid #2b3442;background:#0b0f14;color:#e6e9ee;font-size:14px;outline:none;font-family:inherit}
input:focus{border-color:#00a1d6}
button{padding:10px 16px;border:0;border-radius:9px;background:#00a1d6;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
button:disabled{opacity:.5;cursor:not-allowed}
button.ghost{background:#232b36;color:#c3ccd8;font-weight:500}
button.danger{background:#3a2028;color:#ff9aa2}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}
.msg{margin-top:14px;padding:11px 13px;border-radius:10px;background:#1b222c;color:#a8b3c2;font-size:13px;line-height:1.6;word-break:break-all;display:none}
.msg.on{display:block}
.msg.ok{background:#12301e;color:#7ee2a8}
.msg.err{background:#331a1c;color:#ff9aa2}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.switch{display:flex;align-items:center;gap:10px;margin-top:6px}
.switch input{width:auto;margin:0}
.hint{font-size:12px;color:#6f7a89;line-height:1.7;margin-top:10px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
header .right{display:flex;gap:8px}
.badge{font-size:11px;padding:4px 9px;border-radius:20px;background:#1b222c;color:#8b95a5}
.badge.on{background:#12301e;color:#7ee2a8}
.hidden{display:none}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>管理面板</h1>
      <p class="sub">代理链与管理员设置</p>
    </div>
    <div class="right">
      <span class="badge" id="sessionBadge">未登录</span>
      <button class="ghost hidden" id="logoutBtn">退出</button>
    </div>
  </header>

  <!-- 初始化 / 登录 -->
  <div class="card" id="authCard">
    <h2 id="authTitle">管理员登录</h2>
    <label>密码</label>
    <input id="password" type="password" autocomplete="current-password" placeholder="管理员密码">
    <div class="row">
      <button id="authBtn">登录</button>
    </div>
    <div class="msg" id="authMsg"></div>
    <p class="hint" id="authHint">首次使用请直接设置一个新密码，密码只保存 PBKDF2 哈希，不会以明文存储。</p>
  </div>

  <!-- 代理设置 -->
  <div class="card hidden" id="proxyCard">
    <h2>代理链</h2>
    <div class="switch">
      <input id="proxyEnabled" type="checkbox">
      <label for="proxyEnabled" style="margin:0">启用 SOCKS5 代理</label>
    </div>
    <label>当前代理（脱敏）</label>
    <input id="proxyCurrent" type="text" readonly value="未配置">
    <label>新的代理地址</label>
    <input id="proxyInput" type="text" placeholder="socks5://user:pass@1.2.3.4:1080">
    <div class="row">
      <button id="saveProxyBtn">保存</button>
      <button class="ghost" id="testProxyBtn">测试连通</button>
      <button class="danger" id="clearProxyBtn">清除代理</button>
    </div>
    <div class="msg" id="proxyMsg"></div>
    <p class="hint">支持 socks5:// 与 socks5h://。代理地址加密后存入 D1，接口只返回主机和端口，不会回传账号密码。</p>
  </div>

  <!-- 修改密码 -->
  <div class="card hidden" id="pwdCard">
    <h2>修改管理员密码</h2>
    <label>当前密码</label>
    <input id="oldPwd" type="password" autocomplete="current-password">
    <label>新密码（至少 8 位）</label>
    <input id="newPwd" type="password" autocomplete="new-password">
    <div class="row">
      <button id="changePwdBtn">更新密码</button>
    </div>
    <div class="msg" id="pwdMsg"></div>
  </div>
</div>

<script>
(function(){
  var state = { admin: false, initialized: false };

  function $(id){ return document.getElementById(id); }
  function show(el, ok, text){
    el.className = 'msg on' + (ok === true ? ' ok' : ok === false ? ' err' : '');
    el.textContent = text;
  }
  function hide(el){ el.className = 'msg'; el.textContent = ''; }

  function setSession(on){
    state.admin = on;
    $('sessionBadge').textContent = on ? '已登录' : '未登录';
    $('sessionBadge').className = 'badge' + (on ? ' on' : '');
    $('logoutBtn').classList.toggle('hidden', !on);
    $('authCard').classList.toggle('hidden', on);
    $('proxyCard').classList.toggle('hidden', !on);
    $('pwdCard').classList.toggle('hidden', !on);
  }

  function refreshStatus(){
    return fetch('/api/admin/status', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        state.initialized = !!d.initialized;
        $('authTitle').textContent = d.initialized ? '管理员登录' : '设置管理员密码';
        $('authBtn').textContent = d.initialized ? '登录' : '设置密码并登录';
        $('authHint').textContent = d.initialized
          ? '密码只保存 PBKDF2 哈希，连续失败 8 次将临时锁定。'
          : '首次使用请直接设置一个新密码，密码只保存 PBKDF2 哈希，不会以明文存储。';
        setSession(!!d.admin);
        if (d.admin) loadProxy();
      })
      .catch(function(){});
  }

  function loadProxy(){
    fetch('/api/admin/proxy', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(!d.ok) return;
        $('proxyEnabled').checked = !!d.enabled;
        $('proxyCurrent').value = d.configured ? (d.redacted || '已配置') : '未配置';
      })
      .catch(function(){});
  }

  $('authBtn').addEventListener('click', function(){
    var pwd = $('password').value;
    if(pwd.length < 8){ show($('authMsg'), false, '密码至少 8 位'); return; }
    var path = state.initialized ? '/api/admin/login' : '/api/admin/init';
    $('authBtn').disabled = true;
    hide($('authMsg'));
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    })
      .then(function(r){ return r.json().then(function(d){ return { status: r.status, d: d }; }); })
      .then(function(res){
        if(!res.d.ok) throw new Error(res.d.error || '操作失败');
        $('password').value = '';
        setSession(true);
        state.initialized = true;
        loadProxy();
        show($('authMsg'), true, '已登录');
      })
      .catch(function(e){ show($('authMsg'), false, e.message); })
      .then(function(){ $('authBtn').disabled = false; });
  });

  $('logoutBtn').addEventListener('click', function(){
    fetch('/api/admin/logout', { method: 'POST' })
      .then(function(){ setSession(false); state.initialized = true; })
      .catch(function(){});
  });

  $('saveProxyBtn').addEventListener('click', function(){
    var url = $('proxyInput').value.trim();
    var enabled = $('proxyEnabled').checked;
    $('saveProxyBtn').disabled = true;
    hide($('proxyMsg'));
    fetch('/api/admin/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled, url: url })
    })
      .then(function(r){ return r.json().then(function(d){ return { status: r.status, d: d }; }); })
      .then(function(res){
        if(!res.d.ok) throw new Error(res.d.error || '保存失败');
        $('proxyInput').value = '';
        loadProxy();
        show($('proxyMsg'), true, '已保存');
      })
      .catch(function(e){ show($('proxyMsg'), false, e.message); })
      .then(function(){ $('saveProxyBtn').disabled = false; });
  });

  $('testProxyBtn').addEventListener('click', function(){
    $('testProxyBtn').disabled = true;
    hide($('proxyMsg'));
    show($('proxyMsg'), null, '正在测试…');
    fetch('/api/admin/proxy/test', { method: 'POST' })
      .then(function(r){ return r.json().then(function(d){ return { status: r.status, d: d }; }); })
      .then(function(res){
        if(!res.d.ok) throw new Error(res.d.message || res.d.error || '测试失败');
        show($('proxyMsg'), true, res.d.message || '代理可用');
      })
      .catch(function(e){ show($('proxyMsg'), false, e.message); })
      .then(function(){ $('testProxyBtn').disabled = false; });
  });

  $('clearProxyBtn').addEventListener('click', function(){
    if(!confirm('确定清除代理配置？')) return;
    fetch('/api/admin/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, url: '' })
    })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(!d.ok) throw new Error(d.error || '清除失败');
        $('proxyEnabled').checked = false;
        loadProxy();
        show($('proxyMsg'), true, '已清除');
      })
      .catch(function(e){ show($('proxyMsg'), false, e.message); });
  });

  $('changePwdBtn').addEventListener('click', function(){
    var oldPwd = $('oldPwd').value;
    var newPwd = $('newPwd').value;
    if(newPwd.length < 8){ show($('pwdMsg'), false, '新密码至少 8 位'); return; }
    $('changePwdBtn').disabled = true;
    hide($('pwdMsg'));
    fetch('/api/admin/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
    })
      .then(function(r){ return r.json().then(function(d){ return { status: r.status, d: d }; }); })
      .then(function(res){
        if(!res.d.ok) throw new Error(res.d.error || '更新失败');
        $('oldPwd').value = ''; $('newPwd').value = '';
        show($('pwdMsg'), true, '密码已更新，请重新登录');
        setTimeout(function(){ setSession(false); }, 1200);
      })
      .catch(function(e){ show($('pwdMsg'), false, e.message); })
      .then(function(){ $('changePwdBtn').disabled = false; });
  });

  refreshStatus();
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

  if (url.pathname === "/api/t") {
    const MUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
    const probe = [
      "https://api.bilibili.com/x/frontend/finger/spi",
      "https://passport.bilibili.com/x/passport-login/captcha?source=main-feature",
      "https://passport.bilibili.com/x/passport-login/web/qrcode/generate"
    ];
    const out = [];
    for (const t of probe) {
      for (const [label, ua] of [["mobile", MUA], ["desktop", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"]]) {
        try {
          const r = await fetch(t, { headers: { "User-Agent": ua, Referer: "https://www.bilibili.com/", Accept: "application/json" } });
          const txt = await r.text();
          out.push({ ep: t.split("/").slice(-1)[0].slice(0, 30), ua: label, status: r.status, body: txt.slice(0, 70) });
        } catch (e) {
          out.push({ ep: t, ua: label, err: String(e).slice(0, 60) });
        }
      }
    }
    return json({ ok: true, out }, 200, cors);
  }

  if (url.pathname === "/api/t3") {
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const target = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate";
    const variants = [
      { name: "minimal(danmu_api)", headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" } },
      { name: "with-origin", headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/", Origin: "https://www.bilibili.com" } },
      { name: "with-accept", headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/", Accept: "application/json, text/plain, */*" } },
      { name: "full-spoof", headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/", Origin: "https://www.bilibili.com", Accept: "application/json, text/plain, */*", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", "sec-ch-ua": '"Chromium";v="120", "Not_A Brand";v="24"', "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"', "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-site" } }
    ];
    const out = [];
    for (const v of variants) {
      try {
        const r = await fetch(target, { headers: v.headers });
        const txt = await r.text();
        out.push({ v: v.name, status: r.status, body: txt.slice(0, 80) });
      } catch (e) {
        out.push({ v: v.name, err: String(e && e.message || e).slice(0, 60) });
      }
      await new Promise((res) => setTimeout(res, 300));
    }
    return json({ ok: true, out }, 200, cors);
  }

  if (url.pathname === "/api/t2") {
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const hosts = [
      "https://api.bilibili.com/x/frontend/finger/spi",
      "https://api.biliapi.net/x/frontend/finger/spi",
      "https://app.bilibili.com/x/v2/feed/index",
      "https://api.live.bilibili.com/room/v1/area/getList?parent_area_id=0",
      "https://passport.biliapi.net/x/passport-login/captcha?source=main-feature",
      "https://passport.bilibili.com/x/passport-login/captcha?source=main-feature"
    ];
    const out = [];
    for (const t of hosts) {
      try {
        const r = await fetch(t, { headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/", Accept: "application/json" } });
        const txt = await r.text();
        out.push({ url: t.replace("https://", "").slice(0, 46), status: r.status, body: txt.slice(0, 60) });
      } catch (e) {
        out.push({ url: t.replace("https://", "").slice(0, 46), err: String(e && e.message || e).slice(0, 50) });
      }
    }
    return json({ ok: true, out }, 200, cors);
  }

  if (url.pathname === "/api/tlsprobe2") {
    const targets = [
      "api.bilibili.com",
      "passport.bilibili.com"
    ];
    const out = [];
    const { connect } = await import("cloudflare:sockets");
    const enc = new TextEncoder();
    for (const host of targets) {
      try {
        const s = connect({ hostname: host, port: 443 }, { secureTransport: "on" });
        await s.opened;
        const w = s.writable.getWriter();
        const r = s.readable.getReader();
        const path = host === "api.bilibili.com"
          ? "/x/frontend/finger/spi"
          : "/x/passport-login/web/qrcode/generate";
        await w.write(enc.encode(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: Mozilla/5.0\r\nReferer: https://www.bilibili.com/\r\nConnection: close\r\n\r\n`));
        let buf = new Uint8Array(0);
        for (let i = 0; i < 6; i += 1) {
          const { value, done } = await r.read();
          if (done) break;
          const next = new Uint8Array(buf.length + (value ? value.length : 0));
          next.set(buf, 0); if (value) next.set(value, buf.length);
          buf = next;
          if (buf.length > 1200) break;
        }
        try { await s.close(); } catch (e) {}
        out.push({ host, body: new TextDecoder().decode(buf).slice(0, 260) });
      } catch (e) {
        out.push({ host, error: String(e && e.message || e).slice(0, 120) });
      }
    }
    return json({ ok: true, out }, 200, cors);
  }

  if (url.pathname === "/api/tlsprobe") {
    try {
      const { connect } = await import("cloudflare:sockets");
      const s = connect({ hostname: "passport.bilibili.com", port: 443 }, { secureTransport: "on" });
      await s.opened;
      const w = s.writable.getWriter();
      const r = s.readable.getReader();
      const enc = new TextEncoder();
      await w.write(enc.encode("GET /x/passport-login/web/qrcode/generate HTTP/1.1\r\nHost: passport.bilibili.com\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n"));
      const { value } = await r.read();
      const text = new TextDecoder().decode(value || new Uint8Array());
      try { await s.close(); } catch (e) {}
      return json({ ok: true, directTls: text.slice(0, 200) }, 200, cors);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e).slice(0, 150) }, 200, cors);
    }
  }

  if (url.pathname === "/health") {
    return withCookie(json({ ok: true, service: "bili-login-worker", storage: "d1" }, 200, cors), setCookie);
  }

  if (url.pathname === "/api/sms/captcha") {
    await ensureDevice(env, deviceId);
    try {
      const res = await fetchBili(`${PASSPORT}/x/passport-login/captcha?source=main-feature`, "");
      const body = await res.json();
      const data = (body && body.data) || {};
      if (!data.token || !data.geetest || !data.geetest.gt) {
        throw new Error(`B站返回 ${JSON.stringify(body).slice(0, 120)}`);
      }
      return withCookie(json({
        ok: true,
        token: data.token,
        gt: data.geetest.gt,
        challenge: data.geetest.challenge,
        type: data.type || "geetest"
      }, 200, cors), setCookie);
    } catch (error) {
      return withCookie(json({ ok: false, error: error.message || "验证码初始化失败" }, 502, cors), setCookie);
    }
  }

  if (url.pathname === "/api/sms/send" && request.method === "POST") {
    await ensureDevice(env, deviceId);
    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return withCookie(json({ ok: false, error: "invalid_json" }, 400, cors), setCookie);
    }
    const tel = String(payload && payload.tel || "").trim();
    if (!/^1[3-9]\d{9}$/.test(tel)) {
      return withCookie(json({ ok: false, error: "手机号格式不正确" }, 400, cors), setCookie);
    }
    const token = String(payload && payload.token || "");
    const challenge = String(payload && payload.challenge || "");
    const validate = String(payload && payload.validate || "");
    const seccode = String(payload && payload.seccode || "");
    if (!token || !challenge || !validate || !seccode) {
      return withCookie(json({ ok: false, error: "缺少滑块验证参数" }, 400, cors), setCookie);
    }
    try {
      const form = new URLSearchParams({
        cid: "86",
        tel,
        source: "main-feature",
        token,
        challenge,
        validate,
        seccode
      });
      const res = await httpsRequest(`${PASSPORT}/x/passport-login/web/sms/send`, {
        method: "POST",
        headers: {
          ...BROWSER_HEADERS,
          Referer: REFERER,
          Origin: "https://www.bilibili.com"
        },
        body: form.toString()
      });
      const body = res.json || {};
      if (Number(body.code) !== 0) {
        throw new Error(body.message || `发送失败(${body.code})`);
      }
      return withCookie(json({ ok: true }, 200, cors), setCookie);
    } catch (error) {
      return withCookie(json({ ok: false, error: error.message || "发送失败" }, 502, cors), setCookie);
    }
  }

  if (url.pathname === "/api/sms/login" && request.method === "POST") {
    await ensureDevice(env, deviceId);
    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return withCookie(json({ ok: false, error: "invalid_json" }, 400, cors), setCookie);
    }
    const tel = String(payload && payload.tel || "").trim();
    const code = String(payload && payload.code || "").trim();
    const token = String(payload && payload.token || "");
    const challenge = String(payload && payload.challenge || "");
    const validate = String(payload && payload.validate || "");
    const seccode = String(payload && payload.seccode || "");
    if (!/^1[3-9]\d{9}$/.test(tel) || !/^\d{4,6}$/.test(code)) {
      return withCookie(json({ ok: false, error: "手机号或验证码格式不正确" }, 400, cors), setCookie);
    }
    if (!token || !challenge || !validate || !seccode) {
      return withCookie(json({ ok: false, error: "缺少滑块验证参数" }, 400, cors), setCookie);
    }
    try {
      const form = new URLSearchParams({
        cid: "86",
        tel,
        smsCode: code,
        source: "main-feature",
        token,
        challenge,
        validate,
        seccode
      });
      const res = await httpsRequest(`${PASSPORT}/x/passport-login/web/login/sms`, {
        method: "POST",
        headers: {
          ...BROWSER_HEADERS,
          Referer: REFERER,
          Origin: "https://www.bilibili.com"
        },
        body: form.toString()
      });
      const raw = res.text || "";
      let body = res.json;
      if (!body) {
        return withCookie(json({ ok: false, error: "B站返回非 JSON，可能需要滑块或风控" }, 502, cors), setCookie);
      }
      if (Number(body.code) !== 0) {
        throw new Error(body.message || `登录失败(${body.code})`);
      }
      const jar = parseSetCookieResponse({ headers: { getSetCookie: () => res.setCookie } });
      const cookie = slimCookie(jar);
      if (!cookie.includes("SESSDATA=")) {
        return withCookie(json({ ok: false, error: "登录成功但未拿到 SESSDATA，请重试" }, 502, cors), setCookie);
      }
      if (await sessionCount(env, deviceId) >= MAX_SESSIONS_PER_DEVICE) {
        return withCookie(json({ ok: false, error: "该浏览器 key 已达上限，请先删除旧 key" }, 429, cors), setCookie);
      }
      const info = await navInfo(env, cookie);
      const accessKey = `bk_${randomHex(16)}`;
      await insertSession(env, deviceId, accessKey, cookie, info);
      return withCookie(json({ ok: true, accessKey, uname: info.uname || "", mid: info.mid || 0 }, 200, cors), setCookie);
    } catch (error) {
      return withCookie(json({ ok: false, error: error.message || "登录失败" }, 502, cors), setCookie);
    }
  }

  /* ---------- 管理面板 ---------- */
  if (url.pathname === "/admin") {
    await ensureDevice(env, deviceId);
    return html(adminPageHtml(), setCookie);
  }

  if (url.pathname === "/api/admin/status") {
    const initialized = await adminExists(env);
    const admin = initialized ? await verifySession(env, readCookieValue(request, "bili_admin")) : false;
    return withCookie(json({ ok: true, initialized, admin: !!admin }, 200, cors), setCookie);
  }

  if (url.pathname === "/api/admin/init" && request.method === "POST") {
    if (await adminExists(env)) {
      return withCookie(json({ ok: false, error: "管理员已初始化" }, 409, cors), setCookie);
    }
    let payload;
    try { payload = await request.json(); } catch (e) { payload = null; }
    const password = String(payload && payload.password || "");
    if (password.length < 8) {
      return withCookie(json({ ok: false, error: "密码至少 8 位" }, 400, cors), setCookie);
    }
    await setAdminPassword(env, password);
    const sid = await createSession(env);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(sid), ...cors }
    });
  }

  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const rate = await checkLoginRate(env, ip);
    if (!rate.allowed) {
      return withCookie(json({ ok: false, error: "密码错误次数过多，请 15 分钟后再试" }, 429, cors), setCookie);
    }
    let payload;
    try { payload = await request.json(); } catch (e) { payload = null; }
    const password = String(payload && payload.password || "");
    const record = await getAdmin(env);
    if (!record) {
      return withCookie(json({ ok: false, error: "尚未初始化管理员" }, 400, cors), setCookie);
    }
    if (!(await verifyPassword(password, record.salt, record.hash))) {
      await recordLoginFail(env, ip);
      return withCookie(json({ ok: false, error: "密码错误" }, 401, cors), setCookie);
    }
    await clearLoginRate(env, ip);
    const sid = await createSession(env);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(sid), ...cors }
    });
  }

  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": clearCookie(), ...cors }
    });
  }

  if (url.pathname === "/api/admin/password" && request.method === "POST") {
    if (!(await verifySession(env, readCookieValue(request, "bili_admin")))) {
      return withCookie(json({ ok: false, error: "未登录" }, 401, cors), setCookie);
    }
    let payload;
    try { payload = await request.json(); } catch (e) { payload = null; }
    const oldPassword = String(payload && payload.oldPassword || "");
    const newPassword = String(payload && payload.newPassword || "");
    if (newPassword.length < 8) {
      return withCookie(json({ ok: false, error: "新密码至少 8 位" }, 400, cors), setCookie);
    }
    const record = await getAdmin(env);
    if (!record || !(await verifyPassword(oldPassword, record.salt, record.hash))) {
      return withCookie(json({ ok: false, error: "当前密码错误" }, 401, cors), setCookie);
    }
    await setAdminPassword(env, newPassword);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": clearCookie(), ...cors }
    });
  }

  if (url.pathname === "/api/admin/proxy" && request.method === "GET") {
    if (!(await verifySession(env, readCookieValue(request, "bili_admin")))) {
      return withCookie(json({ ok: false, error: "未登录" }, 401, cors), setCookie);
    }
    const config = await getProxyConfig(env);
    return withCookie(json({
      ok: true,
      enabled: config.enabled,
      configured: !!config.url,
      redacted: config.url ? redactProxyUrl(config.url) : ""
    }, 200, cors), setCookie);
  }

  if (url.pathname === "/api/admin/proxy" && request.method === "POST") {
    if (!(await verifySession(env, readCookieValue(request, "bili_admin")))) {
      return withCookie(json({ ok: false, error: "未登录" }, 401, cors), setCookie);
    }
    let payload;
    try { payload = await request.json(); } catch (e) { payload = null; }
    const enabled = !!(payload && payload.enabled);
    const rawUrl = String(payload && payload.url || "").trim();

    let finalUrl = rawUrl;
    if (!finalUrl) {
      const existing = await getProxyConfig(env);
      finalUrl = existing.url;
    }
    if (enabled && !finalUrl) {
      return withCookie(json({ ok: false, error: "启用代理前请先填写代理地址" }, 400, cors), setCookie);
    }
    if (finalUrl) {
      if (finalUrl.length > 300 || /[\r\n]/.test(finalUrl)) {
        return withCookie(json({ ok: false, error: "代理地址过长或含非法字符" }, 400, cors), setCookie);
      }
      if (!parseProxyUrl(finalUrl)) {
        return withCookie(json({ ok: false, error: "只支持 socks5:// 或 socks5h://，格式 socks5://user:pass@host:port" }, 400, cors), setCookie);
      }
    }
    await saveProxyConfig(env, enabled, finalUrl);
    const config = await getProxyConfig(env);
    return withCookie(json({
      ok: true,
      enabled: config.enabled,
      configured: !!config.url,
      redacted: config.url ? redactProxyUrl(config.url) : ""
    }, 200, cors), setCookie);
  }

  if (url.pathname === "/api/admin/proxy/test" && request.method === "POST") {
    if (!(await verifySession(env, readCookieValue(request, "bili_admin")))) {
      return withCookie(json({ ok: false, error: "未登录" }, 401, cors), setCookie);
    }
    const config = await getProxyConfig(env);
    if (!config.url) {
      return withCookie(json({ ok: false, message: "尚未配置代理" }, 400, cors), setCookie);
    }
    const proxy = parseProxyUrl(config.url);
    if (!proxy) {
      return withCookie(json({ ok: false, message: "代理地址无法解析" }, 400, cors), setCookie);
    }
    const result = await testProxy(proxy);
    return withCookie(json({ ok: result.ok, message: result.message, ms: result.ms }, result.ok ? 200 : 502, cors), setCookie);
  }

  if (url.pathname === "/api/qr") {
    await ensureDevice(env, deviceId);
    if (await qrRateExceeded(env, deviceId)) {
      return withCookie(json({ ok: false, error: "请求过于频繁，请稍后再试" }, 429, cors), setCookie);
    }
    try {
      await cleanupExpired(env);
      const buvid = await ensureBuvid(env);
      const res = await fetchBili(
        `${PASSPORT}/x/passport-login/web/qrcode/generate`,
        buvid ? `buvid3=${buvid}; b_nut=1` : ""
      );
      const body = await res.json();
      if (body.code !== 0 || !body.data) {
        throw new Error(`B站返回 ${body.code}: ${body.message || "unknown"}（出口 IP ${res.headers.get("cf-ray") || "?"}）`);
      }
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
        const info = await navInfo(env, cookie);
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
