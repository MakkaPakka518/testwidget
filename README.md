# testwidget

ForwardWidget/rex 测试模块。

## TikTok

- 模块文件：[`widgets/tiktok.js`](widgets/tiktok.js)
- 支持热门视频、TikTok 分享链接解析、详情页和动态播放资源。
- 热门视频默认使用台湾地区，并提供香港、新加坡、马来西亚等中文内容地区选项。
- 可在模块全局参数中填写浏览器复制的 TikTok Cookie，通过“账号推荐”读取登录账号的 For You 首屏推荐。Cookie 仅发送至 `www.tiktok.com`，不会写入仓库或发送给 TikWM。
- 关键词搜索和用户作品列表受上游接口限制，当前仅支持精确分享链接。

Cookie 是登录凭据，请仅在自己的设备中配置，不要提交到代码、截图或公开分享。当前 TikTok 的连续推荐 API 需要浏览器签名，模块仅支持官方页面提供的首屏推荐内容；若 TikTok 未在响应中明确确认登录状态，条目会标注“登录状态未确认”。

安装依赖并运行 Rex 元数据校验及离线测试：

```bash
npm install
npm test
```

`npm test` 使用 `@rexnow/libs` 的官方元数据 schema 校验模块，再通过 `@rexnow/rslib-plugin` 构建，并分别测试源码与构建产物。

模块依赖 TikTok 公开页面及 TikWM 公共接口，接口或页面结构变化时可能需要更新。
