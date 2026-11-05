WidgetMetadata = {
  id: "makka.linetv.catalog",
  title: "LINE TV",
  version: "2.0.0",
  requiredVersion: "0.0.1",
  description: "LINE TV 公开目录、详情、分集与动态播放源；支持 HLS 及 Widevine DASH",
  author: "MakkaPakka",
  site: "https://www.linetv.tw",
  detailCacheDuration: 900,
  modules: [
    {
      id: "loadLineTv",
      title: "LINE TV",
      functionName: "loadLineTv",
      cacheDuration: 900,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "source",
          title: "分类",
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
    },
    {
      id: "loadResource",
      title: "LINE TV 播放源",
      description: "起播时获取 LINE TV HLS 或 Widevine DASH 授权",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索 LINE TV",
    functionName: "searchLineTv",
    params: [
      { name: "keyword", title: "关键词", type: "input", value: "" },
      { name: "page", title: "页码", type: "page", value: "1" }
    ]
  }
};

const SITE_ORIGIN = "https://www.linetv.tw";
const CMS_ORIGIN = "https://api.linetv.tw/v1/cms";
const API_DEFAULTS = {
  appId: "062097f1b1f34e11e7f82aag22000aee",
  chocomemberAppId: "86a6b258-ac30-4816-bc14-a31e514226d7",
  version: "11.2.0",
  countryCode: "TW",
  languageId: "zh"
};
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: `${SITE_ORIGIN}/`
};

function bodyOf(response) {
  let body = response && response.data !== undefined ? response.data : response;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { return null; }
  }
  return body;
}

function queryString(params) {
  const values = { ...API_DEFAULTS, ...(params || {}) };
  return Object.keys(values)
    .filter(key => values[key] !== undefined && values[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(values[key]))}`)
    .join("&");
}

function withQuery(url, params) {
  const query = queryString(params);
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

async function getJson(url, options = {}) {
  const response = await Widget.http.get(url, { ...options, headers: { ...HEADERS, ...(options.headers || {}) } });
  const body = bodyOf(response);
  if (!body) throw new Error(`LINE TV 返回空数据：${url}`);
  return body;
}

async function cms(path, params) {
  return getJson(withQuery(`${CMS_ORIGIN}/${path}`, params));
}

function pageSlice(items, page, size = 24) {
  const current = Math.max(1, Number(page) || 1);
  return items.slice((current - 1) * size, current * size);
}

function labelText(item) {
  return (item.labels || []).map(label => label && label.title).filter(Boolean).join(" · ");
}

function dramaLink(dramaId) {
  return `linetv:drama:${dramaId}`;
}

function episodeLink(dramaId, episode) {
  return `linetv:episode:${dramaId}:${episode}`;
}

function catalogItem(item) {
  const dramaId = Number(item.dramaId || item.drama_id);
  if (!dramaId) return null;
  const title = item.name || item.drama_name || "LINE TV";
  const released = Number(item.releasedEpsCount || item.currentEps || item.current_eps) || 0;
  const total = Number(item.totalEps || item.total_eps) || 0;
  const description = [
    item.year,
    released ? `更新至 ${released} 集` : "",
    total ? `全 ${total} 集` : "",
    labelText(item)
  ].filter(Boolean).join(" · ");
  return {
    id: dramaLink(dramaId),
    type: "url",
    title,
    posterPath: item.verticalPosterUrl || item.vertical_poster || item.vertical_poster_url || "",
    backdropPath: item.posterUrl || item.poster_url || item.horizontal_poster_url || "",
    description: item.introduction || description,
    releaseDate: item.showStart || item.created_at || "",
    rating: item.ratingAverage || item.rating_avg || undefined,
    mediaType: total === 1 ? "movie" : "tv",
    previewUrl: item.relatedMediaSource && item.relatedMediaSource.part && item.relatedMediaSource.part.link || undefined,
    genreTitle: labelText(item),
    link: dramaLink(dramaId)
  };
}

function uniqueCatalog(entries) {
  const seen = new Set();
  return entries.map(catalogItem).filter(item => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function summaryItems() {
  const body = await getJson(withQuery(`${SITE_ORIGIN}/api/drama`));
  const summary = typeof body.summary === "string" ? JSON.parse(body.summary) : body.summary;
  return Array.isArray(summary) ? summary : [];
}

async function sourceItems(params) {
  if (params.peopleId && String(params.peopleId).startsWith("actor:")) {
    const actor = decodeURIComponent(String(params.peopleId).slice(6));
    return (await summaryItems()).filter(item => (item.actors || []).some(person => person.name === actor));
  }
  const source = ["top10", "schedule", "drama", "anime", "variety"].includes(params.source) ? params.source : "top10";
  if (source === "top10") {
    const sections = await cms("homepage");
    const section = sections.find(value => value && value.type === "top10");
    return section && section.datas || [];
  }
  if (source === "schedule") {
    const schedule = await cms("release-schedule");
    const filter = ["戲劇", "動畫", "綜藝"].includes(params.scheduleType) ? params.scheduleType : "all";
    return (schedule.datas || []).filter(item => filter === "all" || (item.channelName || []).includes(filter));
  }
  const channelId = source === "drama" ? 1 : source === "anime" ? 2 : 3;
  const sections = await cms(`channels/${channelId}`);
  const items = [];
  for (const section of sections) {
    if (!section || section.type !== "album") continue;
    items.push(...(section.datas || []));
  }
  return items;
}

loadLineTv = async function loadLineTv(params = {}) {
  try {
    return uniqueCatalog(pageSlice(await sourceItems(params), params.page));
  } catch (error) {
    console.error("[loadLineTv] 失败:", error.message || error);
    throw error;
  }
};

searchLineTv = async function searchLineTv(params = {}) {
  try {
    const keyword = String(params.keyword || "").trim().toLowerCase();
    if (!keyword) return loadLineTv({ source: "top10", page: params.page });
    const matches = (await summaryItems()).filter(item => {
      const text = [item.name, ...(item.actors || []).map(actor => actor.name)].join(" ").toLowerCase();
      return text.includes(keyword);
    });
    return uniqueCatalog(pageSlice(matches, params.page));
  } catch (error) {
    console.error("[searchLineTv] 失败:", error.message || error);
    throw error;
  }
};

function parseOwnedLink(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^linetv:(drama|episode):(\d+)(?::(\d+))?$/);
  if (match && ((match[1] === "episode") === !!match[3])) {
    return { dramaId: Number(match[2]), episode: match[3] ? Number(match[3]) : 0 };
  }
  match = raw.match(/^https:\/\/www\.linetv\.tw\/drama\/(\d+)(?:\/eps\/(\d+))?(?:\?.*)?$/);
  return match ? { dramaId: Number(match[1]), episode: match[2] ? Number(match[2]) : 0 } : null;
}

function durationText(milliseconds) {
  const seconds = Math.floor((Number(milliseconds) || 0) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function episodeItem(detail, episode) {
  const number = Number(episode.number);
  const link = episodeLink(detail.drama_id, number);
  return {
    id: link,
    type: "url",
    title: episode.title || `第 ${number} 集`,
    coverUrl: `https://static.linetv.tw/api/epsScreenShot/${detail.drama_id}/${number}.jpg`,
    backdropPath: `https://static.linetv.tw/api/epsScreenShot/${detail.drama_id}/${number}.jpg`,
    description: episode.svod ? "VIP" : "免费",
    duration: Math.floor((Number(episode.durationInMs) || 0) / 1000),
    durationText: durationText(episode.durationInMs),
    episode: number,
    mediaType: "tv",
    link
  };
}

function detailItem(detail, requestedLink, related) {
  const link = dramaLink(detail.drama_id);
  const episodes = (detail.eps_info || []).map(episode => episodeItem(detail, episode));
  return {
    id: link,
    type: "url",
    title: detail.drama_name,
    posterPath: detail.vertical_poster_url || "",
    detailPoster: detail.vertical_poster_url || "",
    backdropPath: detail.horizontal_poster_url || "",
    description: detail.introduction || detail.editorComment || "",
    releaseDate: detail.created_at || String(detail.year || ""),
    rating: detail.rating_avg || undefined,
    mediaType: Number(detail.total_eps) === 1 ? "movie" : "tv",
    genreTitle: (detail.genres || []).map(genre => genre.key).filter(Boolean).join(" · "),
    peoples: (detail.actors || []).filter(actor => actor.name).map(actor => ({
      id: `actor:${encodeURIComponent(actor.name)}`,
      title: actor.name,
      avatar: /^https?:\/\//.test(actor.photoUrl || "") ? actor.photoUrl : "",
      role: "演员"
    })),
    episodeItems: episodes,
    relatedItems: uniqueCatalog(related || []),
    link: requestedLink || link
  };
}

loadDetail = async function loadDetail(link) {
  const owned = parseOwnedLink(link);
  if (!owned) return null;
  try {
    const [detail, related] = await Promise.all([
      getJson(withQuery(`${SITE_ORIGIN}/api/dramaInfo/${owned.dramaId}`)),
      cms("related-dramas", { dramaId: owned.dramaId }).catch(() => ({ datas: [] }))
    ]);
    if (Number(detail.drama_id) !== owned.dramaId) return null;
    const item = detailItem(detail, link, related.datas || []);
    if (owned.episode) {
      const selected = item.episodeItems.find(episode => episode.episode === owned.episode);
      if (!selected) return null;
      item.id = selected.id;
      item.title = `${detail.drama_name} · ${selected.title}`;
      item.episode = selected.episode;
      item.duration = selected.duration;
      item.durationText = selected.durationText;
      item.link = selected.link;
    }
    return item;
  } catch (error) {
    console.error("[loadDetail] 失败:", error.message || error);
    throw error;
  }
};

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 3) | 8).toString(16);
  });
}

async function persistentId(key) {
  if (Widget.storage && typeof Widget.storage.get === "function") {
    const existing = await Widget.storage.get(key);
    if (/^[0-9a-f-]{36}$/i.test(String(existing || ""))) return existing;
  }
  const value = uuid();
  if (Widget.storage && typeof Widget.storage.set === "function") await Widget.storage.set(key, value);
  return value;
}

function widevineHeaders(license) {
  const headers = {};
  for (const item of license && license.licenseHeaders || []) {
    const targets = Array.isArray(item.for) ? item.for : [item.for];
    if (targets.some(value => String(value || "").toLowerCase().includes("widevine")) && item.key) {
      headers[item.key] = String(item.value || "");
    }
  }
  return headers;
}

async function fetchPlayback(dramaId, episode) {
  const [instanceId, sessionId] = await Promise.all([
    persistentId("linetv:instanceId"),
    persistentId("linetv:sessionId")
  ]);
  const url = withQuery(`${SITE_ORIGIN}/api/part/v2/${dramaId}/eps/${episode}/part`, {
    device: "desktop_web",
    instanceId,
    sessionId,
    chocomemberId: "",
    productType: "VOD",
    os: "",
    embeddedSubtitle: false
  });
  const body = await getJson(url, { headers: { Authorization: "" } });
  if (body.code && !body.sourceInfo) throw new Error(`LINE TV 播放限制：${body.code}`);
  return body;
}

async function dinosaurToken(source, dramaId, episode) {
  const hls = source.sourceInfo && source.sourceInfo.hls || {};
  if (!hls.keyId || !hls.keyType) return "";
  const response = await Widget.http.post(
    withQuery(`${SITE_ORIGIN}/api/part/dinosaurKeeper`),
    { keyType: hls.keyType, keyId: hls.keyId, dramaId, eps: episode },
    { headers: { ...HEADERS, "Content-Type": "application/json" } }
  );
  const body = bodyOf(response);
  return body && body.token || "";
}

loadResource = async function loadResource(params = {}) {
  const rawLink = params.link != null ? params.link : params.id;
  const owned = parseOwnedLink(rawLink);
  const episode = owned && (owned.episode || Number(params.episode));
  if (!owned || !episode) return [];
  try {
    const source = await fetchPlayback(owned.dramaId, episode);
    const info = source.sourceInfo || {};
    if (info.decryptionType === "DRM") {
      const dash = info.dash || {};
      const license = info.license || {};
      if (!dash.url || !license.widevine) return [];
      const licenseHeaders = widevineHeaders(license);
      return [{
        name: "LINE TV Widevine",
        description: "DASH · Widevine DRM",
        url: dash.url,
        playerType: "app",
        customHeaders: { Referer: `${SITE_ORIGIN}/drama/${owned.dramaId}/eps/${episode}`, "User-Agent": HEADERS["User-Agent"] },
        drm: {
          scheme: "widevine",
          licenseUrl: license.widevine,
          headers: licenseHeaders
        }
      }];
    }
    const hls = info.hls || {};
    const mp4 = info.mp4 || {};
    const url = hls.url || mp4.url;
    if (!url) return [];
    const token = await dinosaurToken(source, owned.dramaId, episode);
    const headers = { Referer: `${SITE_ORIGIN}/drama/${owned.dramaId}/eps/${episode}`, "User-Agent": HEADERS["User-Agent"] };
    if (token) headers.authentication = token;
    return [{
      name: "LINE TV HLS",
      description: token ? "HLS · 动态授权" : "HLS",
      url: url.includes("/jurassicPark") ? `${url}${url.includes("?") ? "&" : "?"}time=${Date.now()}` : url,
      playerType: "app",
      customHeaders: headers
    }];
  } catch (error) {
    console.error("[loadResource] 失败:", error.message || error);
    return [];
  }
};
