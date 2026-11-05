WidgetMetadata = {
  id: "makka.anigamer.popular",
  title: "动画疯人气榜",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  description: "GitHub 定时通过台湾代理抓取巴哈姆特动画疯榜单，Rex 只读取 TMDB 身份",
  author: "MakkaPakka",
  site: "https://ani.gamer.com.tw/animeList.php",
  detailCacheDuration: 3600,
  globalParams: [
    {
      name: "baseUrl",
      title: "榜单数据地址",
      type: "input",
      placeholders: [{ title: "MakkaPakka518/List", value: "https://raw.githubusercontent.com/MakkaPakka518/List/main/data" }]
    }
  ],
  modules: [
    {
      id: "loadAniGamer",
      title: "动画疯榜单",
      functionName: "loadAniGamer",
      cacheDuration: 3600,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "sort",
          title: "排序",
          type: "enumeration",
          value: "monthly",
          enumOptions: [
            { title: "月人气排行", value: "monthly" },
            { title: "年份排序", value: "yearly" }
          ]
        },
        { name: "page", title: "页码", type: "page", startPage: 1 },
        { name: "language", title: "语言", type: "language", value: "zh-CN" }
      ]
    }
  ]
};

const DEFAULT_BASE = "https://raw.githubusercontent.com/MakkaPakka518/List/main/data";
const HEADERS = { "User-Agent": "Mozilla/5.0 (ForwardWidget AniGamer)", Accept: "application/json" };

function dataBase(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+$/.test(raw) ? raw : DEFAULT_BASE;
}

function responseBody(response) {
  let body = response && response.data !== undefined ? response.data : response;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { return null; }
  }
  return body && typeof body === "object" ? body : null;
}

async function updateReason(baseUrl) {
  try {
    const response = await Widget.http.get(`${baseUrl}/anigamer-status.json`, { headers: HEADERS });
    const status = responseBody(response);
    if (status && status.ok === false && status.reason) return String(status.reason);
  } catch (error) {}
  return "榜单数据暂不可用，请检查 GitHub Actions 状态";
}

loadAniGamer = async function loadAniGamer(params = {}) {
  const baseUrl = dataBase(params.baseUrl);
  try {
    const response = await Widget.http.get(`${baseUrl}/anigamer-hot.json`, { headers: HEADERS });
    const body = responseBody(response);
    if (!body || body.schemaVersion !== 1 || !body.lists) throw new Error(await updateReason(baseUrl));
    const sort = params.sort === "yearly" ? "yearly" : "monthly";
    const page = String(Math.min(5, Math.max(1, Number(params.page) || 1)));
    const list = body.lists[sort] && body.lists[sort][page] || [];
    const seen = new Set();
    return list.map(item => {
      const id = Number(item && item.tmdbId);
      const mediaType = item && item.mediaType;
      if (!id || !["movie", "tv"].includes(mediaType)) return null;
      return { id: `${mediaType}.${id}`, type: "tmdb" };
    }).filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  } catch (error) {
    const reason = error && error.message ? error.message : await updateReason(baseUrl);
    console.error("[loadAniGamer] 失败:", reason);
    throw new Error(`动画疯榜单更新失败：${reason}`);
  }
};
