# testwidget

ForwardWidget/rex 测试模块。

## TikTok

- 模块文件：[`widgets/tiktok.js`](widgets/tiktok.js)
- 支持热门视频、TikTok 分享链接解析、详情页和动态播放资源。
- 关键词搜索和用户作品列表受上游接口限制，当前仅支持精确分享链接。

安装依赖并运行 Rex 元数据校验及离线测试：

```bash
npm install
npm test
```

`npm test` 使用 `@rexnow/libs` 的官方元数据 schema 校验模块，再通过 `@rexnow/rslib-plugin` 构建，并分别测试源码与构建产物。

模块依赖 TikTok 公开页面及 TikWM 公共接口，接口或页面结构变化时可能需要更新。
