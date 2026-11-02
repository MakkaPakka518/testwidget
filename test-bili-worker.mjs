/**
 * 管理模块单元测试（admin.js 无外部依赖，可直接导入）
 * 运行：node test-bili-worker.mjs
 */
import assert from "node:assert/strict";
import {
  hashPassword, verifyPassword,
  encryptProxy, decryptProxy,
  redactProxyUrl
} from "./worker-bili/admin.js";

const results = [];

async function t(name, fn) {
  try {
    await fn();
    results.push([name, true]);
  } catch (error) {
    results.push([name, false, error.message]);
  }
}

/* ---------------- 密码哈希 ---------------- */

await t("hashPassword 输出 salt 与 hash 且不含明文", async () => {
  const { salt, hash } = await hashPassword("testpassword123");
  assert.match(salt, /^[0-9a-f]{32}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!salt.includes("testpassword123"));
  assert.ok(!hash.includes("testpassword123"));
});

await t("相同密码两次哈希 salt 不同但都能校验", async () => {
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  assert.notEqual(a.salt, b.salt, "salt 必须随机");
  assert.notEqual(a.hash, b.hash, "salt 不同则 hash 必然不同");
  assert.equal(await verifyPassword("same-password", a.salt, a.hash), true);
  assert.equal(await verifyPassword("same-password", b.salt, b.hash), true);
});

await t("错误密码校验失败", async () => {
  const { salt, hash } = await hashPassword("correct-password");
  assert.equal(await verifyPassword("wrong-password", salt, hash), false);
  assert.equal(await verifyPassword("", salt, hash), false);
  assert.equal(await verifyPassword("correct-password ", salt, hash), false);
});

await t("复用同一 salt 可复现哈希", async () => {
  const first = await hashPassword("repeatable", null);
  const second = await hashPassword("repeatable", first.salt);
  assert.equal(first.hash, second.hash);
});

/* ---------------- 代理加密 ---------------- */

const SECRET = "session-secret-0123456789abcdef";

await t("encryptProxy 不泄露账号密码", async () => {
  const plain = "socks5://myuser:mypassword@1.2.3.4:1080";
  const enc = await encryptProxy(SECRET, plain);
  assert.ok(!enc.includes("myuser"), "不得含用户名");
  assert.ok(!enc.includes("mypassword"), "不得含密码");
  assert.ok(!enc.includes("1.2.3.4"), "不得含主机");
  assert.match(enc, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

await t("decryptProxy 可还原原文", async () => {
  const plain = "socks5://user:pass@10.0.0.1:1080";
  const enc = await encryptProxy(SECRET, plain);
  assert.equal(await decryptProxy(SECRET, enc), plain);
});

await t("相同明文两次加密结果不同（随机 IV）", async () => {
  const plain = "socks5://user:pass@10.0.0.1:1080";
  const a = await encryptProxy(SECRET, plain);
  const b = await encryptProxy(SECRET, plain);
  assert.notEqual(a, b);
  assert.equal(await decryptProxy(SECRET, a), plain);
  assert.equal(await decryptProxy(SECRET, b), plain);
});

await t("错误密钥无法解密", async () => {
  const enc = await encryptProxy(SECRET, "socks5://u:p@1.1.1.1:1080");
  await assert.rejects(() => decryptProxy("wrong-secret-000000000000", enc));
});

await t("损坏的密文无法解密", async () => {
  await assert.rejects(() => decryptProxy(SECRET, "not-a-valid-payload"));
  await assert.rejects(() => decryptProxy(SECRET, "aaa.bbb"));
});

/* ---------------- 脱敏 ---------------- */

await t("redactProxyUrl 去掉账号密码", async () => {
  assert.equal(redactProxyUrl("socks5://user:pass@1.2.3.4:1080"), "socks5://1.2.3.4:1080");
  assert.equal(redactProxyUrl("socks5h://u:p@example.com:9050"), "socks5h://example.com:9050");
});

await t("redactProxyUrl 容忍裸 host:port", async () => {
  assert.equal(redactProxyUrl("1.2.3.4:1080"), "socks5://1.2.3.4:1080");
});

await t("redactProxyUrl 处理空值与异常输入", async () => {
  assert.equal(redactProxyUrl(""), "");
  assert.equal(redactProxyUrl(null), "");
  assert.equal(redactProxyUrl(":::"), "已配置（格式异常）");
});

/* ---------------- 汇总 ---------------- */

const failed = results.filter(([, ok]) => !ok);
for (const [name, ok, message] of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + message}`);
}

if (failed.length) {
  console.error(`\n${failed.length} 个用例失败`);
  process.exit(1);
}

console.log(`\nadmin.js 测试全部通过（${results.length} 个用例）`);
