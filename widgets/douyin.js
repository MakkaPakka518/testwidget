WidgetMetadata = {
  id: "com.douyin.creator",
  title: "抖音",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "使用 Creator 登录 Cookie 获取我的作品，并提供详情与官方动态播放地址",
  author: "MakkaPakka",
  site: "https://creator.douyin.com",
  detailCacheDuration: 300,
  globalParams: [
    {
      name: "cookie",
      title: "抖音 Creator Cookie",
      type: "input",
      value: "",
      description: "在 Auth/WebView 中打开 creator.douyin.com 扫码登录后，复制完整 Cookie 填入。Cookie 只发送给 creator.douyin.com。"
    }
  ],
  modules: [
    {
      id: "loadMyWorks",
      title: "我的作品",
      description: "读取当前登录抖音账号发布的视频",
      functionName: "loadMyWorks",
      cacheDuration: 0,
      requiresWebView: false,
      sectionMode: false,
      params: [
        { name: "page", title: "页码", type: "page" },
        { name: "count", title: "数量", type: "count", value: "18" }
      ]
    },
    {
      id: "loadResource",
      title: "抖音播放源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ]
};

var CREATOR_BASE = "https://creator.douyin.com";
var DOUYIN_BASE = "https://www.douyin.com";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
var ITEM_CACHE_TTL_MS = 30 * 60 * 1000;
var ITEM_MEMORY_CACHE = {};

function normalizeCookie(value) {
  var cookie = String(value || "").trim().replace(/^cookie\s*:\s*/i, "").trim();
  if (!cookie || cookie.length > 16384 || /[\r\n]/.test(cookie)) return "";
  return cookie;
}

function hasLoginCookie(cookie) {
  return /(?:^|;\s*)(?:sessionid|sessionid_ss|sid_tt|uid_tt)=[^;]+/i.test(cookie);
}

function creatorHeaders(cookie, referer) {
  return {
    Cookie: cookie,
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: referer
  };
}

function getBody(response) {
  var body = response && response.data !== undefined ? response.data : response;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return null;
    }
  }
  return body && typeof body === "object" ? body : null;
}

function firstUrl(address) {
  if (!address || typeof address !== "object") return "";
  var urls = address.url_list || address.urlList || address.UrlList;
  return Array.isArray(urls) && urls[0] ? String(urls[0]) : "";
}

function addressUri(address) {
  return address && typeof address === "object" ? String(address.uri || address.Uri || "") : "";
}

function compactNumber(value) {
  var number = Number(value || 0);
  if (number >= 100000000) return (number / 100000000).toFixed(1) + "亿";
  if (number >= 10000) return (number / 10000).toFixed(1) + "万";
  return String(number);
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  var date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatDuration(seconds) {
  var total = Math.max(0, Number(seconds || 0));
  var minutes = Math.floor(total / 60);
  var remain = Math.floor(total % 60);
  return String(minutes).padStart(2, "0") + ":" + String(remain).padStart(2, "0");
}

function parseOwnedLink(value) {
  var match = String(value || "").match(/^douyin:(\d{10,25})$/);
  return match ? { id: match[1] } : null;
}

function normalizeDuration(value) {
  var duration = Number(value || 0);
  return duration > 1000 ? Math.round(duration / 1000) : Math.round(duration);
}

function normalizeAweme(raw) {
  if (!raw || typeof raw !== "object") return null;
  var id = String(raw.aweme_id || raw.awemeId || raw.id || "");
  if (!/^\d{10,25}$/.test(id)) return null;

  var video = raw.video && typeof raw.video === "object" ? raw.video : {};
  var author = raw.author && typeof raw.author === "object" ? raw.author : {};
  var stats = raw.statistics && typeof raw.statistics === "object"
    ? raw.statistics
    : raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  var h264 = video.play_addr_h264 || video.playAddrH264 || {};
  var play = video.play_addr || video.playAddr || {};
  var cover = firstUrl(video.cover) || firstUrl(video.origin_cover) || firstUrl(video.dynamic_cover);
  var avatar = firstUrl(author.avatar_thumb) || firstUrl(author.avatar_medium) || "";
  var variants = [];
  var bitRates = Array.isArray(video.bit_rate) ? video.bit_rate : [];

  for (var i = 0; i < bitRates.length; i++) {
    var bitrate = bitRates[i] || {};
    var address = bitrate.play_addr || bitrate.playAddr || {};
    var url = firstUrl(address);
    if (!url) continue;
    variants.push({
      name: String(bitrate.gear_name || bitrate.gearName || bitrate.quality_type || "备用"),
      url: url,
      bitrate: Number(bitrate.bit_rate || bitrate.bitRate || 0),
      h265: Number(bitrate.is_h265 || 0) === 1
    });
  }

  return {
    id: id,
    title: String(raw.desc || raw.title || ""),
    nickname: String(author.nickname || "抖音用户"),
    username: String(author.unique_id || author.uniqueId || ""),
    avatar: avatar,
    cover: cover,
    duration: normalizeDuration(video.duration),
    createTime: Number(raw.create_time || raw.createTime || 0),
    playCount: Number(stats.play_count || stats.playCount || 0),
    diggCount: Number(stats.digg_count || stats.diggCount || 0),
    commentCount: Number(stats.comment_count || stats.commentCount || 0),
    shareCount: Number(stats.share_count || stats.shareCount || 0),
    h264Uri: addressUri(h264),
    playUri: addressUri(play),
    h264Url: firstUrl(h264),
    playUrl: firstUrl(play),
    variants: variants,
    imagePost: Array.isArray(raw.images) && raw.images.length > 0 && normalizeDuration(video.duration) <= 0
  };
}

function isPlayable(item) {
  return !!(item && !item.imagePost && (item.h264Uri || item.playUri || item.h264Url || item.playUrl || item.variants.length));
}

function itemDescription(item) {
  return [
    "作者：" + item.nickname + (item.username ? " (@" + item.username + ")" : ""),
    "播放：" + compactNumber(item.playCount),
    "点赞：" + compactNumber(item.diggCount),
    "评论：" + compactNumber(item.commentCount),
    "分享：" + compactNumber(item.shareCount)
  ].join(" | ");
}

function toVideoItem(item) {
  if (!isPlayable(item)) return null;
  var cover = item.cover || item.avatar || "";
  return {
    id: DOUYIN_BASE + "/video/" + item.id,
    type: "url",
    title: item.title || item.nickname + " 的抖音作品",
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    releaseDate: formatDate(item.createTime),
    description: itemDescription(item),
    duration: item.duration,
    durationText: formatDuration(item.duration),
    link: "douyin:" + item.id,
    playerType: "app"
  };
}

async function cacheItem(item) {
  if (!item || !item.id) return;
  ITEM_MEMORY_CACHE[item.id] = { item: item, timestamp: Date.now() };
  if (Widget.storage && typeof Widget.storage.set === "function") {
    await Widget.storage.set("douyin:item:" + item.id, JSON.stringify({ item: item, timestamp: Date.now() }));
  }
}

async function getCachedItem(id) {
  var memory = ITEM_MEMORY_CACHE[id];
  if (memory && Date.now() - memory.timestamp < ITEM_CACHE_TTL_MS) return memory.item;
  if (!Widget.storage || typeof Widget.storage.get !== "function") return null;
  var raw = await Widget.storage.get("douyin:item:" + id);
  if (!raw) return null;
  try {
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || !parsed.item || Date.now() - Number(parsed.timestamp || 0) >= ITEM_CACHE_TTL_MS) {
      if (typeof Widget.storage.remove === "function") await Widget.storage.remove("douyin:item:" + id);
      return null;
    }
    ITEM_MEMORY_CACHE[id] = parsed;
    return parsed.item;
  } catch (error) {
    return null;
  }
}

async function cacheItems(items) {
  for (var i = 0; i < items.length; i++) await cacheItem(items[i]);
}

async function getCursor(page) {
  if (page <= 1) return "0";
  if (!Widget.storage || typeof Widget.storage.get !== "function") return "";
  var value = await Widget.storage.get("douyin:cursor:" + page);
  return value === undefined || value === null ? "" : String(value);
}

async function setNextCursor(page, cursor) {
  if (!Widget.storage || typeof Widget.storage.set !== "function") return;
  if (cursor === undefined || cursor === null || cursor === "") return;
  await Widget.storage.set("douyin:cursor:" + (page + 1), String(cursor));
}

loadMyWorks = async function loadMyWorks(params) {
  try {
    var cookie = normalizeCookie(params && params.cookie);
    if (!hasLoginCookie(cookie)) return [];
    var page = Math.max(1, Number(params && params.page || 1));
    var count = Math.min(20, Math.max(1, Number(params && params.count || 18)));
    var cursor = await getCursor(page);
    if (page > 1 && !cursor) return [];

    var response = await Widget.http.get(CREATOR_BASE + "/janus/douyin/creator/pc/work_list", {
      headers: creatorHeaders(cookie, CREATOR_BASE + "/creator-micro/content/post/video?enter_from=publish_page"),
      params: {
        scene: "star_atlas",
        device_platform: "android",
        status: "4",
        count: String(count),
        max_cursor: cursor
      }
    });
    var body = getBody(response);
    var data = body && body.data && typeof body.data === "object" ? body.data : body;
    if (!data) throw new Error("作品接口返回为空");
    if (Number(data.status_code || body.status_code || 0) === 8) throw new Error("抖音 Cookie 已失效，请重新扫码登录");

    var list = Array.isArray(data.aweme_list) ? data.aweme_list : Array.isArray(data.items) ? data.items : [];
    var items = list.map(normalizeAweme).filter(isPlayable);
    await cacheItems(items);
    await setNextCursor(page, data.max_cursor);
    return items.map(toVideoItem).filter(Boolean);
  } catch (error) {
    console.error("[Douyin loadMyWorks] 失败:", error.message || error);
    throw error;
  }
};

loadDetail = async function loadDetail(link) {
  try {
    var context = parseOwnedLink(link);
    if (!context) return null;
    var item = await getCachedItem(context.id);
    return isPlayable(item) ? toVideoItem(item) : null;
  } catch (error) {
    console.error("[Douyin loadDetail] 失败:", error.message || error);
    throw error;
  }
};

function formatBitrate(value) {
  var bitrate = Number(value || 0);
  return bitrate > 0 ? Math.round(bitrate / 1000) + " Kbps" : "";
}

function buildResources(item) {
  var headers = { Referer: DOUYIN_BASE + "/", "User-Agent": USER_AGENT };
  var resources = [];
  var seen = {};

  function add(name, url, description) {
    var cleanUrl = String(url || "").trim();
    if (!/^https?:\/\//i.test(cleanUrl) || seen[cleanUrl]) return;
    seen[cleanUrl] = true;
    resources.push({
      name: name,
      description: description,
      url: cleanUrl,
      customHeaders: headers,
      playerType: "app"
    });
  }

  if (item.h264Uri) {
    add("官方 H.264", DOUYIN_BASE + "/aweme/v1/play/?video_id=" + encodeURIComponent(item.h264Uri) + "&ratio=default", "动态官方播放地址");
  }
  if (item.playUri && item.playUri !== item.h264Uri) {
    add("官方默认", DOUYIN_BASE + "/aweme/v1/play/?video_id=" + encodeURIComponent(item.playUri) + "&ratio=default", "动态官方播放地址");
  }

  var variants = item.variants.slice().sort(function (a, b) { return b.bitrate - a.bitrate; });
  for (var i = 0; i < variants.length; i++) {
    if (variants[i].h265) continue;
    add(variants[i].name || "备用", variants[i].url, ["抖音 MP4", formatBitrate(variants[i].bitrate)].filter(Boolean).join(" | "));
  }
  add("H.264 直链", item.h264Url, "抖音 MP4");
  add("默认直链", item.playUrl, "抖音 MP4");
  return resources;
}

loadResource = async function loadResource(params) {
  try {
    var raw = params && params.link !== undefined && String(params.link || "").trim()
      ? params.link
      : params && params.id;
    var context = parseOwnedLink(raw);
    if (!context) return [];
    var item = await getCachedItem(context.id);
    return isPlayable(item) ? buildResources(item) : [];
  } catch (error) {
    console.error("[Douyin loadResource] 失败:", error.message || error);
    throw error;
  }
};
