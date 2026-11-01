// TikTok Cookie 获取脚本（仅用于自己的账号）
// Cookie 只保存在 Loon 本地，不会发送到任何服务器

const headers = $request.headers || {};
const cookie = headers["Cookie"] || headers["cookie"];

if (cookie && /sessionid=/.test(cookie)) {
  const old = $persistentStore.read("tiktok_cookie");
  if (old !== cookie) {
    $persistentStore.write(cookie, "tiktok_cookie");
    $notification.post(
      "TikTok Cookie",
      "获取成功，已保存",
      "点击可在 Loon 持久化存储中查看（key: tiktok_cookie）",
      { "clipboard": cookie }
    );
    console.log("TikTok Cookie: " + cookie);
  }
}

$done({});
