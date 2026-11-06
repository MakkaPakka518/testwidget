WidgetMetadata = {
  id: "makka.anigamer.site",
  title: "巴哈姆特動畫瘋",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "動畫瘋新番、本季熱門、人氣、最新上架、專題、全站篩選、搜尋與分集播放；播放源需台灣/香港網路",
  author: "MakkaPakka",
  site: "https://ani.gamer.com.tw",
  detailCacheDuration: 3600,
  globalParams: [
    {
      name: "cookie",
      title: "巴哈登入 Cookie（選填）",
      type: "input",
      value: "",
      description: "貼上 ani.gamer.com.tw 的登入 Cookie 可解鎖 720P；不填只能看 360P。請勿分享此 Cookie"
    }
  ],
  modules: [
    {
      id: "loadRecent",
      title: "最近更新",
      functionName: "loadRecent",
      description: "本季新番最新集數與人氣",
      cacheDuration: 1800,
      requiresWebView: false,
      params: [{ name: "page", title: "頁碼", type: "page", startPage: 1 }]
    },
    {
      id: "loadSeasonPopular",
      title: "本季熱門",
      functionName: "loadSeasonPopular",
      description: "本季作品人氣排序",
      cacheDuration: 1800,
      requiresWebView: false,
      params: [{ name: "page", title: "頁碼", type: "page", startPage: 1 }]
    },
    {
      id: "loadHot",
      title: "人氣動畫",
      functionName: "loadHot",
      description: "全站人氣排行",
      cacheDuration: 3600,
      requiresWebView: false,
      params: [{ name: "page", title: "頁碼", type: "page", startPage: 1 }]
    },
    {
      id: "loadNewAdded",
      title: "最新上架",
      functionName: "loadNewAdded",
      description: "最近上架與更新的作品",
      cacheDuration: 1800,
      requiresWebView: false,
      params: [{ name: "page", title: "頁碼", type: "page", startPage: 1 }]
    },
    {
      id: "loadThemes",
      title: "專題合集",
      functionName: "loadThemes",
      description: "站方編輯專題片單",
      cacheDuration: 3600,
      requiresWebView: false,
      params: [{ name: "page", title: "頁碼", type: "page", startPage: 1 }]
    },
    {
      id: "loadCatalog",
      title: "所有動畫",
      functionName: "loadCatalog",
      description: "全站目錄篩選（需台灣/香港網路）",
      cacheDuration: 3600,
      requiresWebView: false,
      params: [
        {
          name: "tag",
          title: "屬性",
          type: "enumeration",
          value: "全部",
          enumOptions: ["全部", "動作", "冒險", "奇幻", "異世界", "魔法", "超能力", "科幻", "機甲", "校園", "喜劇", "戀愛", "青春", "勵志", "溫馨", "悠閒", "料理", "親情", "感人", "運動", "競技", "偶像", "音樂", "職場", "推理", "懸疑", "時間穿越", "歷史", "戰爭", "血腥暴力", "靈異神怪", "黑暗", "特攝", "BL", "GL"].map(value => ({ title: value, value }))
        },
        {
          name: "category",
          title: "類型",
          type: "enumeration",
          value: "全部",
          enumOptions: ["全部", "電影", "OVA", "雙語", "泡麵番", "真人演出"].map(value => ({ title: value, value }))
        },
        {
          name: "target",
          title: "對象",
          type: "enumeration",
          value: "全部",
          enumOptions: ["全部", "闔家觀賞", "付費會員", "年齡限制"].map(value => ({ title: value, value }))
        },
        {
          name: "sort",
          title: "排序",
          type: "enumeration",
          value: "1",
          enumOptions: [
            { title: "依年份排列", value: "1" },
            { title: "依月人氣排序", value: "2" }
          ]
        },
        { name: "page", title: "頁碼", type: "page", startPage: 1 }
      ]
    },
    {
      id: "loadResource",
      title: "動畫瘋播放源",
      description: "起播時解鎖並取得動畫瘋 HLS；需台灣/香港網路，首次解鎖約需 30 秒",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜尋動畫瘋",
    functionName: "searchAnime",
    params: [
      { name: "keyword", title: "關鍵詞", type: "input", value: "" },
      { name: "page", title: "頁碼", type: "page", value: "1" }
    ]
  }
};

const SITE_ORIGIN = "https://ani.gamer.com.tw";
const API_ORIGIN = "https://api.gamer.com.tw";
const AD_JS_URL = "https://i2.bahamut.com.tw/JS/ad/animeVideo2.js";
const FALLBACK_AD_SID = "286610";
const AD_WAIT_MS = 25000;
const SRC_RETRIES = 5;
const DEVICE_TTL_MS = 5 * 60 * 60 * 1000;
const PLAYBACK_TTL_MS = 50 * 60 * 1000;
const PAGE_SIZE = 24;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SITE_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
  Referer: `${SITE_ORIGIN}/`
};
const HTML_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
};

function payload(response) {
  const data = response && response.data !== undefined ? response.data : response;
  if (typeof data === "string") {
    try { return JSON.parse(data); } catch (error) { return data; }
  }
  return data;
}

function headerValue(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== target) continue;
    const value = headers[key];
    return Array.isArray(value) ? value.join(", ") : String(value || "");
  }
  return "";
}

async function api(path, headers) {
  const response = await Widget.http.get(`${API_ORIGIN}${path}`, {
    headers: { ...SITE_HEADERS, ...(headers || {}) }
  });
  return payload(response);
}

function anigamerLink(animeSn) {
  return `anigamer:anime:${animeSn}`;
}

function episodeLink(animeSn, videoSn) {
  return `anigamer:episode:${animeSn}:${videoSn}`;
}

function parseOwnedLink(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^anigamer:anime:(\d+)$/);
  if (match) return { animeSn: Number(match[1]), videoSn: 0 };
  match = raw.match(/^anigamer:episode:(\d+):(\d+)$/);
  if (match) return { animeSn: Number(match[1]), videoSn: Number(match[2]) };
  match = raw.match(/^https:\/\/ani\.gamer\.com\.tw\/animeVideo\.php\?sn=(\d+)(?:[&#].*)?$/);
  if (match) return { animeSn: 0, videoSn: Number(match[1]) };
  return null;
}

function cleanTitle(value) {
  return String(value || "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}

function normalizeDate(value) {
  const match = String(value || "").match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTags(item) {
  if (Array.isArray(item && item.tags)) return item.tags.filter(Boolean);
  if (Array.isArray(item && item.category)) return item.category.filter(Boolean);
  return [];
}

function catalogItem(raw) {
  const animeSn = Number(raw && (raw.animeSn || raw.anime_sn));
  if (!animeSn) return null;
  const total = Number(raw.totalEpisode || raw.total_episode || 0);
  const landscape = String(raw.cover || "");
  const portrait = String(raw.acgCover || raw.acg_cover || raw.cover || "");
  const info = String(raw.info || "");
  const tags = parseTags(raw);
  return {
    id: anigamerLink(animeSn),
    type: "url",
    title: cleanTitle(raw.title),
    posterPath: portrait,
    backdropPath: landscape && landscape !== portrait ? landscape : "",
    description: [info, tags.join(" · ")].filter(Boolean).join(" | "),
    releaseDate: normalizeDate(raw.seasonStart || raw.season_start || raw.upTime),
    rating: Number(raw.score) > 0 ? String(raw.score) : undefined,
    mediaType: total === 1 ? "movie" : "tv",
    genreTitle: tags.join(" · "),
    link: anigamerLink(animeSn)
  };
}

function uniqueItems(entries) {
  const seen = new Set();
  const items = [];
  for (const entry of entries) {
    const item = catalogItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

function pageSlice(items, page) {
  const current = Math.max(1, Number(page) || 1);
  return items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
}

async function indexData() {
  const body = await api("/anime/v1/index.php");
  const data = body && body.data;
  if (!data) throw new Error("動畫瘋首頁資料解析失敗");
  return data;
}

function listFromIndex(data, pick) {
  const list = pick(data);
  if (!Array.isArray(list) || !list.length) throw new Error("動畫瘋列表為空");
  return pageSlice(uniqueItems(list), arguments[2]);
}

loadRecent = async function loadRecent(params = {}) {
  try {
    const data = await indexData();
    const list = data.newAnime && data.newAnime.date;
    if (!Array.isArray(list) || !list.length) throw new Error("動畫瘋最近更新為空");
    return pageSlice(uniqueItems(list), params.page);
  } catch (error) {
    console.error("[loadRecent] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

loadSeasonPopular = async function loadSeasonPopular(params = {}) {
  try {
    const data = await indexData();
    const list = data.newAnime && data.newAnime.popular;
    if (!Array.isArray(list) || !list.length) throw new Error("動畫瘋本季熱門為空");
    return pageSlice(uniqueItems(list), params.page);
  } catch (error) {
    console.error("[loadSeasonPopular] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

loadHot = async function loadHot(params = {}) {
  try {
    const data = await indexData();
    const list = data.hotAnime;
    if (!Array.isArray(list) || !list.length) throw new Error("動畫瘋人氣列表為空");
    return pageSlice(uniqueItems(list), params.page);
  } catch (error) {
    console.error("[loadHot] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

loadNewAdded = async function loadNewAdded(params = {}) {
  try {
    const data = await indexData();
    const list = data.newAdded;
    if (!Array.isArray(list) || !list.length) throw new Error("動畫瘋最新上架為空");
    return pageSlice(uniqueItems(list), params.page);
  } catch (error) {
    console.error("[loadNewAdded] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

loadThemes = async function loadThemes(params = {}) {
  try {
    const data = await indexData();
    const sections = Array.isArray(data.category) ? data.category : [];
    const entries = [];
    for (const section of sections) {
      for (const raw of section.list || []) {
        entries.push({ ...raw, info: [section.title, raw.info].filter(Boolean).join(" | ") });
      }
    }
    if (!entries.length) throw new Error("動畫瘋專題為空");
    return pageSlice(uniqueItems(entries), params.page);
  } catch (error) {
    console.error("[loadThemes] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

loadCatalog = async function loadCatalog(params = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const tag = String(params.tag || "全部");
  const category = String(params.category || "全部");
  const target = String(params.target || "全部");
  const sort = String(params.sort) === "2" ? "2" : "1";
  const url = `${SITE_ORIGIN}/animeList.php?page=${page}` +
    `&tags=${encodeURIComponent(tag)}` +
    `&category=${encodeURIComponent(category)}` +
    `&target=${encodeURIComponent(target)}` +
    `&sort=${sort}`;
  try {
    const response = await Widget.http.get(url, { headers: HTML_HEADERS });
    const html = response && response.data !== undefined ? response.data : response;
    if (typeof html !== "string" || !html) throw new Error("動畫瘋目錄沒有返回內容（需台灣/香港網路）");
    if (!html.includes("theme-list-main")) {
      throw new Error("動畫瘋目錄被阻擋，請確認目前是台灣/香港網路");
    }
    const $ = Widget.html.load(html);
    const items = [];
    $("a.theme-list-main").each((index, element) => {
      const $card = $(element);
      const onclick = String($card.find("[onclick*='toggleGather']").attr("onclick") || "");
      const own = onclick.match(/toggleGather\(\s*\d+\s*,\s*(\d+)/);
      const animeSn = own ? Number(own[1]) : 0;
      if (!animeSn) return;
      const title = $card.find(".theme-name").first().text().trim();
      if (!title) return;
      const cover = String($card.find("img.theme-img").attr("data-src") || "");
      const year = $card.find(".theme-time").first().text().trim();
      const episodes = $card.find(".theme-number").first().text().trim();
      const views = $card.find(".show-view-number p").first().text().trim();
      items.push({
        id: anigamerLink(animeSn),
        type: "url",
        title: cleanTitle(title),
        posterPath: cover,
        description: [year, episodes, views ? `${views} 觀看` : ""].filter(Boolean).join(" | "),
        releaseDate: normalizeDate(year),
        mediaType: /共\s*1\s*集/.test(episodes) ? "movie" : "tv",
        link: anigamerLink(animeSn)
      });
    });
    if (!items.length) throw new Error("動畫瘋目錄沒有可解析的作品");
    return items;
  } catch (error) {
    console.error("[loadCatalog] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

searchAnime = async function searchAnime(params = {}) {
  const keyword = String(params.keyword || "").trim();
  if (!keyword) return loadRecent({ page: params.page });
  try {
    const body = await api(`/anime/v1/search.php?kw=${encodeURIComponent(keyword)}&recordKeyword=0`);
    const list = body && body.data && body.data.animeList;
    if (!Array.isArray(list)) throw new Error("動畫瘋搜尋結果解析失敗");
    const items = uniqueItems(list.map(entry => ({
      ...entry,
      cover: entry.cover,
      info: entry.dateInfo
    })));
    return pageSlice(items, params.page);
  } catch (error) {
    console.error("[searchAnime] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

async function fetchVideoInfo(animeSn, videoSn) {
  const query = animeSn ? `animeSn=${animeSn}` : `videoSn=${videoSn}`;
  const body = await api(`/anime/v1/video.php?${query}`);
  const data = body && body.data;
  if (!data || !data.anime) throw new Error("動畫瘋詳情解析失敗");
  return data;
}

const VOLUME_NAMES = ["本篇", "電影", "特別篇", "中文配音", "中文電影", "中文特別篇", "粵語配音", "粵語電影", "粵語特別篇", "台語配音", "台語電影", "台語特別篇"];

function episodeItems(data) {
  const anime = data.anime || {};
  const groups = anime.episodes && typeof anime.episodes === "object" ? anime.episodes : {};
  const keys = Object.keys(groups).filter(key => Array.isArray(groups[key]) && groups[key].length).sort((left, right) => Number(left) - Number(right));
  const seen = new Set();
  const counter = new Map();
  const results = [];
  for (const key of keys) {
    const volumeName = VOLUME_NAMES[Number(key)] || "";
    for (const episode of groups[key]) {
      const videoSn = Number(episode.videoSn || episode.video_sn);
      if (!videoSn || seen.has(videoSn)) continue;
      seen.add(videoSn);
      const number = Number(episode.episode) || results.length + 1;
      const duplicate = counter.get(number) || 0;
      counter.set(number, duplicate + 1);
      const suffix = duplicate > 0 ? `（${volumeName || `版本${duplicate + 1}`}）` : "";
      results.push({
        id: episodeLink(anime.animeSn, videoSn),
        type: "url",
        title: `第 ${number} 集${suffix}`,
        link: episodeLink(anime.animeSn, videoSn),
        episode: number,
        mediaType: "tv",
        coverUrl: String(episode.cover || ""),
        backdropPath: String(episode.cover || "")
      });
    }
  }
  return results;
}

function relatedItems(data) {
  const list = Array.isArray(data.relatedAnime) ? data.relatedAnime : [];
  return uniqueItems(list);
}

loadDetail = async function loadDetail(link) {
  const owned = parseOwnedLink(link);
  if (!owned || (!owned.animeSn && !owned.videoSn)) return null;
  try {
    const data = await fetchVideoInfo(owned.animeSn, owned.videoSn);
    const anime = data.anime || {};
    const video = data.video || {};
    const animeSn = Number(anime.animeSn);
    if (!animeSn) return null;
    if (owned.animeSn && animeSn !== owned.animeSn) return null;
    const detailLink = anigamerLink(animeSn);
    const episodes = episodeItems(data);
    const tags = Array.isArray(anime.tags) ? anime.tags : [];
    const total = Number(anime.totalEpisode || 0);
    const item = {
      id: detailLink,
      type: "url",
      title: cleanTitle(anime.title),
      link: detailLink,
      posterPath: String(anime.cover || ""),
      backdropPath: String(video.cover || ""),
      description: stripHtml(anime.contentHtml || anime.content || ""),
      releaseDate: normalizeDate(anime.seasonStart),
      rating: Number(anime.score) > 0 ? String(anime.score) : undefined,
      mediaType: total === 1 ? "movie" : "tv",
      genreTitle: tags.join(" · "),
      episodeItems: episodes,
      relatedItems: relatedItems(data),
      backdropPaths: episodes.map(episode => episode.coverUrl).filter(Boolean).slice(0, 8)
    };
    if (owned.videoSn) {
      const selected = episodes.find(episode => episode.id === episodeLink(animeSn, owned.videoSn));
      if (selected) {
        item.title = `${cleanTitle(anime.title)} · ${selected.title}`;
        item.episode = selected.episode;
        item.coverUrl = selected.coverUrl;
      }
    }
    return item;
  } catch (error) {
    console.error("[loadDetail] 失敗:", error && error.message ? error.message : error);
    throw error;
  }
};

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function userCookie(value) {
  const raw = String(value || "").trim().replace(/^cookie\s*:\s*/i, "");
  if (!raw || raw.length > 8192 || /[\r\n]/.test(raw)) return "";
  return raw;
}

function cookieTag(cookie) {
  if (!cookie) return "guest";
  let hash = 0;
  for (let index = 0; index < cookie.length; index += 1) {
    hash = (hash * 31 + cookie.charCodeAt(index)) | 0;
  }
  return `u${(hash >>> 0).toString(36)}`;
}

async function cacheGet(key) {
  try {
    if (!Widget.storage || typeof Widget.storage.get !== "function") return null;
    const raw = await Widget.storage.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

async function cacheSet(key, value) {
  try {
    if (!Widget.storage || typeof Widget.storage.set !== "function") return;
    await Widget.storage.set(key, JSON.stringify(value));
  } catch (error) {}
}

async function cacheRemove(key) {
  try {
    if (Widget.storage && typeof Widget.storage.remove === "function") await Widget.storage.remove(key);
  } catch (error) {}
}

function cookiesFrom(response) {
  const header = headerValue(response && response.headers, "set-cookie");
  if (!header) return "";
  const jar = new Map();
  const pattern = /(?:^|,\s*)([A-Za-z_][A-Za-z0-9_]*)=([^;,\s]+)/g;
  let match;
  while ((match = pattern.exec(header)) !== null) jar.set(match[1], match[2]);
  const pairs = [];
  if (jar.get("nologinuser")) pairs.push(`nologinuser=${jar.get("nologinuser")}`);
  if (jar.get("ANIME_SIGN")) pairs.push(`ANIME_SIGN=${jar.get("ANIME_SIGN")}`);
  return pairs.join("; ");
}

function cookiePairs(value) {
  const pairs = new Map();
  for (const part of String(value || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || /[\r\n]/.test(name)) continue;
    pairs.set(name, part.slice(index + 1).trim());
  }
  return pairs;
}

// 帳號 Cookie 提供登入憑證；nologinuser / ANIME_SIGN 必須用本次裝置驗證新簽發的那對，
// 舊的 ANIME_SIGN 與新的 nologinuser 不配對會讓 video_src 回 1007。
const DEVICE_KEYS = ["nologinuser", "ANIME_SIGN"];

function mergeCookies(accountCookie, issuedCookie) {
  const merged = cookiePairs(accountCookie);
  const issued = cookiePairs(issuedCookie);
  for (const [name, value] of issued) {
    if (DEVICE_KEYS.includes(name) || !merged.has(name)) merged.set(name, value);
  }
  return [...merged].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function getDevice(force, accountCookie) {
  const key = `anigamer:device:${cookieTag(accountCookie)}`;
  if (!force) {
    const cached = await cacheGet(key);
    if (cached && cached.device && cached.cookie && Date.now() - cached.ts < DEVICE_TTL_MS) return cached;
  }
  const response = await Widget.http.get(`${SITE_ORIGIN}/ajax/getdeviceid.php`, {
    headers: accountCookie ? { ...SITE_HEADERS, Cookie: accountCookie } : SITE_HEADERS
  });
  const body = payload(response);
  const device = body && body.deviceid ? String(body.deviceid) : "";
  const issued = cookiesFrom(response);
  if (!device || !issued) {
    throw new Error("動畫瘋裝置驗證失敗，請確認目前是台灣/香港網路");
  }
  const record = { device, cookie: mergeCookies(accountCookie, issued), ts: Date.now() };
  await cacheSet(key, record);
  return record;
}

async function adSid() {
  try {
    const response = await Widget.http.get(AD_JS_URL, { headers: SITE_HEADERS });
    const text = payload(response);
    const match = typeof text === "string" ? text.match(/\["\d+","[^"]*","(\d+)","video"\]/) : null;
    if (match) return match[1];
  } catch (error) {}
  return FALLBACK_AD_SID;
}

function resolveVariant(masterUrl, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { return new URL(raw, masterUrl).toString(); } catch (error) { return ""; }
}

function parseVariants(master, masterUrl) {
  const lines = String(master || "").split(/\r?\n/);
  const variants = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    let uri = "";
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next].trim();
      if (!candidate) continue;
      if (!candidate.startsWith("#")) uri = candidate;
      break;
    }
    if (!uri) continue;
    const url = resolveVariant(masterUrl, uri);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const heightMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
    variants.push({ url, height: heightMatch ? Number(heightMatch[1]) : 0 });
  }
  return variants.sort((left, right) => right.height - left.height);
}

function streamHeaders() {
  return { Origin: SITE_ORIGIN, Referer: `${SITE_ORIGIN}/`, "User-Agent": UA };
}

async function unlockPlaylist(videoSn, accountCookie, retried) {
  const device = await getDevice(false, accountCookie);
  const sid = await adSid();
  const query = `s=${encodeURIComponent(sid)}&sn=${videoSn}`;
  const headers = { ...SITE_HEADERS, Cookie: device.cookie };

  await Widget.http.get(`${SITE_ORIGIN}/ajax/videoCastcishu.php?${query}`, { headers });
  await sleep(AD_WAIT_MS);
  await Widget.http.get(`${SITE_ORIGIN}/ajax/videoCastcishu.php?${query}&ad=end`, { headers });

  let lastBody = null;
  for (let attempt = 0; attempt <= SRC_RETRIES; attempt += 1) {
    const response = await Widget.http.get(
      `${API_ORIGIN}/anime/v1/video_src.php?videoSn=${videoSn}&deviceid=${encodeURIComponent(device.device)}&deviceTypeUseCases=1`,
      { headers }
    );
    lastBody = payload(response);
    const playlist = lastBody && lastBody.data && lastBody.data.srcUseCases && lastBody.data.srcUseCases[0] &&
      lastBody.data.srcUseCases[0].src && lastBody.data.srcUseCases[0].src.playlist;
    if (playlist) return String(playlist);
    const code = lastBody && lastBody.error && Number(lastBody.error.code);
    if (code === 1007 && !retried) {
      await cacheRemove(`anigamer:device:${cookieTag(accountCookie)}`);
      return unlockPlaylist(videoSn, accountCookie, true);
    }
    if (code === 1011) throw new Error("此作品因授權限制無法播放");
    if (code === 1014) throw new Error("此作品需要付費會員");
    await sleep(2000);
  }
  const code = lastBody && lastBody.error && Number(lastBody.error.code);
  if (code === 1015) throw new Error("動畫瘋解鎖逾時，請稍後重試");
  throw new Error("動畫瘋沒有返回播放位址");
}

async function playbackSources(videoSn, accountCookie) {
  const cacheKey = `anigamer:play:${cookieTag(accountCookie)}:${videoSn}`;
  const cached = await cacheGet(cacheKey);
  if (cached && Array.isArray(cached.sources) && cached.sources.length && Date.now() - cached.ts < PLAYBACK_TTL_MS) {
    return cached.sources;
  }
  const label = accountCookie ? "已登入" : "訪客 360P";
  const masterUrl = await unlockPlaylist(videoSn, accountCookie, false);
  let sources = [];
  try {
    const response = await Widget.http.get(masterUrl, { headers: streamHeaders() });
    const master = response && response.data !== undefined ? String(response.data) : "";
    const variants = master.includes("#EXTM3U") ? parseVariants(master, masterUrl) : [];
    sources = variants.map(variant => ({
      name: variant.height ? `動畫瘋 ${variant.height}P` : "動畫瘋",
      description: `巴哈姆特動畫瘋 | ${variant.height ? `${variant.height}P` : "自動"} | ${label} | 需台灣/香港網路`,
      url: variant.url,
      customHeaders: streamHeaders(),
      playerType: "app"
    }));
  } catch (error) {
    console.error("[playbackSources] 解析清晰度失敗:", error && error.message ? error.message : error);
  }
  if (!sources.length) {
    sources = [{
      name: "動畫瘋",
      description: `巴哈姆特動畫瘋 | 自動 | ${label} | 需台灣/香港網路`,
      url: masterUrl,
      customHeaders: streamHeaders(),
      playerType: "app"
    }];
  }
  await cacheSet(cacheKey, { sources, ts: Date.now() });
  return sources;
}

async function resolveVideoSn(params) {
  const raw = params.link != null ? params.link : params.id;
  const owned = parseOwnedLink(raw);
  if (!owned) return 0;
  if (owned.videoSn) return owned.videoSn;
  const data = await fetchVideoInfo(owned.animeSn, 0);
  const episodes = episodeItems(data);
  if (!episodes.length) return 0;
  const wanted = Number(params.episode);
  if (wanted) {
    const matched = episodes.find(episode => episode.episode === wanted);
    if (matched) return Number(String(matched.id).split(":").pop());
  }
  return Number(String(episodes[0].id).split(":").pop());
}

loadResource = async function loadResource(params = {}) {
  try {
    const videoSn = await resolveVideoSn(params);
    if (!videoSn) return [];
    return await playbackSources(videoSn, userCookie(params && params.cookie));
  } catch (error) {
    console.error("[loadResource] 失敗:", error && error.message ? error.message : error);
    return [];
  }
};
