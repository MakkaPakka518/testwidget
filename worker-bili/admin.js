/**
 * 管理员认证 + 代理配置存储
 *
 * 安全约束：
 *   1. 管理员密码只存 PBKDF2 哈希，永不落明文、永不回传。
 *   2. 代理 URL 用 AES-GCM 加密后存 D1，接口只返回脱敏形式。
 *   3. 会话用 HMAC 签名，HttpOnly + Secure + SameSite=Strict。
 */

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const LOGIN_MAX_FAILS = 8;
const LOGIN_WINDOW_SECONDS = 15 * 60;

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(text) {
  const clean = String(text || "");
  if (clean.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function b64url(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text) {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function randomBytes(size) {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  return buf;
}

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return toHex(sig);
}

/* ------------------------------ 密码哈希 ------------------------------ */

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : randomBytes(16);
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    base,
    256
  );
  return { salt: toHex(salt), hash: toHex(bits) };
}

export async function verifyPassword(password, saltHex, expectedHash) {
  const { hash } = await hashPassword(password, saltHex);
  return safeEqual(hash, expectedHash);
}

/* ------------------------------ 代理加密 ------------------------------ */

async function deriveAesKey(secret, info) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("bili-admin-v1"), info: new TextEncoder().encode(info) },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptProxy(secret, plaintext) {
  const key = await deriveAesKey(secret, "proxy-url");
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${b64url(iv)}.${b64url(cipher)}`;
}

export async function decryptProxy(secret, payload) {
  const [ivPart, dataPart] = String(payload || "").split(".");
  if (!ivPart || !dataPart) throw new Error("代理数据损坏");
  const key = await deriveAesKey(secret, "proxy-url");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64urlDecode(ivPart) }, key, b64urlDecode(dataPart));
  return new TextDecoder().decode(plain);
}

/* ------------------------------ 管理员账号 ------------------------------ */

export async function getAdmin(env) {
  const row = await env.DB.prepare("SELECT id, salt, hash, updated_at FROM admin WHERE id = 1").first();
  return row || null;
}

export async function setAdminPassword(env, password) {
  const { salt, hash } = await hashPassword(password);
  const ts = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare("INSERT INTO admin (id, salt, hash, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, updated_at = excluded.updated_at")
    .bind(salt, hash, ts)
    .run();
  return true;
}

/** 首次使用：没有管理员时允许初始化一次 */
export async function adminExists(env) {
  return !!(await getAdmin(env));
}

/* ------------------------------ 会话 ------------------------------ */

function sessionSecret(env) {
  const secret = String(env.ADMIN_SESSION_SECRET || env.ACCESS_SALT || "");
  if (secret.length < 16) throw new Error("ADMIN_SESSION_SECRET / ACCESS_SALT 未配置");
  return secret;
}

export async function createSession(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmacHex(sessionSecret(env), `admin:${exp}`);
  return `${exp}.${sig}`;
}

export async function verifySession(env, cookieValue) {
  const [expText, sig] = String(cookieValue || "").split(".");
  const exp = Number(expText);
  if (!exp || !sig || exp <= Math.floor(Date.now() / 1000)) return false;
  const want = await hmacHex(sessionSecret(env), `admin:${exp}`);
  return safeEqual(sig, want);
}

export function sessionCookie(value) {
  return `bili_admin=${value}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookie() {
  return "bili_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}

/* ------------------------------ 登录限流 ------------------------------ */

export async function checkLoginRate(env, ip) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT fails, window_start FROM admin_login_rate WHERE ip = ?").bind(ip).first();
  if (!row) return { allowed: true, remaining: LOGIN_MAX_FAILS };
  if (now - Number(row.window_start) >= LOGIN_WINDOW_SECONDS) {
    await env.DB.prepare("DELETE FROM admin_login_rate WHERE ip = ?").bind(ip).run();
    return { allowed: true, remaining: LOGIN_MAX_FAILS };
  }
  const fails = Number(row.fails || 0);
  return { allowed: fails < LOGIN_MAX_FAILS, remaining: Math.max(0, LOGIN_MAX_FAILS - fails) };
}

export async function recordLoginFail(env, ip) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare("INSERT INTO admin_login_rate (ip, fails, window_start) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET fails = fails + 1")
    .bind(ip, now)
    .run();
}

export async function clearLoginRate(env, ip) {
  await env.DB.prepare("DELETE FROM admin_login_rate WHERE ip = ?").bind(ip).run();
}

/* ------------------------------ 代理配置 ------------------------------ */

export async function getProxyConfig(env) {
  const row = await env.DB.prepare("SELECT enabled, url_enc, updated_at FROM proxy_config WHERE id = 1").first();
  if (!row) return { enabled: false, url: "", updatedAt: 0 };
  let url = "";
  if (row.url_enc) {
    try {
      url = await decryptProxy(sessionSecret(env), row.url_enc);
    } catch (error) {
      url = "";
    }
  }
  return { enabled: !!row.enabled, url, updatedAt: Number(row.updated_at || 0) };
}

export async function saveProxyConfig(env, enabled, url) {
  const enc = url ? await encryptProxy(sessionSecret(env), url) : "";
  const ts = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare("INSERT INTO proxy_config (id, enabled, url_enc, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, url_enc = excluded.url_enc, updated_at = excluded.updated_at")
    .bind(enabled ? 1 : 0, enc, ts)
    .run();
}

/** 脱敏：只暴露主机与端口，不暴露账号密码 */
export function redactProxyUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `socks5://${text}`;
    const url = new URL(normalized);
    return `${url.protocol}//${url.hostname}:${url.port || "1080"}`;
  } catch (error) {
    return "已配置（格式异常）";
  }
}
