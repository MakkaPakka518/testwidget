WidgetMetadata = {
  id: "makka.flixpatrol.top10",
  title: "FlixPatrol 全球榜",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  description: "全球主要国家和地区的 Netflix、Disney+、Apple TV、Prime、HBO 等平台最新日榜",
  author: "MakkaPakka",
  site: "https://flixpatrol.com/top10/",
  detailCacheDuration: 3600,
  globalParams: [
    {
      name: "baseUrl",
      title: "榜单数据地址",
      type: "input",
      placeholders: [{ title: "MakkaPakka518/List", value: "https://raw.githubusercontent.com/MakkaPakka518/List/main/data/flixpatrol" }]
    }
  ],
  modules: [
    {
      id: "loadFlixPatrol",
      title: "全球流媒体 TOP 10",
      functionName: "loadFlixPatrol",
      cacheDuration: 3600,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "country",
          title: "国家/地区",
          type: "input",
          value: "united-states",
          description: "可输入 List 索引中的主流国家/地区 slug",
          placeholders: [
            { title: "全球", value: "world" },
            { title: "美国", value: "united-states" },
            { title: "台湾", value: "taiwan" },
            { title: "香港", value: "hong-kong" },
            { title: "日本", value: "japan" },
            { title: "韩国", value: "south-korea" },
            { title: "新加坡", value: "singapore" },
          ]
        },
        {
          name: "platform",
          title: "平台",
          type: "enumeration",
          value: "netflix",
          enumOptions: [
            { title: "全部平台", value: "all" },
            { title: "Netflix", value: "netflix" },
            { title: "Disney+", value: "disney" },
            { title: "Apple TV", value: "apple-tv" },
            { title: "Amazon Prime", value: "amazon-prime" },
            { title: "HBO Max", value: "hbo-max" },
            { title: "Paramount+", value: "paramount-plus" },
            { title: "Hulu", value: "hulu" },
            { title: "Peacock", value: "peacock" },
            { title: "Apple TV Store", value: "itunes" },
            { title: "Amazon", value: "amazon" },
            { title: "Google", value: "google" },
            { title: "Crunchyroll", value: "crunchyroll" },
            { title: "自定义平台 slug", value: "custom" }
          ]
        },
        {
          name: "platformSlug",
          title: "平台 slug",
          type: "input",
          value: "",
          belongTo: { paramName: "platform", value: ["custom"] }
        },
        {
          name: "category",
          title: "榜单",
          type: "enumeration",
          value: "all",
          enumOptions: [
            { title: "电影 + 剧集", value: "all" },
            { title: "电影 TOP 10", value: "movies" },
            { title: "剧集 TOP 10", value: "tv" },
            { title: "综合 TOP 10", value: "overall" },
            { title: "儿童电影", value: "kids_movies" },
            { title: "儿童剧集", value: "kids_tv" },
            { title: "Amazon Channels", value: "amazon_channels" }
          ]
        },
        { name: "count", title: "数量", type: "count", value: "20" },
        { name: "language", title: "语言", type: "language", value: "zh-CN" }
      ]
    }
  ]
};

const DEFAULT_BASE = "https://raw.githubusercontent.com/MakkaPakka518/List/main/data/flixpatrol";
const HEADERS = { "User-Agent": "Mozilla/5.0 (ForwardWidget FlixPatrol)", Accept: "application/json" };

function getBody(response) {
  let body = response && response.data !== undefined ? response.data : response;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { return null; }
  }
  return body && typeof body === "object" ? body : null;
}

function dataBase(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+$/.test(raw) ? raw : DEFAULT_BASE;
}

function safeSlug(value, fallback) {
  const slug = String(value || fallback || "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function clampCount(value) {
  const count = Number(value || 20);
  return Number.isFinite(count) ? Math.min(40, Math.max(1, Math.floor(count))) : 20;
}

function mediaTypeFor(item, category) {
  if (item && (item.mediaType === "movie" || item.mediaType === "tv")) return item.mediaType;
  if (category === "movies" || category === "kids_movies") return "movie";
  if (category === "tv" || category === "kids_tv") return "tv";
  return "";
}

function chartItems(platform, category) {
  const charts = platform && platform.charts || {};
  if (category === "all") {
    return [...(charts.movies || []).map((item) => ({ item, category: "movies" })), ...(charts.tv || []).map((item) => ({ item, category: "tv" }))];
  }
  return (charts[category] || []).map((item) => ({ item, category }));
}

function toIdentity(entry) {
  const item = entry.item;
  const mediaType = mediaTypeFor(item, entry.category);
  const tmdbId = Number(item && item.tmdbId);
  if (!tmdbId || !["movie", "tv"].includes(mediaType)) return null;
  return { id: `${mediaType}.${tmdbId}`, type: "tmdb" };
}

loadFlixPatrol = async function loadFlixPatrol(params = {}) {
  try {
    const country = safeSlug(params.country, "united-states");
    let platformSlug = params.platform === "custom" ? safeSlug(params.platformSlug) : safeSlug(params.platform, "netflix");
    if (!country || (!platformSlug && params.platform !== "all")) return [];
    const response = await Widget.http.get(`${dataBase(params.baseUrl)}/${country}.json`, { headers: HEADERS });
    const body = getBody(response);
    if (!body || body.schemaVersion !== 1 || !body.platforms) throw new Error("榜单 JSON 格式不正确");

    const category = ["all", "movies", "tv", "overall", "kids_movies", "kids_tv", "amazon_channels"].includes(params.category) ? params.category : "all";
    let entries = [];
    if (params.platform === "all") {
      for (const slug of Object.keys(body.platforms)) {
        const platform = body.platforms[slug];
        entries.push(...chartItems(platform, category));
      }
    } else {
      const platform = body.platforms[platformSlug];
      if (!platform) return [];
      entries = chartItems(platform, category);
    }

    const identities = entries.map(toIdentity).filter(Boolean);
    const seen = new Set();
    return identities.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, clampCount(params.count));
  } catch (error) {
    console.error("[loadFlixPatrol] 失败:", error.message || error);
    throw error;
  }
};
