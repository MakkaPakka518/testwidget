WidgetMetadata = {
  id: "makka.flixpatrol.top10",
  title: "FlixPatrol 全球榜",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "各国家和地区的 Netflix、Disney+、Apple TV、Prime、HBO 等平台最新日榜",
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
          description: "可输入 List 索引中的任意国家 slug",
          placeholders: [
            { title: "全球", value: "world" },
            { title: "美国", value: "united-states" },
            { title: "英国", value: "united-kingdom" },
            { title: "加拿大", value: "canada" },
            { title: "澳大利亚", value: "australia" },
            { title: "香港", value: "hong-kong" },
            { title: "台湾", value: "taiwan" },
            { title: "日本", value: "japan" },
            { title: "韩国", value: "south-korea" },
            { title: "新加坡", value: "singapore" },
            { title: "马来西亚", value: "malaysia" },
            { title: "泰国", value: "thailand" },
            { title: "印度", value: "india" },
            { title: "德国", value: "germany" },
            { title: "法国", value: "france" },
            { title: "西班牙", value: "spain" },
            { title: "意大利", value: "italy" },
            { title: "巴西", value: "brazil" },
            { title: "墨西哥", value: "mexico" },
            { title: "阿根廷", value: "argentina" },
            { title: "阿联酋", value: "united-arab-emirates" },
            { title: "南非", value: "south-africa" }
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
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    }
  ]
};

const DEFAULT_BASE = "https://raw.githubusercontent.com/MakkaPakka518/List/main/data/flixpatrol";
const SOURCE_ORIGIN = "https://flixpatrol.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (ForwardWidget FlixPatrol)", Accept: "application/json" };
const TMDB_CACHE = {};
const DETAIL_CACHE = {};

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

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function itemYear(item) {
  const match = String(item && item.sourcePath || "").match(/-(19\d{2}|20\d{2})\/$/);
  return match ? match[1] : "";
}

function sourceUrl(item) {
  const path = String(item && item.sourcePath || "");
  return /^\/title\/[a-z0-9][a-z0-9-%]*\/$/.test(path) ? SOURCE_ORIGIN + path : "";
}

function mediaTypeFor(item, category) {
  if (item && (item.mediaType === "movie" || item.mediaType === "tv")) return item.mediaType;
  if (category === "movies" || category === "kids_movies") return "movie";
  if (category === "tv" || category === "kids_tv") return "tv";
  return "";
}

function candidateTitle(candidate) {
  return candidate.title || candidate.name || candidate.original_title || candidate.original_name || "";
}

async function findTmdb(item, category) {
  const expectedType = mediaTypeFor(item, category);
  const key = `${expectedType || "multi"}:${normalizeTitle(item.title)}:${itemYear(item)}`;
  if (Object.prototype.hasOwnProperty.call(TMDB_CACHE, key)) return TMDB_CACHE[key];
  const endpoint = expectedType ? `search/${expectedType}` : "search/multi";
  const response = await Widget.tmdb.get(endpoint, { params: { query: item.title, language: "zh-CN", include_adult: false } });
  const target = normalizeTitle(item.title);
  const year = itemYear(item);
  let best = null;
  let bestScore = -1;
  for (const candidate of response && response.results || []) {
    const mediaType = expectedType || candidate.media_type;
    if (!candidate.id || !["movie", "tv"].includes(mediaType) || normalizeTitle(candidateTitle(candidate)) !== target) continue;
    const releaseDate = candidate.release_date || candidate.first_air_date || "";
    const score = (year && releaseDate.startsWith(year) ? 1000 : 0) + Number(candidate.popularity || 0);
    if (score > bestScore) {
      best = { ...candidate, media_type: mediaType };
      bestScore = score;
    }
  }
  TMDB_CACHE[key] = best;
  return best;
}

function chartTitle(category) {
  return ({ movies: "电影", tv: "剧集", overall: "综合", kids_movies: "儿童电影", kids_tv: "儿童剧集", amazon_channels: "Amazon Channels" })[category] || category;
}

function chartItems(platform, category) {
  const charts = platform && platform.charts || {};
  if (category === "all") {
    return [...(charts.movies || []).map((item) => ({ item, category: "movies" })), ...(charts.tv || []).map((item) => ({ item, category: "tv" }))];
  }
  return (charts[category] || []).map((item) => ({ item, category }));
}

async function toVideo(entry, platformName, countryName, chartDate) {
  const item = entry.item;
  const detail = [
    `#${item.rank}`,
    platformName,
    chartTitle(entry.category),
    countryName,
    chartDate,
    item.movement ? `变化 ${item.movement}` : "",
    item.days ? `在榜 ${item.days}` : ""
  ].filter(Boolean).join(" · ");
  const tmdb = await findTmdb(item, entry.category);
  if (tmdb) {
    return {
      id: Number(tmdb.id),
      type: "tmdb",
      mediaType: tmdb.media_type,
      title: item.title,
      posterPath: tmdb.poster_path || undefined,
      backdropPath: tmdb.backdrop_path || undefined,
      releaseDate: tmdb.release_date || tmdb.first_air_date || undefined,
      rating: tmdb.vote_average,
      description: detail
    };
  }

  const link = sourceUrl(item);
  if (!link) return null;
  const fallback = { id: link, type: "url", title: item.title, description: `${detail} · 未匹配到 TMDB`, link };
  const mediaType = mediaTypeFor(item, entry.category);
  if (mediaType) fallback.mediaType = mediaType;
  DETAIL_CACHE[link] = fallback;
  return fallback;
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
        entries.push(...chartItems(platform, category).map((entry) => ({ ...entry, platformName: platform.name || slug })));
      }
    } else {
      const platform = body.platforms[platformSlug];
      if (!platform) return [];
      entries = chartItems(platform, category).map((entry) => ({ ...entry, platformName: platform.name || platformSlug }));
    }

    entries = entries.slice(0, clampCount(params.count));
    const countryName = body.country && body.country.name || country;
    const videos = await Promise.all(entries.map((entry) => toVideo(entry, entry.platformName, countryName, body.chartDate || "")));
    return videos.filter(Boolean);
  } catch (error) {
    console.error("[loadFlixPatrol] 失败:", error.message || error);
    throw error;
  }
};

loadDetail = async function loadDetail(link) {
  const value = String(link || "").trim();
  if (!/^https:\/\/flixpatrol\.com\/title\/[a-z0-9][a-z0-9-%]*\/$/.test(value)) return null;
  if (DETAIL_CACHE[value]) return DETAIL_CACHE[value];
  const slug = value.match(/\/title\/([^/]+)\//)[1].replace(/-19\d{2}$|-20\d{2}$/, "");
  return { id: value, type: "url", title: slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "), description: "FlixPatrol 榜单条目；未匹配到 TMDB。", link: value };
};
