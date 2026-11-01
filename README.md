# testwidget

ForwardWidget/rex 测试模块。

## TikTok

- 模块文件：[`widgets/tiktok.js`](widgets/tiktok.js)
- 支持热门视频、TikTok 分享链接解析、详情页和动态播放资源。
- 热门视频默认使用台湾地区，并提供香港、新加坡、马来西亚等中文内容地区选项。
- 可在模块全局参数中填写浏览器复制的 TikTok Cookie，通过“账号推荐”读取登录账号的 For You 推荐。Cookie 不会写入仓库或发送给 TikWM；配置推荐服务后，会发送至你填写的 HTTPS 后端。
- 配置“推荐服务地址”和“推荐服务令牌”后，账号推荐会优先调用受保护的 Playwright 服务，由真实浏览器执行 TikTok 的网页签名流程。模块只接受 HTTPS 服务地址。
- 关键词搜索和用户作品列表受上游接口限制，当前仅支持精确分享链接。

Cookie 是登录凭据，请仅在自己的设备中配置，不要提交到代码、截图或公开分享。当前 TikTok 的连续推荐 API 需要浏览器签名，模块仅支持官方页面提供的首屏推荐内容；若 TikTok 未在响应中明确确认登录状态，条目会标注“登录状态未确认”。

推荐后端不会持久化或记录 Cookie，但 Cookie 会在请求期间发送到该 VPS。接口使用 Bearer Token、频率限制和单浏览器并发保护。

## 推荐后端

后端代码位于 [`server/`](server/)，需要 Node.js、Playwright Chromium 和以下环境变量：

```ini
HOST=0.0.0.0
PORT=3217
API_TOKEN=至少32位的随机令牌
PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
```

接口：

- `GET /health`
- `POST /v1/recommend`，使用 `Authorization: Bearer <token>`

当前 VPS Origin 为 `http://167.253.64.235:3217`。请先配置 Cloudflare HTTPS 反代，再把 HTTPS 地址和 Token 填入 rex 模块全局参数；不要通过明文 HTTP 发送 Cookie。

安装依赖并运行 Rex 元数据校验及离线测试：

```bash
npm install
npm test
```

`npm test` 使用 `@rexnow/libs` 的官方元数据 schema 校验模块，再通过 `@rexnow/rslib-plugin` 构建，并分别测试源码与构建产物。

模块依赖 TikTok 公开页面及 TikWM 公共接口，接口或页面结构变化时可能需要更新。
