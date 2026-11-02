# Bilibili 扫码登录 Worker（D1 + 设备绑定）

纯 Cloudflare Worker。扫码后只返回一个访问 key，Cookie 加密存进 D1，永不下发到浏览器。

**两个关键设计**

1. **用 D1，不用 KV**：KV 有写入/列举配额且最终一致，多用户扫码会产生大量短生命周期键。
2. **按浏览器隔离**：每个访问者分配一个签名的 `bili_dev` HttpOnly Cookie，扫码票据和会话都绑定该设备。
   别人即使拿到你的 `qrcode_key` 也无法轮询，因为 `/api/poll` 会校验设备归属；`/api/session` 也只列出本设备的 key。

## 关键：出口问题已解决（不需要代理）

Workers 的 `fetch()` 出口 IP 被 B站 判定为 `-412`，但 `connect()` 打开的 TCP socket 走**另一组出口**，可以正常访问 B站。

本项目用 `direct.js` 基于 `cloudflare:sockets` 手写 HTTP/1.1 over TLS，全部请求走 socket：

| 方式 | `passport.bilibili.com` 结果 |
|---|---|
| `fetch()` | `-412 request was banned` |
| `connect()` + TLS | `200 OK` |

因此二维码、短信、播放等全部功能都能在纯 Cloudflare 上跑通，不需要 WARP、VPS 或任何外部中转。

## 管理面板

访问 `/admin`：

- **首次访问**：设置管理员密码（之后需要用它登录）
- 密码只存 **PBKDF2-SHA256（10 万次迭代）+ 16 字节随机盐**，数据库里没有任何明文
- 登录态用 HMAC 签名 Cookie（HttpOnly + Secure + SameSite=Strict），12 小时过期
- 连续失败 8 次锁定该 IP 15 分钟

面板可配置 SOCKS5 代理链（可选，当前非必需）：

- 只接受 `socks5://` / `socks5h://`
- 代理 URL 用 **AES-GCM 加密**后存入 D1
- 接口只返回脱敏形式（如 `socks5://1.2.3.4:1080`），**账号密码永不下发**
- 支持在线测试连通性

## 部署

```bash
cd worker-bili

wrangler login
wrangler d1 create bili-login
# 把返回的 database_id 填入 wrangler.toml

wrangler d1 execute bili-login --remote --file=schema.sql

wrangler secret put ACCESS_SALT     # ≥16 位随机串
wrangler secret put COOKIE_SECRET   # ≥32 位随机串

wrangler deploy
```

得到形如 `https://bili-login.<subdomain>.workers.dev` 的地址。

## 使用

1. 浏览器打开该地址，用 B站 App 扫码确认
2. 页面底部会列出**本浏览器**的 key（`bk_xxxx`），复制
3. rex 模块填：`登录服务地址` = Worker 地址，`登录 Key` = 该 key

key 有效期 30 天；换浏览器需重新扫码；页面可单独删除某个 key。

## 接口

| 路径 | 说明 |
|---|---|
| `GET /` | 扫码页 + 本设备 key 列表 |
| `GET /api/qr` | 生成二维码（每小时限 20 次/设备） |
| `GET /api/poll?key=` | 轮询，仅限本设备票据 |
| `GET /api/session` | 列出本设备所有 key |
| `POST /api/revoke?id=` | 撤销本设备的某个 key |
| `GET /api/me` | 用 `X-Bili-Key` 查询账号信息 |
| `GET /api/proxy?url=` | 带登录 Cookie 代理 B站接口 |

## 隔离与安全

- 设备 Cookie 由 `ACCESS_SALT` 做 HMAC 签名，伪造会被重新分配新设备
- `qr_tickets.device_id` 与 `sessions.device_id` 双重校验，杜绝跨用户读取
- Cookie 用 HKDF 派生 + AES-GCM 加密，`COOKIE_SECRET` 不落库
- 数据库中只存 key 的 SHA-256 哈希用于查找；key 明文用设备密钥加密保存，仅本设备可解
- `/api/proxy` 严格白名单：只允许 B站官方域名 + 已知路径，无法当开放代理
- 页面启用 CSP，QR 库走 SRI 校验

## 解锁能力

- 1080P / 4K / HDR 等高清
- UP 主投稿（未登录会被风控 `-352`）
- 关注列表、稍后再看等需要登录的接口

## 数据结构

见 `schema.sql`：`devices` / `qr_tickets` / `sessions`，均带过期清理。
