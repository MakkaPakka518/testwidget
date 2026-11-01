# testwidget

ForwardWidget/rex 测试模块。

## 哔哩哔哩

- 模块文件：[`widgets/bilibili.js`](widgets/bilibili.js)
- 热门、排行榜（22 个分区）、关键词搜索、BV号/链接解析、UP 主投稿、DASH 多清晰度 + 独立音轨。
- 无需登录即可浏览与播放；未登录上限 480P。填写含 `SESSDATA` 的 Cookie 可解锁 1080P+ 与会员内容。
- UP 主投稿接口需要登录 Cookie，未登录时返回空列表而不是报错。
- 多 P 视频自动生成分集列表。
- **推荐用扫码登录服务**：见 [`worker-bili/`](worker-bili/)。部署后在模块填「登录服务地址」+「登录 Key」，即可解锁 1080P+/4K、UP 主投稿等登录接口，无需手工复制 Cookie。

## Twitch

- 模块文件：[`widgets/twitch.js`](widgets/twitch.js)
- 热门直播、热门分类、单频道、关键词/分类搜索，以及直播与 VOD 的 HLS 多清晰度播放。
- 无需登录：使用 Twitch 网页公开 Client-ID 读取公开数据。
- 播放地址带签名且有时效，在 `loadResource` 起播时实时获取，不写入列表缓存。
- 受上游完整性校验限制，单次最多返回 30 条，不支持深分页。

## X / Twitter

- 模块文件：[`widgets/twitter.js`](widgets/twitter.js)
- 仅返回含视频或 GIF 视频的推文，自动过滤纯文字和图片推文。
- 支持用户视频列表、关键词视频搜索、`@用户`搜索、推文链接解析及多清晰度 MP4/HLS 播放。
- 支持手动填写 X List 链接并聚合列表内全部用户的视频；默认列表为 `https://x.com/i/lists/1655997863032401921`。该功能需要 X Cookie（`auth_token`、`ct0`）和现有 Playwright HTTPS 服务。
- 数据来自 FxTwitter v2 公共 API，不需要 X 登录 Cookie。

## TikTok

- 模块文件：[`widgets/tiktok.js`](widgets/tiktok.js)
- 支持热门视频、TikTok 分享链接解析、详情页和动态播放资源。
- 热门视频默认使用台湾地区，并提供香港、新加坡、马来西亚等中文内容地区选项。
- 可在模块全局参数中填写浏览器复制的 TikTok Cookie，通过“账号推荐”读取登录账号的 For You 推荐。Cookie 不会写入仓库或发送给 TikWM；配置推荐服务后，会发送至你填写的 HTTPS 后端。
- 配置“推荐服务地址”和“推荐服务令牌”后，账号推荐会优先调用受保护的 Playwright 服务，由真实浏览器执行 TikTok 的网页签名流程。模块只接受 HTTPS 服务地址。
- 关键词搜索和用户作品列表受上游接口限制，当前仅支持精确分享链接。

Cookie 是登录凭据，请仅在自己的设备中配置，不要提交到代码、截图或公开分享。当前 TikTok 的连续推荐 API 需要浏览器签名，模块仅支持官方页面提供的首屏推荐内容；若 TikTok 未在响应中明确确认登录状态，条目会标注“登录状态未确认”。

推荐后端不会持久化或记录 Cookie，但 Cookie 会在请求期间发送到该 VPS。接口使用 Bearer Token、频率限制和单浏览器并发保护。

## 扫码登录 Worker

[`worker-bili/`](worker-bili/) 是一个独立 Cloudflare Worker，用 D1 存储、按浏览器隔离：

- 扫码页拿二维码 → B站 App 确认 → 页面只返回 `bk_` 开头的 key
- Cookie 用 AES-GCM 加密存 D1，永不下发浏览器
- 每个访问者绑定签名设备 Cookie，扫码票据与会话都按设备隔离，**不会串号**
- `/api/proxy` 严格白名单，只能访问 B站官方接口

部署步骤见 [`worker-bili/README.md`](worker-bili/README.md)。

## 推荐后端

后端代码位于 [`server/`](server/)，香港机使用该目录的 Dockerfile 运行 Playwright Chromium headless shell。环境变量：

```ini
HOST=0.0.0.0
PORT=3217
API_TOKEN=至少32位的随机令牌
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

接口：

- `GET /health`
- `POST /v1/recommend`：TikTok For You，使用 `Authorization: Bearer <token>`
- `POST /v1/x-list-videos`：X List 视频，使用同一 Bearer Token

当前香港机 Origin 为 `http://45.196.235.7:3217`。请先配置 Cloudflare HTTPS 反代，再把 HTTPS 地址和 Token 填入 rex 模块全局参数；不要通过明文 HTTP 发送 Cookie。原服务器上的浏览器服务、依赖和缓存已移除。

安装依赖并运行 Rex 元数据校验及离线测试：

```bash
npm install
npm test
```

`npm test` 使用 `@rexnow/libs` 的官方元数据 schema 校验模块，再通过 `@rexnow/rslib-plugin` 构建，并分别测试源码与构建产物。

模块依赖 TikTok 公开页面及 TikWM 公共接口，接口或页面结构变化时可能需要更新。
