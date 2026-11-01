WidgetMetadata = {
  id: "com.tiktok.public",
  title: "TikTok",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  description: "TikTok 公开视频：热门列表、分享链接解析与动态播放资源",
  author: "OpenCode",
  site: "https://www.tiktok.com",
  detailCacheDuration: 300,
  globalParams: [
    {
      name: "cookie",
      title: "TikTok Cookie（可选）",
      type: "input",
      value: "",
      description: "用于账号推荐，仅发送至 www.tiktok.com。Cookie 属于敏感凭据，请勿分享。"
    }
  ],
  modules: [
    {
      id: "loadForYou",
      title: "账号推荐",
      description: "使用登录 Cookie 获取 TikTok For You 首屏推荐",
      functionName: "loadForYou",
      cacheDuration: 0,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "language",
          title: "界面语言",
          type: "enumeration",
          value: "zh-Hant",
          enumOptions: [
            { title: "繁体中文", value: "zh-Hant" },
            { title: "简体中文", value: "zh-Hans" }
          ]
        }
      ]
    },
    {
      id: "loadPopular",
      title: "热门视频",
      functionName: "loadPopular",
      cacheDuration: 300,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "region",
          title: "地区",
          type: "enumeration",
          value: "TW",
          enumOptions: [
            { title: "台湾（繁中）", value: "TW" },
            { title: "香港（繁中）", value: "HK" },
            { title: "新加坡（华语）", value: "SG" },
            { title: "马来西亚（华语）", value: "MY" },
            { title: "美国", value: "US" },
            { title: "日本", value: "JP" },
            { title: "韩国", value: "KR" },
            { title: "英国", value: "GB" },
            { title: "法国", value: "FR" },
            { title: "德国", value: "DE" },
            { title: "巴西", value: "BR" },
            { title: "印度尼西亚", value: "ID" },
            { title: "泰国", value: "TH" },
            { title: "越南", value: "VN" }
          ]
        },
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadByUrl",
      title: "解析分享链接",
      functionName: "loadByUrl",
      cacheDuration: 0,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "url",
          title: "TikTok 链接",
          type: "input",
          placeholders: [
            {
              title: "视频或短链接",
              value: "https://www.tiktok.com/@user/video/1234567890123456789"
            }
          ]
        }
      ]
    },
    {
      id: "loadResource",
      title: "TikTok 播放源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "链接搜索",
    functionName: "search",
    params: [
      {
        name: "keyword",
        title: "TikTok 链接",
        type: "input",
        placeholders: [
          {
            title: "粘贴 TikTok 分享链接",
            value: "https://www.tiktok.com/@user/video/1234567890123456789"
          }
        ]
      }
    ]
  }
};

const TIKTOK_BASE = "https://www.tiktok.com";
const TIKWM_BASE = "https://www.tikwm.com";
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const WEB_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIKTOK_HOSTS = ["tiktok.com", "www.tiktok.com", "m.tiktok.com"];
const TIKTOK_SHORT_HOSTS = ["vm.tiktok.com", "vt.tiktok.com"];
const ITEM_CACHE_TTL_MS = 60 * 1000;
const ITEM_CACHE = {};

const TIKTOK_HEADERS = {
  "User-Agent": WEB_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: `${TIKTOK_BASE}/`
};

const API_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json,text/plain,*/*",
  Referer: `${TIKWM_BASE}/`
};

function normalizeCookie(value) {
  const cookie = String(value || "").trim().replace(/^cookie\s*:\s*/i, "").trim();
  if (!cookie || cookie.length > 16384 || /[\r\n]/.test(cookie)) return "";
  return cookie;
}

function hasLoginCookie(cookie) {
  return /(?:^|;\s*)(?:sessionid|sessionid_ss)=[^;]+/i.test(cookie);
}

function buildTikTokHeaders(cookie = "") {
  const headers = { ...TIKTOK_HEADERS };
  const normalized = normalizeCookie(cookie);
  if (normalized) headers.Cookie = normalized;
  return headers;
}

function getBody(response) {
  let body = response && response.data !== undefined ? response.data : response;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return null;
    }
  }
  return body && typeof body === "object" ? body : null;
}

function cleanUsername(value) {
  const username = String(value || "").replace(/^@/, "").trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(username) ? username : "";
}

function parseInternalLink(value) {
  const match = String(value || "").match(/^tiktok:(\d{10,25}):(.+)$/);
  if (!match) return null;

  let username = "";
  try {
    username = cleanUsername(decodeURIComponent(match[2]));
  } catch (error) {
    return null;
  }

  if (!username) return null;
  return {
    kind: "internal",
    id: match[1],
    username,
    url: buildCanonicalUrl(match[1], username)
  };
}

function parseTikTokUrl(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?(?:[?#].*)?$/i);
  if (!match) return null;

  const host = match[1].toLowerCase().replace(/\.$/, "");
  const path = match[2] || "/";
  if (TIKTOK_SHORT_HOSTS.includes(host)) {
    if (!/^\/[A-Za-z0-9_-]+\/?$/.test(path)) return null;
    return { kind: "short", id: "", username: "", url: raw };
  }

  if (!TIKTOK_HOSTS.includes(host)) return null;
  const detailMatch = path.match(/^\/@([^/]+)\/video\/(\d{10,25})\/?$/i);
  if (detailMatch) {
    const username = cleanUsername(detailMatch[1]);
    if (!username) return null;
    return {
      kind: "detail",
      id: detailMatch[2],
      username,
      url: buildCanonicalUrl(detailMatch[2], username)
    };
  }

  if (/^\/t\/[A-Za-z0-9_-]+\/?$/.test(path)) {
    return { kind: "short", id: "", username: "", url: raw };
  }
  return null;
}

function parseOwnedLink(value) {
  return parseInternalLink(value) || parseTikTokUrl(value);
}

function buildCanonicalUrl(id, username) {
  const cleanId = String(id || "");
  const cleanUser = cleanUsername(username);
  if (!/^\d{10,25}$/.test(cleanId) || !cleanUser) return "";
  return `${TIKTOK_BASE}/@${cleanUser}/video/${cleanId}`;
}

function buildInternalLink(id, username) {
  const canonical = buildCanonicalUrl(id, username);
  if (!canonical) return "";
  return `tiktok:${id}:${encodeURIComponent(cleanUsername(username))}`;
}

function normalizeTikwmItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || raw.video_id || "");
  const author = raw.author && typeof raw.author === "object" ? raw.author : {};
  const username = cleanUsername(author.unique_id || raw.unique_id || "");
  if (!/^\d{10,25}$/.test(id) || !username) return null;

  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  return {
    id,
    username,
    nickname: String(author.nickname || username),
    avatar: String(author.avatar || ""),
    title: String(raw.title || ""),
    cover: String(raw.cover || raw.origin_cover || raw.ai_dynamic_cover || ""),
    duration: Number(raw.duration || 0),
    createTime: Number(raw.create_time || 0),
    playCount: Number(raw.play_count || 0),
    diggCount: Number(raw.digg_count || 0),
    commentCount: Number(raw.comment_count || 0),
    shareCount: Number(raw.share_count || 0),
    play: String(raw.play || ""),
    hdplay: String(raw.hdplay || ""),
    wmplay: String(raw.wmplay || ""),
    size: Number(raw.size || 0),
    hdSize: Number(raw.hd_size || 0),
    images,
    variants: []
  };
}

function normalizeOfficialItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "");
  const author = raw.author && typeof raw.author === "object" ? raw.author : {};
  const video = raw.video && typeof raw.video === "object" ? raw.video : {};
  const username = cleanUsername(author.uniqueId || "");
  if (!/^\d{10,25}$/.test(id) || !username) return null;

  const stats = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  const variants = [];
  const bitrateInfo = Array.isArray(video.bitrateInfo) ? video.bitrateInfo : [];
  bitrateInfo.forEach((entry) => {
    const address = entry && (entry.PlayAddr || entry.playAddr);
    const urls = address && Array.isArray(address.UrlList) ? address.UrlList : [];
    if (!urls[0]) return;
    variants.push({
      name: address.Height ? `${address.Height}P` : String(entry.GearName || entry.gearName || "备用"),
      url: String(urls[0]),
      size: Number(address.DataSize || 0)
    });
  });

  return {
    id,
    username,
    nickname: String(author.nickname || username),
    avatar: String(author.avatarMedium || author.avatarThumb || ""),
    title: String(raw.desc || ""),
    cover: String(video.cover || video.originCover || video.dynamicCover || ""),
    duration: Number(video.duration || 0),
    createTime: Number(raw.createTime || 0),
    playCount: Number(stats.playCount || 0),
    diggCount: Number(stats.diggCount || 0),
    commentCount: Number(stats.commentCount || 0),
    shareCount: Number(stats.shareCount || 0),
    play: String(video.playAddr || ""),
    hdplay: "",
    wmplay: String(video.downloadAddr || ""),
    size: 0,
    hdSize: 0,
    images: [],
    variants
  };
}

function isPlayableVideo(item) {
  if (!item) return false;
  if (item.images.length && item.duration <= 0) return false;
  return !!(item.play || item.hdplay || item.wmplay || item.variants.length);
}

function getCachedItem(context) {
  if (!context || !context.id) return null;
  const cached = ITEM_CACHE[context.id];
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= ITEM_CACHE_TTL_MS) {
    delete ITEM_CACHE[context.id];
    return null;
  }
  return cached.item;
}

function cacheItem(item) {
  if (!item || !item.id) return item;
  ITEM_CACHE[item.id] = { item, timestamp: Date.now() };
  return item;
}

function compactNumber(value) {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(number);
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remain = Math.floor(total % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function itemTitle(item) {
  const title = String(item.title || "").trim();
  return title || `@${item.username} 的 TikTok`;
}

function itemDescription(item) {
  return [
    `作者：${item.nickname} (@${item.username})`,
    `播放：${compactNumber(item.playCount)}`,
    `点赞：${compactNumber(item.diggCount)}`,
    `评论：${compactNumber(item.commentCount)}`,
    `分享：${compactNumber(item.shareCount)}`
  ].join(" | ");
}

function toVideoItem(item) {
  const link = buildInternalLink(item.id, item.username);
  if (!link) return null;
  const canonicalUrl = buildCanonicalUrl(item.id, item.username);
  const cover = item.cover || item.avatar || "";
  return {
    id: canonicalUrl,
    type: "url",
    title: itemTitle(item),
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    releaseDate: formatDate(item.createTime),
    description: itemDescription(item),
    duration: item.duration,
    durationText: formatDuration(item.duration),
    link,
    playerType: "app"
  };
}

async function fetchTikwmItem(context) {
  const response = await Widget.http.get(`${TIKWM_BASE}/api/`, {
    headers: API_HEADERS,
    params: { url: context.url, hd: "1" }
  });
  const body = getBody(response);
  if (!body || Number(body.code) !== 0 || !body.data) return null;

  const item = normalizeTikwmItem(body.data);
  if (!item) return null;
  if (context.id && item.id !== context.id) return null;
  return item;
}

function extractHydrationData(html) {
  const source = String(html || "");
  const match = source.match(/<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

async function fetchOfficialItem(context) {
  if (!context.id || !context.username) return null;
  const url = buildCanonicalUrl(context.id, context.username);
  if (!url) return null;

  const response = await Widget.http.get(url, { headers: buildTikTokHeaders() });
  const hydration = extractHydrationData(response && response.data);
  const scope = hydration && hydration.__DEFAULT_SCOPE__;
  const detail = scope && scope["webapp.video-detail"];
  const raw = detail && detail.itemInfo && detail.itemInfo.itemStruct;
  const item = normalizeOfficialItem(raw);
  if (!item || item.id !== context.id) return null;
  return item;
}

async function fetchFreshItem(context) {
  const cached = getCachedItem(context);
  if (cached) return cached;

  try {
    const item = await fetchTikwmItem(context);
    if (item) return cacheItem(item);
  } catch (error) {
    console.log("[TikTok] TikWM 解析失败:", error.message || error);
  }

  try {
    const item = await fetchOfficialItem(context);
    return item ? cacheItem(item) : null;
  } catch (error) {
    console.log("[TikTok] 官方页面解析失败:", error.message || error);
    return null;
  }
}

loadForYou = async function loadForYou(params = {}) {
  try {
    const cookie = normalizeCookie(params.cookie);
    if (!hasLoginCookie(cookie)) return [];

    const language = params.language === "zh-Hans" ? "zh-Hans" : "zh-Hant";
    const response = await Widget.http.get(`${TIKTOK_BASE}/foryou`, {
      headers: buildTikTokHeaders(cookie),
      params: { lang: language }
    });
    const hydration = extractHydrationData(response && response.data);
    const scope = hydration && hydration.__DEFAULT_SCOPE__;
    const appContext = scope && scope["webapp.app-context"];
    const loginConfirmed = !!(appContext && appContext.user);
    const forYou = scope && scope["webapp.foryou.video"];
    const list = forYou && Array.isArray(forYou.itemList) ? forYou.itemList : [];
    const items = list
      .map(normalizeOfficialItem)
      .filter(isPlayableVideo);
    items.forEach(cacheItem);
    const results = items
      .map(toVideoItem)
      .filter(Boolean);
    if (!loginConfirmed) {
      console.log("[TikTok loadForYou] Cookie 已发送，但响应未明确确认登录状态");
      results.forEach((item) => {
        item.description = `登录状态未确认 | ${item.description || ""}`;
      });
    }
    return results;
  } catch (error) {
    console.error("[TikTok loadForYou] 失败:", error.message || error);
    throw error;
  }
};

loadPopular = async function loadPopular(params = {}) {
  try {
    const region = /^[A-Z]{2}$/.test(String(params.region || "TW")) ? String(params.region || "TW") : "TW";
    const count = Math.min(30, Math.max(1, Number(params.count || 20)));
    const response = await Widget.http.get(`${TIKWM_BASE}/api/feed/list`, {
      headers: API_HEADERS,
      params: { region, count: String(count) }
    });
    const body = getBody(response);
    if (!body || Number(body.code) !== 0 || !Array.isArray(body.data)) {
      throw new Error((body && body.msg) || "热门接口返回异常");
    }

    const items = body.data
      .map(normalizeTikwmItem)
      .filter(isPlayableVideo);
    items.forEach(cacheItem);
    return items
      .map(toVideoItem)
      .filter(Boolean);
  } catch (error) {
    console.error("[TikTok loadPopular] 失败:", error.message || error);
    throw error;
  }
};

loadByUrl = async function loadByUrl(params = {}) {
  try {
    const context = parseTikTokUrl(params.url || "");
    if (!context) return [];
    const item = await fetchFreshItem(context);
    if (!isPlayableVideo(item)) return [];
    const result = toVideoItem(item);
    return result ? [result] : [];
  } catch (error) {
    console.error("[TikTok loadByUrl] 失败:", error.message || error);
    throw error;
  }
};

search = async function search(params = {}) {
  return loadByUrl({ url: params.keyword || "" });
};

loadDetail = async function loadDetail(link) {
  try {
    const context = parseInternalLink(link);
    if (!context) return null;
    const item = await fetchFreshItem(context);
    if (!isPlayableVideo(item)) return null;
    return toVideoItem(item);
  } catch (error) {
    console.error("[TikTok loadDetail] 失败:", error.message || error);
    throw error;
  }
};

function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return "";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(size / 1024)} KB`;
}

function buildResources(item) {
  const referer = buildCanonicalUrl(item.id, item.username);
  const headers = {
    Referer: referer,
    "User-Agent": USER_AGENT,
    "X-Forward-Skip-Redirect-Probe": "1"
  };
  const resources = [];
  const seen = new Set();

  function add(name, url, size, note) {
    const cleanUrl = String(url || "").trim();
    if (!/^https?:\/\//i.test(cleanUrl) || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    const sizeText = formatBytes(size);
    resources.push({
      name,
      description: [note, sizeText, `@${item.username}`].filter(Boolean).join(" | "),
      url: cleanUrl,
      customHeaders: headers,
      playerType: "app"
    });
  }

  add("高清", item.hdplay, item.hdSize, "TikTok MP4");
  add("无水印", item.play, item.size, "TikTok MP4");
  item.variants.forEach((variant) => add(variant.name || "备用", variant.url, variant.size, "TikTok 官方线路"));
  add("水印备用", item.wmplay, 0, "TikTok MP4");
  return resources;
}

loadResource = async function loadResource(params = {}) {
  try {
    let context = null;
    if (params.link !== undefined && params.link !== null && String(params.link).trim()) {
      context = parseOwnedLink(params.link);
      if (!context) return [];
    } else if (params.id !== undefined && params.id !== null && String(params.id).trim()) {
      context = parseOwnedLink(params.id);
      if (!context) return [];
    } else {
      return [];
    }

    const item = await fetchFreshItem(context);
    if (!isPlayableVideo(item)) return [];
    if (context.id && item.id !== context.id) return [];
    return buildResources(item);
  } catch (error) {
    console.error("[TikTok loadResource] 失败:", error.message || error);
    throw error;
  }
};
