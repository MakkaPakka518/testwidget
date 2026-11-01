WidgetMetadata = {
  id: "com.twitch.live",
  title: "Twitch 直播",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "Twitch 直播模块：热门直播、分类、频道、搜索与 HLS 播放，无需登录",
  author: "OpenCode",
  site: "https://www.twitch.tv",
  detailCacheDuration: 60,
  globalParams: [
    {
      name: "clientId",
      title: "Client-ID（可选）",
      type: "input",
      value: "kimne78kx3ncx6brgo4mv6wki5h1ko",
      description: "Twitch 网页公开 Client-ID，一般无需修改。"
    },
    {
      name: "token",
      title: "OAuth Token（可选）",
      type: "input",
      value: "",
      description: "接入自己的 Twitch 应用后可填 App Access Token，留空使用公开接口。"
    }
  ],
  modules: [
    {
      id: "loadTopStreams",
      title: "热门直播",
      functionName: "loadTopStreams",
      cacheDuration: 120,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "game",
          title: "分类",
          type: "enumeration",
          value: "",
          enumOptions: [
            { title: "全部分类", value: "" },
            { title: "Just Chatting", value: "Just Chatting" },
            { title: "VALORANT", value: "VALORANT" },
            { title: "Minecraft", value: "Minecraft" },
            { title: "Fortnite", value: "Fortnite" },
            { title: "League of Legends", value: "League of Legends" },
            { title: "Counter-Strike 2", value: "Counter-Strike 2" },
            { title: "Dota 2", value: "Dota 2" },
            { title: "Grand Theft Auto V", value: "Grand Theft Auto V" },
            { title: "StarCraft II", value: "StarCraft II" }
          ]
        },
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadGames",
      title: "热门分类",
      functionName: "loadGames",
      cacheDuration: 300,
      requiresWebView: false,
      sectionMode: false,
      params: [
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadChannel",
      title: "频道",
      functionName: "loadChannel",
      cacheDuration: 60,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "channel",
          title: "频道名",
          type: "input",
          value: "",
          placeholders: [
            { title: "twitch", value: "twitch" },
            { title: "squeezie", value: "squeezie" }
          ]
        }
      ]
    },
    {
      id: "loadResource",
      title: "Twitch 播放源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索频道",
    functionName: "search",
    params: [
      { name: "keyword", title: "关键词或频道名", type: "input" },
      {
        name: "mode",
        title: "搜索方式",
        type: "enumeration",
        value: "category",
        enumOptions: [
          { title: "分类名", value: "category" },
          { title: "频道名", value: "channel" }
        ]
      }
    ]
  }
};

const GQL_URL = "https://gql.twitch.tv/gql";
const USHER_LIVE = "https://usher.ttvnw.net/api/channel/hls";
const USHER_VOD = "https://usher.ttvnw.net/vod";
const DEFAULT_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const MAX_PER_REQUEST = 30;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const STREAM_CACHE = {};
const STREAM_TTL = 5 * 60 * 1000;
const STREAM_FIELDS = [
  "id",
  "title",
  "viewersCount",
  "previewImageURL(width:640,height:360)",
  "broadcaster{login displayName profileImageURL(width:70)}",
  "game{name displayName}"
].join(" ");

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

function clientId(params) {
  const value = String(params && params.clientId || "").trim();
  return /^[a-z0-9]{20,40}$/i.test(value) ? value : DEFAULT_CLIENT_ID;
}

function gqlHeaders(params) {
  const headers = {
    "Client-ID": clientId(params),
    "Content-Type": "application/json",
    "User-Agent": UA,
    Referer: "https://www.twitch.tv/",
    Origin: "https://www.twitch.tv"
  };
  const token = String(params && params.token || "").trim();
  if (/^[A-Za-z0-9_]{20,200}$/.test(token)) headers.Authorization = `OAuth ${token}`;
  return headers;
}

async function gql(params, query, variables = {}) {
  const response = await Widget.http.post(GQL_URL, { query, variables }, { headers: gqlHeaders(params) });
  const body = getBody(response);
  if (!body || body.errors) {
    const message = body && body.errors && body.errors[0] && body.errors[0].message;
    throw new Error(message || "Twitch GraphQL 请求失败");
  }
  return body.data || {};
}

function clampCount(value, fallback) {
  const count = Number(value || fallback);
  if (!Number.isFinite(count)) return fallback;
  return Math.min(MAX_PER_REQUEST, Math.max(1, Math.floor(count)));
}

function cleanLogin(value) {
  const login = String(value || "").trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9_]{3,25}$/.test(login) ? login : "";
}

function compactNumber(value) {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(number);
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

function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildStreamLink(login, videoId = "") {
  const clean = cleanLogin(login);
  if (videoId && /^\d{5,20}$/.test(String(videoId))) return `twitch:vod:${videoId}`;
  if (!clean) return "";
  return `twitch:live:${clean}`;
}

function parseOwnedLink(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^twitch:live:([a-z0-9_]{3,25})$/i);
  if (match) return { kind: "live", login: match[1].toLowerCase(), videoId: "" };
  match = raw.match(/^twitch:vod:(\d{5,20})$/i);
  if (match) return { kind: "vod", login: "", videoId: match[1] };
  match = raw.match(/^https:\/\/(?:www\.)?twitch\.tv\/videos\/(\d{5,20})\/?(?:[?#].*)?$/i);
  if (match) return { kind: "vod", login: "", videoId: match[1] };
  match = raw.match(/^https:\/\/(?:www\.)?twitch\.tv\/([a-z0-9_]{3,25})\/?(?:[?#].*)?$/i);
  if (match) {
    const login = cleanLogin(match[1]);
    if (login) return { kind: "live", login, videoId: "" };
  }
  return null;
}

function isLive(node) {
  return !!(node && node.id && node.broadcaster && cleanLogin(node.broadcaster.login));
}

function cacheStream(node) {
  const login = cleanLogin(node && node.broadcaster && node.broadcaster.login);
  if (!login) return;
  STREAM_CACHE[login] = { node, timestamp: Date.now() };
}

function getCachedStream(login) {
  const cached = STREAM_CACHE[login];
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= STREAM_TTL) {
    delete STREAM_CACHE[login];
    return null;
  }
  return cached.node;
}

function toLiveItem(node) {
  if (!isLive(node)) return null;
  const login = node.broadcaster.login.toLowerCase();
  const link = buildStreamLink(login);
  const cover = String(node.previewImageURL || "");
  const avatar = String(node.broadcaster.profileImageURL || "");
  return {
    id: `https://www.twitch.tv/${login}`,
    type: "url",
    title: String(node.title || node.broadcaster.displayName || login),
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    description: [
      `${node.broadcaster.displayName || login} · @${login}`,
      node.game && node.game.displayName ? `分类：${node.game.displayName}` : "",
      `观众：${compactNumber(node.viewersCount)}`
    ].filter(Boolean).join(" | "),
    peoples: [{
      id: login,
      title: String(node.broadcaster.displayName || login),
      avatar,
      role: "主播"
    }],
    link,
    playerType: "app"
  };
}

function toGameItem(node) {
  if (!node || !node.name) return null;
  const cover = String(node.boxArtURL || "");
  return {
    id: `twitch:live:${cleanLogin(node.name) || node.name}`,
    type: "url",
    title: String(node.displayName || node.name),
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    description: `观众：${compactNumber(node.viewersCount)}`,
    link: `twitch:game:${node.name}`,
    playerType: "app"
  };
}

loadTopStreams = async function loadTopStreams(params = {}) {
  try {
    const count = clampCount(params.count, 20);
    const gameName = String(params.game || "").trim();
    if (gameName) {
      const data = await gql(params, `query($game:String!,$first:Int!){game(name:$game){displayName streams(first:$first){edges{node{${STREAM_FIELDS}}}}}}`, {
        game: gameName,
        first: count
      });
      const edges = data.game && data.game.streams && data.game.streams.edges || [];
      return edges.map((edge) => edge.node).filter(isLive).map((node) => (cacheStream(node), toLiveItem(node))).filter(Boolean);
    }
    const data = await gql(params, `query($first:Int!){streams(first:$first){edges{node{${STREAM_FIELDS}}}}}`, { first: count });
    const edges = data.streams && data.streams.edges || [];
    return edges.map((edge) => edge.node).filter(isLive).map((node) => (cacheStream(node), toLiveItem(node))).filter(Boolean);
  } catch (error) {
    console.error("[Twitch loadTopStreams] 失败:", error.message || error);
    throw error;
  }
};

loadGames = async function loadGames(params = {}) {
  try {
    const count = clampCount(params.count, 20);
    const data = await gql(params, `query($first:Int!){games(first:$first){edges{node{id name displayName viewersCount boxArtURL(width:285,height:380)}}}}`, { first: count });
    const edges = data.games && data.games.edges || [];
    return edges.map((edge) => toGameItem(edge.node)).filter(Boolean);
  } catch (error) {
    console.error("[Twitch loadGames] 失败:", error.message || error);
    throw error;
  }
};

loadChannel = async function loadChannel(params = {}) {
  try {
    const login = cleanLogin(params.channel || params.peopleId);
    if (!login) return [];
    const cached = getCachedStream(login);
    if (cached) return [toLiveItem(cached)].filter(Boolean);

    const data = await gql(params, `query($login:String!){user(login:$login){stream{${STREAM_FIELDS}}}}`, { login });
    const node = data.user && data.user.stream;
    if (!isLive(node)) return [];
    cacheStream(node);
    return [toLiveItem(node)].filter(Boolean);
  } catch (error) {
    console.error("[Twitch loadChannel] 失败:", error.message || error);
    throw error;
  }
};

search = async function search(params = {}) {
  try {
    const keyword = String(params.keyword || "").trim();
    if (!keyword) return [];
    const owned = parseOwnedLink(keyword);
    if (owned && owned.kind === "live") return loadChannel({ ...params, channel: owned.login });

    if (params.mode === "channel" || cleanLogin(keyword)) {
      return loadChannel({ ...params, channel: keyword });
    }
    const data = await gql(params, `query($game:String!,$first:Int!){game(name:$game){id name displayName streams(first:$first){edges{node{${STREAM_FIELDS}}}}}}`, {
      game: keyword,
      first: 20
    });
    if (data.game) {
      const edges = data.game.streams && data.game.streams.edges || [];
      const items = edges.map((edge) => edge.node).filter(isLive).map((node) => (cacheStream(node), toLiveItem(node))).filter(Boolean);
      if (items.length) return items;
    }
    return loadChannel({ ...params, channel: keyword });
  } catch (error) {
    console.error("[Twitch search] 失败:", error.message || error);
    return [];
  }
};

loadDetail = async function loadDetail(link) {
  try {
    const owned = parseOwnedLink(link);
    if (!owned) return null;
    if (owned.kind === "vod") {
      const data = await gql({}, `query($id:ID!){video(id:$id){id title lengthSeconds previewThumbnailURL(width:640,height:360) owner{login displayName profileImageURL(width:70)} game{name displayName}}}`, { id: owned.videoId });
      const video = data.video;
      if (!video) return null;
      const cover = String(video.previewThumbnailURL || "");
      return {
        id: `https://www.twitch.tv/videos/${video.id}`,
        type: "url",
        title: String(video.title || `VOD ${video.id}`),
        coverUrl: cover,
        posterPath: cover,
        backdropPath: cover,
        duration: Number(video.lengthSeconds || 0),
        durationText: formatDuration(video.lengthSeconds),
        description: [
          video.owner ? `${video.owner.displayName || video.owner.login}` : "",
          video.game ? `分类：${video.game.displayName || video.game.name}` : ""
        ].filter(Boolean).join(" | "),
        peoples: video.owner ? [{
          id: String(video.owner.login),
          title: String(video.owner.displayName || video.owner.login),
          avatar: String(video.owner.profileImageURL || ""),
          role: "主播"
        }] : [],
        link: buildStreamLink("", video.id),
        playerType: "app"
      };
    }
    const items = await loadChannel({ channel: owned.login });
    return items[0] || null;
  } catch (error) {
    console.error("[Twitch loadDetail] 失败:", error.message || error);
    return null;
  }
};

async function playbackToken(params, context) {
  if (context.kind === "vod") {
    const data = await gql(
      params,
      "query($vodID:ID!,$playerType:String!){videoPlaybackAccessToken(id:$vodID,params:{platform:\"web\",playerBackend:\"mediaplayer\",playerType:$playerType}){value signature}}",
      { vodID: context.videoId, playerType: "site" }
    );
    return data.videoPlaybackAccessToken || null;
  }
  const data = await gql(
    params,
    "query($login:String!,$playerType:String!){streamPlaybackAccessToken(channelName:$login,params:{platform:\"web\",playerBackend:\"mediaplayer\",playerType:$playerType}){value signature}}",
    { login: context.login, playerType: "site" }
  );
  return data.streamPlaybackAccessToken || null;
}

async function fetchMaster(params, context, token) {
  const url = context.kind === "vod"
    ? `${USHER_VOD}/${context.videoId}.m3u8`
    : `${USHER_LIVE}/${context.login}.m3u8`;
  const response = await Widget.http.get(url, {
    headers: { "Client-ID": clientId(params), "User-Agent": UA },
    params: {
      sig: token.signature,
      token: token.value,
      allow_source: "true",
      allow_audio_only: "true",
      player: "twitchweb",
      p: "1234567"
    }
  });
  return String(response && response.data || "");
}

function parseVariants(master) {
  const lines = String(master || "").split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const next = (lines[i + 1] || "").trim();
    if (!next || next.startsWith("#")) continue;
    const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const nameMatch = line.match(/VIDEO="([^"]+)"/i);
    const height = resolution ? Number(resolution[2]) : 0;
    const bandwidth = Number((line.match(/BANDWIDTH=(\d+)/i) || [])[1] || 0);
    variants.push({
      url: next,
      name: nameMatch ? nameMatch[1] : (height ? `${height}P` : "AUTO"),
      height,
      bandwidth
    });
  }
  return variants;
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

    const token = await playbackToken(params, context);
    if (!token) return [];
    const master = await fetchMaster(params, context, token);
    if (!master.includes("#EXTM3U")) return [];

    const headers = {
      "User-Agent": UA,
      Referer: context.kind === "vod" ? `https://www.twitch.tv/videos/${context.videoId}` : `https://www.twitch.tv/${context.login}`,
      Origin: "https://www.twitch.tv",
      "X-Forward-Skip-Redirect-Probe": "1"
    };
    const variants = parseVariants(master);
    if (!variants.length) {
      return [{
        name: context.kind === "vod" ? "VOD" : "直播",
        description: "Twitch HLS",
        url: context.kind === "vod" ? `${USHER_VOD}/${context.videoId}.m3u8?sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}&allow_source=true` : `${USHER_LIVE}/${context.login}.m3u8?sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}&allow_source=true`,
        customHeaders: headers,
        playerType: "app"
      }];
    }

    return variants.map((variant) => ({
      name: variant.name,
      description: variant.bandwidth ? `${Math.round(variant.bandwidth / 1000)} kbps` : "Twitch HLS",
      url: variant.url,
      customHeaders: headers,
      playerType: "app"
    }));
  } catch (error) {
    console.error("[Twitch loadResource] 失败:", error.message || error);
    throw error;
  }
};
