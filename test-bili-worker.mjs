/**
 * Worker 离线测试：用内存实现 D1 + fetch 模拟，验证设备隔离与加密存储。
 * 运行：node test-bili-worker.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./worker-bili/worker.js", import.meta.url), "utf8");

// 把 export default 改成普通对象，便于 eval
const patched = source.replace(/export default \{[\s\S]*?\n\};?\s*$/, "globalThis.__worker = { fetch: (req, e) => handle(req, e) };");

/* ---------------- 内存 D1 ---------------- */
class FakeStatement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new FakeStatement(this.db, this.sql, args); }
  async first() { return this.db._first(this.sql, this.args); }
  async all() { return this.db._all(this.sql, this.args); }
  async run() { return this.db._run(this.sql, this.args); }
}

class FakeD1 {
  constructor() { this.devices = new Map(); this.qr = new Map(); this.sessions = new Map(); }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(list) { for (const stmt of list) await stmt.run(); return []; }
  _run(sql, args) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("INSERT INTO devices")) {
      const [id, created, seen] = args;
      const row = this.devices.get(id) || { id, created_at: created };
      row.last_seen_at = seen;
      this.devices.set(id, row);
      return { success: true };
    }
    if (s.startsWith("INSERT INTO qr_tickets")) {
      const [k, dev, created, expires] = args;
      this.qr.set(k, { qr_key: k, device_id: dev, created_at: created, expires_at: expires });
      return { success: true };
    }
    if (s.startsWith("INSERT INTO sessions")) {
      const [id, dev, hash, keyEnc, cookieEnc, info, created, expires, lastUsed] = args;
      this.sessions.set(id, { id, device_id: dev, key_hash: hash, key_enc: keyEnc, cookie_enc: cookieEnc, info_json: info, created_at: created, expires_at: expires, last_used_at: lastUsed });
      return { success: true };
    }
    if (s.startsWith("DELETE FROM qr_tickets WHERE qr_key = ?")) { this.qr.delete(args[0]); return { success: true }; }
    if (s.startsWith("DELETE FROM qr_tickets WHERE expires_at < ?")) {
      for (const [k, v] of this.qr) if (v.expires_at < args[0]) this.qr.delete(k);
      return { success: true };
    }
    if (s.startsWith("DELETE FROM sessions WHERE expires_at < ?")) {
      for (const [k, v] of this.sessions) if (v.expires_at < args[0]) this.sessions.delete(k);
      return { success: true };
    }
    if (s.startsWith("DELETE FROM sessions WHERE id = ?")) { this.sessions.delete(args[0]); return { success: true }; }
    throw new Error("unhandled run: " + s);
  }
  _first(sql, args) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.includes("FROM qr_tickets WHERE qr_key = ? AND device_id = ?")) {
      const row = this.qr.get(args[0]);
      if (!row || row.device_id !== args[1]) return null;
      return row;
    }
    if (s.includes("COUNT(*) AS c FROM qr_tickets")) {
      let c = 0;
      for (const v of this.qr.values()) if (v.device_id === args[0] && v.created_at > args[1]) c += 1;
      return { c };
    }
    if (s.includes("COUNT(*) AS c FROM sessions")) {
      let c = 0;
      for (const v of this.sessions.values()) if (v.device_id === args[0] && v.expires_at > args[1]) c += 1;
      return { c };
    }
    if (s.includes("FROM sessions WHERE key_hash = ?")) {
      for (const v of this.sessions.values()) if (v.key_hash === args[0]) return v;
      return null;
    }
    if (s.includes("FROM sessions WHERE id = ? AND device_id = ?")) {
      const row = this.sessions.get(args[0]);
      return row && row.device_id === args[1] ? row : null;
    }
    throw new Error("unhandled first: " + s);
  }
  _all(sql, args) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.includes("FROM sessions WHERE device_id = ?")) {
      const list = [...this.sessions.values()].filter((v) => v.device_id === args[0] && v.expires_at > args[1]);
      return { results: list };
    }
    throw new Error("unhandled all: " + s);
  }
}

/* ---------------- 假 B站 ---------------- */
let pollMode = "waiting";
let qrSeq = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/x/passport-login/web/qrcode/generate")) {
    qrSeq += 1;
    return new Response(JSON.stringify({ code: 0, data: { url: `https://qr.example/${qrSeq}`, qrcode_key: `qrkey${String(qrSeq).padStart(24, "0")}` } }), { headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("/x/passport-login/web/qrcode/poll")) {
    if (pollMode === "waiting") {
      return new Response(JSON.stringify({ code: 0, data: { code: 86101, message: "未扫码" } }), { headers: { "Content-Type": "application/json" } });
    }
    const headers = new Headers();
    headers.append("Set-Cookie", "SESSDATA=sess-value-123; Path=/; Domain=.bilibili.com");
    headers.append("Set-Cookie", "bili_jct=jct-abc; Path=/; Domain=.bilibili.com");
    headers.append("Set-Cookie", "DedeUserID=946974; Path=/; Domain=.bilibili.com");
    return new Response(JSON.stringify({ code: 0, data: { code: 0, message: "ok" } }), { headers });
  }
  if (url.includes("/x/web-interface/nav")) {
    return new Response(JSON.stringify({ code: 0, data: { isLogin: true, uname: "影视飓风", mid: 946974, level_info: { current_level: 6 } } }), { headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("/x/web-interface/view")) {
    return new Response(JSON.stringify({ code: 0, data: { bvid: "BV1xx" } }), { headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};

const env = { DB: new FakeD1(), ACCESS_SALT: "salt-0123456789abcdef", COOKIE_SECRET: "secret-0123456789abcdef0123456789" };
eval(patched);
const worker = globalThis.__worker;

const BASE = "https://bili-login.example";

function cookieFrom(res) {
  return (res.headers.getSetCookie ? res.headers.getSetCookie() : []).join("; ");
}

function getDev(res, prev = "") {
  const all = cookieFrom(res);
  const match = all.match(/bili_dev=([^;]+)/);
  return match ? match[1] : prev;
}

async function call(path, { cookie = "", method = "GET", key = "" } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = `bili_dev=${cookie}`;
  if (key) headers["X-Bili-Key"] = key;
  return worker.fetch(new Request(BASE + path, { method, headers }), env);
}

const results = [];
function check(name, fn) { results.push([name, fn]); }

/* ---------------- 用例 ---------------- */

// 1. 首次访问分配设备 Cookie
const r1 = await call("/api/session");
const devA = getDev(r1);
assert.ok(devA && devA.includes("."), "必须下发签名设备 Cookie");
assert.equal((await r1.json()).sessions.length, 0);

// 2. 生成二维码，票据绑定设备 A
const r2 = await call("/api/qr", { cookie: devA });
const qr = await r2.json();
assert.equal(qr.ok, true);
assert.ok(env.DB.qr.has(qr.key));
assert.equal(env.DB.qr.get(qr.key).device_id, devA.split(".")[0], "票据必须绑定设备 A");

// 3. 设备 B 不能用 A 的票据（核心防串号）
const devB = getDev(await call("/api/session"));
assert.notEqual(devA, devB, "不同浏览器必须分配不同设备");
const r3 = await call(`/api/poll?key=${encodeURIComponent(qr.key)}`, { cookie: devB });
assert.equal(r3.status, 404, "设备 B 轮询设备 A 的票据必须被拒绝");
const r3b = await r3.json();
assert.equal(r3b.ok, false);

// 4. 设备 A 正常轮询
pollMode = "waiting";
const r4 = await call(`/api/poll?key=${encodeURIComponent(qr.key)}`, { cookie: devA });
const poll4 = await r4.json();
assert.equal(poll4.code, 86101);

// 5. 扫码完成，签发 key
pollMode = "done";
const r5 = await call(`/api/poll?key=${encodeURIComponent(qr.key)}`, { cookie: devA });
const done = await r5.json();
assert.equal(done.ok, true);
assert.equal(done.code, 0);
assert.match(done.accessKey, /^bk_[a-f0-9]{32}$/);
assert.equal(done.uname, "影视飓风");

// 6. 数据库中不得出现明文 Cookie
const stored = [...env.DB.sessions.values()][0];
assert.ok(!stored.cookie_enc.includes("SESSDATA"), "Cookie 必须加密存储");
assert.ok(!stored.cookie_enc.includes("sess-value-123"), "Cookie 明文不得落库");
assert.ok(!stored.key_enc.includes(done.accessKey), "key 明文不得落库");

// 7. 票据一次性：已使用后失效
const r6 = await call(`/api/poll?key=${encodeURIComponent(qr.key)}`, { cookie: devA });
assert.equal(r6.status, 404, "票据使用后必须删除");

// 8. 设备 B 看不到设备 A 的 key
const r7 = await call("/api/session", { cookie: devB });
assert.equal((await r7.json()).sessions.length, 0, "设备 B 不得列出设备 A 的 key");

// 9. 设备 A 能看到自己的 key
const r8 = await call("/api/session", { cookie: devA });
const mine = await r8.json();
assert.equal(mine.sessions.length, 1);
assert.equal(mine.sessions[0].key, done.accessKey, "本设备必须能取回 key");
assert.equal(mine.sessions[0].info.uname, "影视飓风");

// 10. proxy 使用 key 生效
const viewUrl = encodeURIComponent("https://api.bilibili.com/x/web-interface/view?bvid=BV1xx");
const r9 = await call(`/api/proxy?url=${viewUrl}`, { key: done.accessKey });
assert.equal(r9.status, 200);
assert.equal((await r9.json()).data.bvid, "BV1xx");

// 11. proxy 白名单阻止任意目标
for (const bad of ["https://evil.test/x/web-interface/view", "https://api.bilibili.com/admin", "http://api.bilibili.com/x/web-interface/view"]) {
  const res = await call(`/api/proxy?url=${encodeURIComponent(bad)}`, { key: done.accessKey });
  assert.ok(res.status === 403 || res.status === 400, "非法目标必须拒绝: " + bad);
}

// 12. 无效 key 拒绝
const r10 = await call(`/api/proxy?url=${viewUrl}`, { key: "bk_" + "0".repeat(32) });
assert.equal(r10.status, 401);

// 13. 撤销
const revoke = await call(`/api/revoke?id=${mine.sessions[0].id}`, { cookie: devA, method: "POST" });
assert.equal((await revoke.json()).ok, true);
const afterRevoke = await call(`/api/proxy?url=${viewUrl}`, { key: done.accessKey });
assert.equal(afterRevoke.status, 401, "撤销后 key 必须失效");

// 14. 设备 B 不能撤销设备 A 的 key
const r11 = await call("/api/revoke?id=00000000000000000000000000000000", { cookie: devB, method: "POST" });
assert.equal(r11.status, 404);

// 15. 伪造设备 Cookie 会被重新分配
const forged = "a".repeat(32) + "." + "b".repeat(64);
const r12 = await call("/api/session", { cookie: forged });
const newDev = getDev(r12);
assert.ok(newDev && newDev !== forged, "伪造签名必须被拒绝并重新分配");

console.log(JSON.stringify({ ok: true, cases: 15, devA: devA.slice(0, 8), devB: devB.slice(0, 8) }));
