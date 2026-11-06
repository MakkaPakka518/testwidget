WidgetMetadata = {
  id: "com.stripchat.live",
  title: "Stripchat 直播",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "Stripchat 18+ 直播：热门房间、频道查询与动态 HLS 播放；播放需填写登录 Cookie",
  author: "OpenCode",
  site: "https://zh.stripchat.com",
  detailCacheDuration: 30,
  globalParams: [
    {
      name: "cookie",
      title: "Stripchat Cookie（可选）",
      type: "input",
      value: "",
      description: "仅发送给 zh.stripchat.com；免费账户也可获取当前直播支持的最高画质，请勿分享。"
    }
  ],
  modules: [
    {
      id: "loadFavorites",
      title: "关注在播",
      functionName: "loadFavorites",
      cacheDuration: 30,
      requiresWebView: false,
      sectionMode: false,
      params: [
        { name: "page", title: "页码", type: "page", value: "1" },
        { name: "count", title: "数量", type: "count", value: "30" }
      ]
    },
    {
      id: "loadLiveRooms",
      title: "热门直播",
      functionName: "loadLiveRooms",
      cacheDuration: 60,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "primaryTag",
          title: "分类",
          type: "enumeration",
          value: "girls",
          enumOptions: [
            { title: "女生", value: "girls" },
            { title: "情侣", value: "couples" },
            { title: "男生", value: "men" },
            { title: "跨性别", value: "trans" }
          ]
        },
        { name: "page", title: "页码", type: "page", value: "1" },
        { name: "count", title: "数量", type: "count", value: "30" }
      ]
    },
    {
      id: "loadChannel",
      title: "指定主播",
      functionName: "loadChannel",
      cacheDuration: 30,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "channel",
          title: "主播名或房间链接",
          type: "input",
          value: "Puting_q",
          placeholders: [{ title: "Puting_q", value: "Puting_q" }]
        }
      ]
    },
    {
      id: "loadResource",
      title: "Stripchat 播放源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索主播",
    functionName: "search",
    params: [{ name: "keyword", title: "主播名或房间链接", type: "input" }]
  }
};

const SITE_ORIGIN = "https://zh.stripchat.com";
const INITIAL_API = `${SITE_ORIGIN}/api/front/v3/config/initial-dynamic`;
const MODELS_API = `${SITE_ORIGIN}/api/front/models`;
const HLS_ORIGIN = "https://edge-hls.doppiocdn.net";
const MMP_ORIGIN = "https://mmp.doppiocdn.com/player/mmp";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FULL_PRESETS = ["1080p60", "1080p", "960p60", "960p", "720p60", "720p", "480p"];
const PLAYER_KEY_CACHE = {};

function getBody(response) {
  let body = response && response.data !== undefined ? response.data : response;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return body;
    }
  }
  return body;
}

function cleanCookie(value) {
  const cookie = String(value || "").trim();
  if (!cookie) return "";
  if (cookie.length > 8192 || /[\r\n]/.test(cookie)) throw new Error("Cookie 格式无效");
  return cookie;
}

function siteHeaders(params, referer) {
  const headers = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: referer || `${SITE_ORIGIN}/`,
    Origin: SITE_ORIGIN
  };
  const cookie = cleanCookie(params && params.cookie);
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function roomHeaders(params, referer) {
  return Object.assign({}, siteHeaders(params, referer), {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Cache-Control": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Upgrade-Insecure-Requests": "1"
  });
}

function cleanUsername(value) {
  const username = String(value || "").trim();
  return /^[A-Za-z0-9_-]{2,64}$/.test(username) ? username : "";
}

function parseOwnedLink(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^stripchat:live:([A-Za-z0-9_-]{2,64}):(\d{1,20})$/);
  if (match) return { username: match[1], id: match[2] };
  match = raw.match(/^https:\/\/zh\.stripchat\.com\/([A-Za-z0-9_-]{2,64})\/?(?:[?#].*)?$/i);
  if (match) return { username: match[1], id: "" };
  return null;
}

function usernameFromInput(value) {
  const owned = parseOwnedLink(value);
  return owned ? owned.username : cleanUsername(value);
}

function roomUrl(username) {
  return `${SITE_ORIGIN}/${encodeURIComponent(username)}`;
}

function itemLink(model) {
  return `stripchat:live:${model.username}:${model.id}`;
}

function compactNumber(value) {
  const number = Number(value || 0);
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(number);
}

function statusTitle(status) {
  const titles = {
    public: "公开直播",
    private: "私密直播",
    groupShow: "群组直播",
    p2p: "双人直播",
    away: "暂离"
  };
  return titles[status] || String(status || "直播中");
}

function toVideoItem(model) {
  if (!model || !model.id || !cleanUsername(model.username)) return null;
  const username = cleanUsername(model.username);
  const preview = String(model.previewUrlThumbBig || model.previewUrlThumbSmall || model.previewUrl || "");
  const avatar = String(model.avatarUrl || model.avatarUrlThumb || "");
  const description = [
    `@${username}`,
    statusTitle(model.status),
    model.viewersCount != null ? `观众：${compactNumber(model.viewersCount)}` : ""
  ].filter(Boolean).join(" | ");
  return {
    id: roomUrl(username),
    type: "url",
    title: username,
    coverUrl: preview || avatar,
    posterPath: avatar || preview,
    backdropPath: preview || avatar,
    description,
    peoples: [{ id: username, title: username, avatar, role: "主播" }],
    link: itemLink({ username, id: String(model.id) }),
    playerType: "app"
  };
}

function readRoomModel(html) {
  const source = String(html || "");
  const match = source.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!match) return null;
  let state;
  try {
    state = JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
  const detail = state && state.viewCam && state.viewCam.model;
  const base = state && state.viewCamBase && state.viewCamBase.model;
  if (!detail && !base) return null;
  const playerVersion = state && state.featuresConfig && state.featuresConfig.features &&
    state.featuresConfig.features.playerModuleExternalLoading &&
    state.featuresConfig.features.playerModuleExternalLoading.mmpVersion;
  return Object.assign({}, detail || {}, base || {}, { playerVersion });
}

async function fetchRoomModel(params, username) {
  const response = await Widget.http.get(roomUrl(username), {
    headers: roomHeaders(params, roomUrl(username))
  });
  const model = readRoomModel(response && response.data !== undefined ? response.data : response);
  if (model || !cleanCookie(params && params.cookie)) return model;
  const publicResponse = await Widget.http.get(roomUrl(username), {
    headers: roomHeaders({}, roomUrl(username))
  });
  return readRoomModel(publicResponse && publicResponse.data !== undefined ? publicResponse.data : publicResponse);
}

async function hasAuthenticatedUser(params, username) {
  if (!cleanCookie(params && params.cookie)) return false;
  const response = await Widget.http.get(INITIAL_API, {
    headers: siteHeaders(params, roomUrl(username)),
    params: { requestPath: `/${username}` }
  });
  const body = getBody(response);
  return !!(body && body.initialDynamic && body.initialDynamic.user && body.initialDynamic.user.id);
}

function clampCount(value) {
  const count = Number(value || 30);
  return Number.isFinite(count) ? Math.min(60, Math.max(1, Math.floor(count))) : 30;
}

async function fetchLiveModels(params) {
  const initialResponse = await Widget.http.get(INITIAL_API, {
    headers: siteHeaders(params, `${SITE_ORIGIN}/`),
    params: { requestPath: "/" }
  });
  const initialBody = getBody(initialResponse);
  const initial = initialBody && initialBody.initialDynamic;
  if (!initial || !initial.csrfToken) throw new Error("无法获取 Stripchat 会话参数");

  const count = clampCount(params.count);
  const page = Math.max(1, Math.floor(Number(params.page || 1)) || 1);
  const primaryTag = ["girls", "couples", "men", "trans"].includes(params.primaryTag) ? params.primaryTag : "girls";
  const response = await Widget.http.post(MODELS_API, {
    limit: count,
    offset: (page - 1) * count,
    primaryTag,
    sortBy: "stripRanking",
    csrfToken: initial.csrfToken,
    csrfTimestamp: initial.csrfTimestamp,
    csrfNotifyTimestamp: initial.csrfNotifyTimestamp
  }, {
    headers: Object.assign({ "Content-Type": "application/json" }, siteHeaders(params, `${SITE_ORIGIN}/`))
  });
  const body = getBody(response);
  return body && Array.isArray(body.models) ? body.models : [];
}

loadFavorites = async function loadFavorites(params = {}) {
  try {
    if (!cleanCookie(params.cookie)) return [];
    const count = clampCount(params.count);
    const page = Math.max(1, Math.floor(Number(params.page || 1)) || 1);
    const response = await Widget.http.get(`${SITE_ORIGIN}/api/front/models/favorites`, {
      headers: siteHeaders(params, `${SITE_ORIGIN}/favorites`),
      params: {
        offset: (page - 1) * count,
        sortBy: "bestMatch",
        limit: count,
        mlfv: "false"
      }
    });
    const body = getBody(response);
    const models = body && Array.isArray(body.models) ? body.models : [];
    return models.filter((model) => model && model.isLive).map(toVideoItem).filter(Boolean);
  } catch (error) {
    console.error("[Stripchat loadFavorites] 失败:", error.message || error);
    throw error;
  }
};

loadLiveRooms = async function loadLiveRooms(params = {}) {
  try {
    const models = await fetchLiveModels(params);
    return models.filter((model) => model && model.isLive && model.status === "public").map(toVideoItem).filter(Boolean);
  } catch (error) {
    console.error("[Stripchat loadLiveRooms] 失败:", error.message || error);
    throw error;
  }
};

loadChannel = async function loadChannel(params = {}) {
  try {
    const username = usernameFromInput(params.channel || params.peopleId);
    if (!username) return [];
    const model = await fetchRoomModel(params, username);
    if (!model || !model.isLive) return [];
    return [toVideoItem(model)].filter(Boolean);
  } catch (error) {
    console.error("[Stripchat loadChannel] 失败:", error.message || error);
    throw error;
  }
};

search = async function search(params = {}) {
  try {
    const username = usernameFromInput(params.keyword);
    if (!username) return [];
    return loadChannel(Object.assign({}, params, { channel: username }));
  } catch (error) {
    console.error("[Stripchat search] 失败:", error.message || error);
    return [];
  }
};

loadDetail = async function loadDetail(link) {
  try {
    const owned = parseOwnedLink(link);
    if (!owned) return null;
    const model = await fetchRoomModel({}, owned.username);
    if (!model || String(model.id) !== String(owned.id || model.id)) return null;
    return toVideoItem(model);
  } catch (error) {
    console.error("[Stripchat loadDetail] 失败:", error.message || error);
    return null;
  }
};

function playlistUrl(streamName, preset) {
  return `${HLS_ORIGIN}/hls/${streamName}/master/${streamName}_${preset}.m3u8`;
}

async function fetchPlayerKey(version, username) {
  if (!/^v\d+\.\d+\.\d+$/.test(String(version || ""))) return "";
  if (PLAYER_KEY_CACHE[version]) return PLAYER_KEY_CACHE[version];
  const response = await Widget.http.get(`${MMP_ORIGIN}/${version}/main.js`, {
    headers: { "User-Agent": UA, Referer: roomUrl(username) }
  });
  const source = String(response && response.data !== undefined ? response.data : response || "");
  const match = source.match(/searchParams\.set\(["']pkey["'],["']([A-Za-z0-9_-]{8,64})["']\)/);
  const key = match ? match[1] : "";
  if (key) PLAYER_KEY_CACHE[version] = key;
  return key;
}

function signedMediaUrl(master, key) {
  const media = String(master || "").split(/\r?\n/).map((line) => line.trim()).find((line) =>
    /^https:\/\/media-hls\.doppiocdn\.(?:net|media)\//i.test(line)
  );
  if (!media) return "";
  const standard = media.replace(/([?&])playlistType=[^&]*/i, "$1playlistType=standard");
  return `${standard}${standard.includes("?") ? "&" : "?"}pkey=${encodeURIComponent(key)}`;
}

async function probePreset(streamName, preset, username, playerKey) {
  const url = playlistUrl(streamName, preset);
  try {
    const headers = { "User-Agent": UA, Referer: roomUrl(username), Origin: SITE_ORIGIN };
    const masterResponse = await Widget.http.get(url, { headers });
    const master = String(masterResponse && masterResponse.data !== undefined ? masterResponse.data : masterResponse || "");
    const mediaUrl = signedMediaUrl(master, playerKey);
    if (!mediaUrl) return null;
    const mediaResponse = await Widget.http.get(mediaUrl, { headers });
    const media = String(mediaResponse && mediaResponse.data !== undefined ? mediaResponse.data : mediaResponse || "");
    if (!media.includes("#EXTM3U") || media.includes("/cpa/") || !media.includes(`/${streamName}/`)) return null;
    return {
      name: preset.toUpperCase(),
      description: "Stripchat HLS",
      url: mediaUrl,
      customHeaders: headers,
      playerType: "app"
    };
  } catch (error) {
    return null;
  }
}

loadResource = async function loadResource(params = {}) {
  try {
    const raw = params.link !== undefined && params.link !== null && String(params.link).trim()
      ? params.link
      : params.id;
    const owned = parseOwnedLink(raw);
    if (!owned) return [];

    const model = await fetchRoomModel(params, owned.username);
    const streamName = String(model && (model.streamName || model.id) || "");
    if (!model || !model.isLive || !/^\d{1,20}$/.test(streamName)) return [];
    if (owned.id && String(model.id) !== owned.id) return [];

    if (!await hasAuthenticatedUser(params, owned.username)) return [];
    const playerKey = await fetchPlayerKey(model.playerVersion, owned.username);
    if (!playerKey) return [];
    const resources = await Promise.all(FULL_PRESETS.map((preset) => probePreset(streamName, preset, owned.username, playerKey)));
    return resources.filter(Boolean);
  } catch (error) {
    console.error("[Stripchat loadResource] 失败:", error.message || error);
    throw error;
  }
};
