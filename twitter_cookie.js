// Twitter / X Cookie 获取脚本（仅用于自己的账号）
// Cookie 只保存在 Loon 本地，不会发送到任何服务器

const headers = $request.headers || {};
const cookie = headers["Cookie"] || headers["cookie"] || "";

const authToken = (cookie.match(/(?:^|;\s*)auth_token=([^;]+)/) || [])[1];
const ct0 = (cookie.match(/(?:^|;\s*)ct0=([^;]+)/) || [])[1];
const twid = (cookie.match(/(?:^|;\s*)twid=([^;]+)/) || [])[1];

// 只有已登录（同时有 auth_token 和 ct0）才处理
if (authToken && ct0) {
  const slim = `auth_token=${authToken}; ct0=${ct0}` + (twid ? `; twid=${twid}` : "");
  const old = $persistentStore.read("twitter_cookie");

  if (old !== slim) {
    $persistentStore.write(slim, "twitter_cookie");
    $persistentStore.write(cookie, "twitter_cookie_full");

    // 顺便保存 Bearer（部分接口需要）
    const bearer = headers["authorization"] || headers["Authorization"];
    if (bearer) $persistentStore.write(bearer, "twitter_bearer");

    $notification.post(
      "Twitter / X Cookie",
      "获取成功，已保存",
      "已复制精简版 Cookie（auth_token + ct0）到剪贴板",
      { clipboard: slim }
    );
  }
}

$done({});
