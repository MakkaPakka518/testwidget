WidgetMetadata = {
  id: "makka.linetv.catalog",
  title: "LINE TV 热门榜",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "直接读取 LINE TV 公开目录：10 大热门、最新跟播、戏剧、动画与综艺",
  author: "MakkaPakka",
  site: "https://www.linetv.tw",
  detailCacheDuration: 3600,
  modules: [
    {
      id: "loadLineTv",
      title: "LINE TV 榜单",
      functionName: "loadLineTv",
      cacheDuration: 3600,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "source",
          title: "榜单",
          type: "enumeration",
          value: "top10",
          enumOptions: [
            { title: "10 大热门节目", value: "top10" },
            { title: "最新跟播", value: "schedule" },
            { title: "戏剧", value: "drama" },
            { title: "动画", value: "anime" },
            { title: "综艺", value: "variety" }
          ]
        },
        {
          name: "scheduleType",
          title: "跟播分类",
          type: "enumeration",
          value: "all",
          belongTo: { paramName: "source", value: ["schedule"] },
          enumOptions: [
            { title: "全部", value: "all" },
            { title: "戏剧", value: "戲劇" },
            { title: "动画", value: "動畫" },
            { title: "综艺", value: "綜藝" }
          ]
        },
        { name: "page", title: "页码", type: "page", startPage: 1 },
        { name: "language", title: "语言", type: "language", value: "zh-CN" }
      ]
    }
  ]
};

const API_ORIGIN = "https://api.linetv.tw/v1/cms";
const API_PARAMS = "appId=062097f1b1f34e11e7f82aag22000aee&chocomemberAppId=86a6b258-ac30-4816-bc14-a31e514226d7&version=11.2.0&countryCode=TW&languageId=zh";
const HEADERS = { "User-Agent": "Mozilla/5.0 (ForwardWidget LINE TV)", Accept: "application/json", Referer: "https://www.linetv.tw/" };
const MEMORY_CACHE = {};

function bodyOf(response) {
  let body = response && response.data !== undefined ? response.data : response;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { return null; }
  }
  return body;
}

async function api(path) {
  const response = await Widget.http.get(`${API_ORIGIN}/${path}?${API_PARAMS}`, { headers: HEADERS });
  const body = bodyOf(response);
  if (!body) throw new Error(`LINE TV API 返回空数据：${path}`);
  return body;
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/第[一二三四五六七八九十百\d]+季/g, "")
    .replace(/(?:S|Season)\s*\d+/ig, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKey(value) {
  return cleanTitle(value).toLowerCase().replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, "");
}

async function cacheGet(key) {
  if (MEMORY_CACHE[key]) return MEMORY_CACHE[key];
  if (!Widget.storage || typeof Widget.storage.get !== "function") return null;
  try {
    const raw = await Widget.storage.get(key);
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && parsed.id && ["movie", "tv"].includes(parsed.mediaType)) {
      MEMORY_CACHE[key] = parsed;
      return parsed;
    }
  } catch (error) {}
  return null;
}

async function cacheSet(key, value) {
  MEMORY_CACHE[key] = value;
  if (!Widget.storage || typeof Widget.storage.set !== "function") return;
  try { await Widget.storage.set(key, JSON.stringify(value)); } catch (error) {}
}

function candidateName(candidate) {
  return candidate.name || candidate.title || candidate.original_name || candidate.original_title || "";
}

async function searchType(item, mediaType, withYear) {
  const params = { query: cleanTitle(item.name), language: "zh-TW", include_adult: false };
  if (withYear && item.year) params[mediaType === "movie" ? "year" : "first_air_date_year"] = item.year;
  const result = await Widget.tmdb.get(`search/${mediaType}`, { params });
  const target = titleKey(item.name);
  const candidates = result && result.results || [];
  const exact = candidates.filter(candidate => titleKey(candidateName(candidate)) === target);
  const matches = exact.length ? exact : candidates.filter(candidate => {
    const key = titleKey(candidateName(candidate));
    return target.length >= 4 && (target.includes(key) || key.includes(target));
  });
  if (!matches.length) return null;
  if (item.year) {
    const dated = matches.find(candidate => String(candidate.release_date || candidate.first_air_date || "").startsWith(String(item.year)));
    if (dated) return { id: dated.id, mediaType };
    if (withYear) return null;
  }
  return { id: matches[0].id, mediaType };
}

function likelyMovie(item, sectionTitle) {
  const channels = Array.isArray(item.channelName) ? item.channelName.join(" ") : "";
  return /電影|影片/.test(`${channels} ${sectionTitle || ""}`) || Number(item.totalEps) === 1;
}

async function resolveTmdb(item, sectionTitle) {
  const hint = likelyMovie(item, sectionTitle) ? "movie" : "tv";
  const cacheKey = `linetv:v1:${item.dramaId}:${item.year || ""}:${hint}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  for (const mediaType of hint === "movie" ? ["movie", "tv"] : ["tv", "movie"]) {
    let match = await searchType(item, mediaType, true);
    if (!match && item.year) match = await searchType(item, mediaType, false);
    if (match) {
      await cacheSet(cacheKey, match);
      return match;
    }
  }
  return null;
}

function uniqueSource(items) {
  const result = [];
  const seen = new Set();
  for (const entry of items) {
    const item = entry.item;
    if (!item || !item.dramaId || seen.has(item.dramaId)) continue;
    seen.add(item.dramaId);
    result.push(entry);
  }
  return result;
}

async function sourceItems(params) {
  const source = ["top10", "schedule", "drama", "anime", "variety"].includes(params.source) ? params.source : "top10";
  if (source === "top10") {
    const sections = await api("homepage");
    const section = sections.find(value => value && value.type === "top10");
    return (section && section.datas || []).map(item => ({ item, sectionTitle: section.title }));
  }
  if (source === "schedule") {
    const schedule = await api("release-schedule");
    const filter = ["戲劇", "動畫", "綜藝"].includes(params.scheduleType) ? params.scheduleType : "all";
    return (schedule.datas || []).filter(item => filter === "all" || (item.channelName || []).includes(filter)).map(item => ({ item, sectionTitle: schedule.title }));
  }
  const channelId = source === "drama" ? 1 : source === "anime" ? 2 : 3;
  const sections = await api(`channels/${channelId}`);
  const items = [];
  for (const section of sections) {
    if (!section || section.type !== "album") continue;
    for (const item of section.datas || []) items.push({ item, sectionTitle: section.title });
  }
  return uniqueSource(items);
}

loadLineTv = async function loadLineTv(params = {}) {
  try {
    const page = Math.max(1, Number(params.page) || 1);
    const entries = await sourceItems(params);
    const pageEntries = entries.slice((page - 1) * 24, page * 24);
    const resolved = [];
    for (let index = 0; index < pageEntries.length; index += 6) {
      const chunk = pageEntries.slice(index, index + 6);
      resolved.push(...await Promise.all(chunk.map(entry => resolveTmdb(entry.item, entry.sectionTitle))));
    }
    const seen = new Set();
    return resolved.filter(Boolean).map(item => ({ id: `${item.mediaType}.${item.id}`, type: "tmdb" })).filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  } catch (error) {
    console.error("[loadLineTv] 失败:", error.message || error);
    throw error;
  }
};
