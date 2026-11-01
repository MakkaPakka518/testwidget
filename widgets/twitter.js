WidgetMetadata = {
  id: "com.x.video",
  title: "X / Twitter 视频",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  description: "X/Twitter 视频模块：List 聚合、用户视频、搜索、链接解析与多清晰度播放",
  author: "OpenCode",
  site: "https://x.com",
  detailCacheDuration: 300,
  globalParams: [
    {
      name: "language",
      title: "翻译语言",
      type: "enumeration",
      value: "zh-cn",
      enumOptions: [
        { title: "简体中文", value: "zh-cn" },
        { title: "繁体中文", value: "zh-tw" },
        { title: "不翻译", value: "" }
      ]
    },
    {
      name: "xCookie",
      title: "X Cookie（列表可选）",
      type: "input",
      value: "",
      description: "获取 X List 视频需要包含 auth_token 和 ct0 的 Cookie，请勿分享。"
    },
    {
      name: "browserServer",
      title: "浏览器服务地址（列表可选）",
      type: "input",
      value: "",
      description: "现有 Playwright 服务的 HTTPS 地址。"
    },
    {
      name: "browserToken",
      title: "浏览器服务令牌（列表可选）",
      type: "input",
      value: "",
      description: "访问受保护浏览器服务的令牌，请勿分享。"
    }
  ],
  modules: [
    {
      id: "loadListVideos",
      title: "列表全部用户视频",
      functionName: "loadListVideos",
      cacheDuration: 60,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "listUrl",
          title: "X List 链接",
          type: "input",
          value: "https://x.com/i/lists/1655997863032401921"
        },
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadUserVideos",
      title: "用户视频",
      functionName: "loadUserVideos",
      cacheDuration: 180,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "username",
          title: "用户名",
          type: "input",
          value: "SpaceX",
          placeholders: [
            { title: "SpaceX", value: "SpaceX" },
            { title: "X", value: "X" }
          ]
        },
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadByUrl",
      title: "解析推文链接",
      functionName: "loadByUrl",
      cacheDuration: 0,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "url",
          title: "推文链接",
          type: "input",
          placeholders: [
            { title: "X/Twitter 视频推文", value: "https://x.com/user/status/1234567890123456789" }
          ]
        }
      ]
    },
    {
      id: "loadResource",
      title: "X/Twitter 播放源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索视频",
    functionName: "search",
    params: [
      { name: "keyword", title: "关键词、@用户或推文链接", type: "input" },
      {
        name: "feed",
        title: "排序",
        type: "enumeration",
        value: "latest",
        enumOptions: [
          { title: "最新", value: "latest" },
          { title: "热门", value: "top" },
          { title: "媒体", value: "media" }
        ]
      },
      { name: "count", title: "数量", type: "count", value: "30" }
    ]
  }
};

const FX_API = "https://api.fxtwitter.com";
const X_BASE = "https://x.com";
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const X_HOSTS = ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"];
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
const STATUS_CACHE = {};

const API_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json,text/plain,*/*",
  Referer: `${X_BASE}/`
};

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

function cleanHandle(value) {
  const handle = String(value || "").replace(/^@/, "").trim();
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : "";
}

function parseInternalLink(value) {
  const match = String(value || "").match(/^xstatus:(\d{2,20})$/);
  return match ? { kind: "internal", id: match[1], handle: "", url: "" } : null;
}

function parseTweetUrl(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^https?:\/\/([^/?#]+)\/([^/?#]+)\/status\/(\d{2,20})(?:\/[^?#]*)?(?:[?#].*)?$/i);
  if (!match) return null;
  const host = match[1].toLowerCase().replace(/\.$/, "");
  const handle = cleanHandle(match[2]);
  if (!X_HOSTS.includes(host) || !handle) return null;
  return {
    kind: "tweet",
    id: match[3],
    handle,
    url: `${X_BASE}/${handle}/status/${match[3]}`
  };
}

function parseOwnedLink(value) {
  return parseInternalLink(value) || parseTweetUrl(value);
}

function canonicalUrl(status) {
  const handle = cleanHandle(status && status.author && status.author.screen_name);
  const id = String(status && status.id || "");
  if (!handle || !/^\d{2,20}$/.test(id)) return "";
  return `${X_BASE}/${handle}/status/${id}`;
}

function statusVideos(status) {
  const media = status && status.media && typeof status.media === "object" ? status.media : {};
  const videos = Array.isArray(media.videos)
    ? media.videos
    : (Array.isArray(media.all) ? media.all.filter((item) => item && (item.type === "video" || item.type === "gif")) : []);
  return videos.filter((video) => video && (/^https?:\/\//i.test(String(video.url || "")) || Array.isArray(video.formats)));
}

function isVideoStatus(status) {
  return !!status && status.type === "status" && /^\d{2,20}$/.test(String(status.id || "")) && statusVideos(status).length > 0;
}

function cacheStatus(status) {
  if (!isVideoStatus(status)) return status;
  STATUS_CACHE[String(status.id)] = { status, timestamp: Date.now() };
  if (isVideoStatus(status.quote)) cacheStatus(status.quote);
  return status;
}

function getCachedStatus(id) {
  const cached = STATUS_CACHE[String(id || "")];
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= STATUS_CACHE_TTL_MS) {
    delete STATUS_CACHE[String(id || "")];
    return null;
  }
  return cached.status;
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
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function displayText(status) {
  const translated = status && status.translation && status.translation.text;
  return String(translated || status && status.text || "").trim();
}

function tweetDescription(status) {
  const author = status.author || {};
  return [
    `${author.name || author.screen_name || "X"} (@${author.screen_name || "unknown"})`,
    `播放：${compactNumber(status.views)}`,
    `点赞：${compactNumber(status.likes)}`,
    `转发：${compactNumber(status.reposts)}`,
    `回复：${compactNumber(status.replies)}`
  ].join(" | ");
}

function toVideoItem(status, includeRelated = true) {
  if (!isVideoStatus(status)) return null;
  const url = canonicalUrl(status);
  if (!url) return null;
  const videos = statusVideos(status);
  const cover = String(videos[0].thumbnail_url || status.author && status.author.avatar_url || "");
  const item = {
    id: url,
    type: "url",
    title: displayText(status) || `@${status.author.screen_name} 的视频`,
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    backdropPaths: videos.map((video) => String(video.thumbnail_url || "")).filter(Boolean),
    releaseDate: formatDate(status.created_timestamp),
    description: tweetDescription(status),
    duration: Number(videos[0].duration || 0),
    durationText: formatDuration(videos[0].duration),
    peoples: [{
      id: String(status.author.screen_name),
      title: String(status.author.name || status.author.screen_name),
      avatar: String(status.author.avatar_url || ""),
      role: "作者"
    }],
    link: `xstatus:${status.id}`,
    playerType: "app"
  };
  if (includeRelated && isVideoStatus(status.quote)) {
    const quote = toVideoItem(status.quote, false);
    if (quote) item.relatedItems = [quote];
  }
  return item;
}

function languageParam(params) {
  const language = String(params && params.language || "zh-cn");
  return ["zh-cn", "zh-tw", ""].includes(language) ? language : "zh-cn";
}

function normalizeHttpsServer(value) {
  const server = String(value || "").trim().replace(/\/+$/, "");
  if (!server || server.length > 512 || /[\r\n\s]/.test(server) || !/^https:\/\//i.test(server)) return "";
  return server;
}

function normalizeListUrl(value) {
  const match = String(value || "").trim().match(/^https:\/\/(?:www\.)?x\.com\/i\/lists\/(\d{2,20})\/?(?:[?#].*)?$/i);
  return match ? `https://x.com/i/lists/${match[1]}` : "";
}

function normalizeXCookie(value) {
  const cookie = String(value || "").trim().replace(/^cookie\s*:\s*/i, "").trim();
  if (!cookie || cookie.length > 16384 || /[\r\n]/.test(cookie)) return "";
  if (!/(?:^|;\s*)auth_token=[^;]+/i.test(cookie) || !/(?:^|;\s*)ct0=[^;]+/i.test(cookie)) return "";
  return cookie;
}

async function fetchStatus(id, language) {
  const cleanId = String(id || "");
  if (!/^\d{2,20}$/.test(cleanId)) return null;
  const cached = getCachedStatus(cleanId);
  if (cached) return cached;

  const query = {};
  if (language) query.lang = language;
  const response = await Widget.http.get(`${FX_API}/2/status/${cleanId}`, {
    headers: API_HEADERS,
    params: query
  });
  const body = getBody(response);
  const status = body && Number(body.code) === 200 ? body.status : null;
  if (!isVideoStatus(status) || String(status.id) !== cleanId) return null;
  return cacheStatus(status);
}

function mapVideoResults(results) {
  return (Array.isArray(results) ? results : [])
    .filter(isVideoStatus)
    .map(cacheStatus)
    .map(toVideoItem)
    .filter(Boolean);
}

loadListVideos = async function loadListVideos(params = {}) {
  try {
    const listUrl = normalizeListUrl(params.listUrl);
    const cookie = normalizeXCookie(params.xCookie);
    const server = normalizeHttpsServer(params.browserServer);
    const token = String(params.browserToken || "").trim();
    if (!listUrl || !cookie || !server || !token || /[\r\n]/.test(token)) return [];
    const count = Math.min(20, Math.max(1, Number(params.count || 20)));
    const response = await Widget.http.post(`${server}/v1/x-list-videos`, {
      listUrl,
      cookie,
      limit: count
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    const body = getBody(response);
    if (response && Number(response.statusCode) === 401) throw new Error("浏览器服务令牌无效");
    return body && Array.isArray(body.items) ? mapVideoResults(body.items) : [];
  } catch (error) {
    console.error("[X loadListVideos] 失败:", error.message || error);
    throw error;
  }
};

loadUserVideos = async function loadUserVideos(params = {}) {
  try {
    const handle = cleanHandle(params.peopleId || params.username);
    if (!handle) return [];
    const count = Math.min(50, Math.max(1, Number(params.count || 20)));
    const query = { count: String(count) };
    const language = languageParam(params);
    if (language) query.lang = language;
    const response = await Widget.http.get(`${FX_API}/2/profile/${handle}/media`, {
      headers: API_HEADERS,
      params: query
    });
    const body = getBody(response);
    if (!body || Number(body.code) !== 200) return [];
    return mapVideoResults(body.results);
  } catch (error) {
    console.error("[X loadUserVideos] 失败:", error.message || error);
    throw error;
  }
};

loadByUrl = async function loadByUrl(params = {}) {
  try {
    const context = parseTweetUrl(params.url || "");
    if (!context) return [];
    const status = await fetchStatus(context.id, languageParam(params));
    const item = toVideoItem(status);
    return item ? [item] : [];
  } catch (error) {
    console.error("[X loadByUrl] 失败:", error.message || error);
    throw error;
  }
};

search = async function search(params = {}) {
  try {
    const keyword = String(params.keyword || "").trim();
    if (!keyword) return [];
    if (parseTweetUrl(keyword)) return loadByUrl({ ...params, url: keyword });
    if (/^@[A-Za-z0-9_]{1,15}$/.test(keyword)) {
      return loadUserVideos({ ...params, username: keyword.slice(1) });
    }

    const feed = ["latest", "top", "media"].includes(params.feed) ? params.feed : "latest";
    const count = Math.min(50, Math.max(1, Number(params.count || 30)));
    const query = { q: keyword, feed, count: String(count) };
    const language = languageParam(params);
    if (language) query.lang = language;
    const response = await Widget.http.get(`${FX_API}/2/search`, {
      headers: API_HEADERS,
      params: query
    });
    const body = getBody(response);
    if (!body || Number(body.code) !== 200) return [];
    return mapVideoResults(body.results);
  } catch (error) {
    console.error("[X search] 失败:", error.message || error);
    throw error;
  }
};

loadDetail = async function loadDetail(link) {
  try {
    const context = parseInternalLink(link);
    if (!context) return null;
    const status = await fetchStatus(context.id, "zh-cn");
    return toVideoItem(status);
  } catch (error) {
    console.error("[X loadDetail] 失败:", error.message || error);
    throw error;
  }
};

function formatHeight(format) {
  const height = Number(format && format.height || 0);
  if (height) return height;
  const match = String(format && format.url || "").match(/\/(?:avc1|hevc)\/(\d+)x(\d+)\//i);
  return match ? Number(match[2]) : 0;
}

function buildResources(status) {
  const referer = canonicalUrl(status);
  const resources = [];
  const seen = new Set();
  statusVideos(status).forEach((video, videoIndex) => {
    const formats = Array.isArray(video.formats) ? video.formats.slice() : [];
    if (video.url) formats.push({ url: video.url, container: "mp4", height: video.height, bitrate: 0 });
    formats.sort((a, b) => {
      const aHls = a.container === "m3u8" ? 1 : 0;
      const bHls = b.container === "m3u8" ? 1 : 0;
      if (aHls !== bHls) return aHls - bHls;
      return (formatHeight(b) - formatHeight(a)) || (Number(b.bitrate || 0) - Number(a.bitrate || 0));
    });
    formats.forEach((format) => {
      const url = String(format.url || "").trim();
      if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
      seen.add(url);
      const height = formatHeight(format);
      const isHls = format.container === "m3u8" || /\.m3u8(?:\?|$)/i.test(url);
      const prefix = statusVideos(status).length > 1 ? `视频${videoIndex + 1} · ` : "";
      const quality = isHls ? "HLS AUTO" : (height ? `${height}P` : "MP4");
      const bitrate = Number(format.bitrate || 0);
      resources.push({
        name: `${prefix}${quality}`,
        description: [format.codec || "H.264", bitrate ? `${Math.round(bitrate / 1000)} kbps` : ""].filter(Boolean).join(" | "),
        url,
        customHeaders: { Referer: referer, "User-Agent": USER_AGENT },
        playerType: "app"
      });
    });
  });
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

    const status = await fetchStatus(context.id, "");
    if (!status || String(status.id) !== context.id) return [];
    return buildResources(status);
  } catch (error) {
    console.error("[X loadResource] 失败:", error.message || error);
    throw error;
  }
};
