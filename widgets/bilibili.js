WidgetMetadata = {
  id: "com.bilibili.video",
  title: "哔哩哔哩",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "哔哩哔哩视频模块：热门、排行、搜索、UP 主、DASH/HLS 多清晰度播放",
  author: "OpenCode",
  site: "https://www.bilibili.com",
  detailCacheDuration: 300,
  globalParams: [
    {
      name: "loginServer",
      title: "登录服务地址（推荐）",
      type: "input",
      value: "",
      description: "扫码登录 Worker 的 HTTPS 地址，例如 https://bili-login.xxx.workers.dev。配置后无需手工填 Cookie。"
    },
    {
      name: "loginKey",
      title: "登录 Key",
      type: "input",
      value: "",
      description: "在登录服务页面扫码后得到的 bk_ 开头的 key。仅绑定扫码时的浏览器。"
    },
    {
      name: "cookie",
      title: "B站 Cookie（可选）",
      type: "input",
      value: "",
      description: "备用方式。填写 SESSDATA 等 Cookie 可观看 1080P+ 与会员内容；配置登录服务后留空即可。"
    },
    {
      name: "qualityMode",
      title: "画质模式",
      type: "enumeration",
      value: "mpd",
      description: "MPD 模式生成 DASH 清单，播放器自动合并音视频，可播 1080P/4K；单文件模式兼容性最好但清晰度受B站单文件格式限制。",
      enumOptions: [
        { title: "MPD 合并播放（最高画质，推荐）", value: "mpd" },
        { title: "单文件 MP4（兼容性最好）", value: "merged" },
        { title: "DASH 分离轨（视频+音轨分开列）", value: "dash" },
        { title: "全部列出", value: "both" }
      ]
    }
  ],
  modules: [
    {
      id: "loadPopular",
      title: "热门",
      functionName: "loadPopular",
      cacheDuration: 300,
      requiresWebView: false,
      sectionMode: false,
      params: [
        { name: "page", title: "页码", type: "page" },
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadRanking",
      title: "排行榜",
      functionName: "loadRanking",
      cacheDuration: 300,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "category",
          title: "分区",
          type: "enumeration",
          value: "0",
          enumOptions: [
            { title: "全站", value: "0" },
            { title: "动画", value: "1" },
            { title: "番剧", value: "13" },
            { title: "国创", value: "168" },
            { title: "音乐", value: "3" },
            { title: "舞蹈", value: "129" },
            { title: "游戏", value: "4" },
            { title: "知识", value: "36" },
            { title: "科技", value: "188" },
            { title: "运动", value: "234" },
            { title: "汽车", value: "223" },
            { title: "生活", value: "160" },
            { title: "美食", value: "211" },
            { title: "动物", value: "217" },
            { title: "鬼畜", value: "119" },
            { title: "时尚", value: "155" },
            { title: "资讯", value: "202" },
            { title: "娱乐", value: "5" },
            { title: "影视", value: "181" },
            { title: "纪录片", value: "177" },
            { title: "电影", value: "23" },
            { title: "电视剧", value: "11" }
          ]
        },
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadUploader",
      title: "UP 主视频",
      functionName: "loadUploader",
      cacheDuration: 180,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "mid",
          title: "UP 主 UID 或主页链接",
          type: "input",
          value: "",
          placeholders: [
            { title: "影视飓风", value: "946974" }
          ]
        },
        { name: "page", title: "页码", type: "page" },
        { name: "count", title: "数量", type: "count", value: "20" }
      ]
    },
    {
      id: "loadResource",
      title: "B站播放源",
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
      { name: "keyword", title: "关键词、BV号或视频链接", type: "input" },
      { name: "page", title: "页码", type: "page" },
      { name: "count", title: "数量", type: "count", value: "20" }
    ]
  }
};

const API = "https://api.bilibili.com";
const PASSPORT = "https://passport.bilibili.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = "https://www.bilibili.com/";
const VIDEO_CACHE = {};
const VIDEO_TTL = 5 * 60 * 1000;
const BUVID_TTL = 6 * 60 * 60 * 1000;
let buvidCache = null;

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

function normalizeCookie(value) {
  const cookie = String(value || "").trim().replace(/^cookie\s*:\s*/i, "").trim();
  if (!cookie || cookie.length > 8192 || /[\r\n]/.test(cookie)) return "";
  return cookie;
}

function cookieHasLogin(cookie) {
  return /(?:^|;\s*)SESSDATA=[^;]{8,}/i.test(cookie);
}

async function ensureBuvid() {
  if (buvidCache && Date.now() - buvidCache.timestamp < BUVID_TTL) return buvidCache.value;
  try {
    const response = await Widget.http.get(`${API}/x/frontend/finger/spi`, {
      headers: { "User-Agent": UA, Referer: REFERER }
    });
    const body = getBody(response);
    const value = body && body.data && body.data.b_3 ? String(body.data.b_3) : "";
    if (value) {
      buvidCache = { value, timestamp: Date.now() };
      return value;
    }
  } catch (error) {
    console.log("[Bilibili] buvid 获取失败:", error.message || error);
  }
  return "";
}

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];
let wbiCache = null;
const WBI_TTL = 60 * 60 * 1000;

function md5(text) {
  const input = String(text);
  const bytes = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0xd800 || code >= 0xe000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else {
      const next = input.charCodeAt(i + 1) - 0xdc00;
      const point = 0x10000 + (((code - 0xd800) << 10) | next);
      i += 1;
      bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);

  const words = [];
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
  }
  words[words.length] = bitLen | 0;
  words[words.length] = Math.floor(bitLen / 0x100000000) | 0;

  const K = [];
  for (let i = 0; i < 64; i += 1) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
  }
  const SHIFT = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;

  for (let chunk = 0; chunk < words.length; chunk += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + K[i] + (words[chunk + g] | 0)) | 0;
      const shifted = ((sum << SHIFT[i]) | (sum >>> (32 - SHIFT[i]))) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + shifted) | 0;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const hex = "0123456789abcdef";
  let out = "";
  [a0, b0, c0, d0].forEach((word) => {
    for (let i = 0; i < 4; i += 1) {
      const byte = (word >>> (i * 8)) & 0xff;
      out += hex[(byte >> 4) & 0xf] + hex[byte & 0xf];
    }
  });
  return out;
}

async function ensureWbi(params) {
  if (wbiCache && Date.now() - wbiCache.timestamp < WBI_TTL) return wbiCache.value;
  let data;
  try {
    // 走 apiGet，确保通过登录服务 / 正确出口，避免直连被 -412 拦截
    data = await apiGet(params, "/x/web-interface/nav", {}, REFERER, { allowCodes: [-101] });
  } catch (error) {
    console.log("[Bilibili] WBI 密钥获取失败:", error.message || error);
    return "";
  }
  const wbi = data && data.wbi_img;
  if (!wbi || !wbi.img_url || !wbi.sub_url) return "";
  const imgKey = String(wbi.img_url).split("/").pop().split(".")[0];
  const subKey = String(wbi.sub_url).split("/").pop().split(".")[0];
  const raw = imgKey + subKey;
  const mixin = MIXIN_KEY_ENC_TAB.map((index) => raw[index] || "").join("").slice(0, 32);
  wbiCache = { value: mixin, timestamp: Date.now() };
  return mixin;
}

function encodeQuery(pairs) {
  return pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}

async function wbiSign(params, query) {
  const mixin = await ensureWbi(params);
  if (!mixin) return Object.fromEntries(Object.entries(query));
  const withTs = Object.assign({}, query, { wts: Math.floor(Date.now() / 1000) });
  const pairs = Object.keys(withTs)
    .sort()
    .map((key) => [key, String(withTs[key]).replace(/[!'()*]/g, "")]);
  const wRid = md5(encodeQuery(pairs) + mixin);
  return Object.assign(Object.fromEntries(pairs), { w_rid: wRid });
}

function normalizeServer(value) {
  const server = String(value || "").trim().replace(/\/+$/, "");
  if (!server || server.length > 512 || /[\r\n\s]/.test(server) || !/^https:\/\//i.test(server)) return "";
  return server;
}

function normalizeLoginKey(value) {
  const key = String(value || "").trim();
  return /^bk_[a-f0-9]{32}$/.test(key) ? key : "";
}

function loginSession(params) {
  const server = normalizeServer(params && params.loginServer);
  const key = normalizeLoginKey(params && params.loginKey);
  return server && key ? { server, key } : null;
}

async function proxyRequest(params, path, query = {}, referer = REFERER, options = {}) {
  const session = loginSession(params);
  if (!session) return null;
  const queryPairs = Object.keys(query || {})
    .filter((name) => query[name] !== undefined && query[name] !== null)
    .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(String(query[name]))}`);
  const target = `${API}${path}${queryPairs.length ? `?${queryPairs.join("&")}` : ""}`;
  const response = await Widget.http.get(`${session.server}/api/proxy`, {
    headers: { "X-Bili-Key": session.key, Referer: REFERER },
    params: { url: target }
  });
  const body = getBody(response);
  if (!body) throw new Error("登录服务返回异常");
  const allowCodes = Array.isArray(options.allowCodes) ? options.allowCodes : [];
  if (body.code !== 0 && !allowCodes.includes(Number(body.code))) {
    const error = new Error(body.message || body.msg || `B站接口错误 ${body.code}`);
    error.code = body.code;
    throw error;
  }
  return body.data;
}

async function apiGet(params, path, query = {}, referer = REFERER, options = {}) {
  if (loginSession(params)) {
    return proxyRequest(params, path, query, referer, options);
  }
  const buvid = await ensureBuvid();
  const cookie = normalizeCookie(params && params.cookie);
  const cookieHeader = ["buvid3=" + (buvid || "0"), "b_nut=1", cookie].filter(Boolean).join("; ");
  const response = await Widget.http.get(`${API}${path}`, {
    headers: {
      "User-Agent": UA,
      Referer: referer,
      Origin: "https://www.bilibili.com",
      Cookie: cookieHeader
    },
    params: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]))
  });
  const body = getBody(response);
  if (!body) throw new Error("B站接口返回异常");
  const allowCodes = Array.isArray(options.allowCodes) ? options.allowCodes : [];
  if (body.code !== 0 && !allowCodes.includes(Number(body.code))) {
    const error = new Error(body.message || body.msg || `B站接口错误 ${body.code}`);
    error.code = body.code;
    throw error;
  }
  return body.data;
}

function compactNumber(value) {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(number);
}

function normalizeImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw.replace(/^http:\/\//, "https://");
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
  const seconds = Number(timestamp || 0);
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function cleanBvid(value) {
  const match = String(value || "").trim().match(/^(BV[0-9A-Za-z]{10})$/);
  return match ? match[1] : "";
}

function cleanMid(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(?:space\.bilibili\.com\/)?(\d{1,15})/);
  return match ? match[1] : "";
}

function parseInternalLink(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^bili:bvid:(BV[0-9A-Za-z]{10})$/);
  if (match) return { bvid: match[1], cid: 0 };
  match = raw.match(/^bili:video:(BV[0-9A-Za-z]{10}):(\d+)$/);
  if (match) return { bvid: match[1], cid: Number(match[2]) };
  return null;
}

function parseBilibiliUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\/(?:www\.|m\.)?bilibili\.com\//i.test(raw)) return null;
  const bv = raw.match(/(BV[0-9A-Za-z]{10})/);
  if (!bv) return null;
  const p = raw.match(/[?&]p=(\d+)/);
  return { bvid: bv[1], page: p ? Math.max(1, Number(p[1])) : 1 };
}

function parseOwnedLink(value) {
  return parseInternalLink(value) || parseBilibiliUrl(value);
}

function videoLink(bvid, cid = 0) {
  const clean = cleanBvid(bvid);
  if (!clean) return "";
  return cid ? `bili:video:${clean}:${cid}` : `bili:bvid:${clean}`;
}

function toVideoItem(raw, page = 1) {
  if (!raw) return null;
  const bvid = cleanBvid(raw.bvid);
  if (!bvid) return null;
  const pic = normalizeImageUrl(raw.pic);
  const owner = raw.owner || {};
  const stat = raw.stat || {};
  const pages = Array.isArray(raw.pages) ? raw.pages : [];
  const target = pages[Math.min(page - 1, Math.max(0, pages.length - 1))] || null;
  const durationSeconds = target ? Number(target.duration || 0) : Number(raw.duration || 0);
  const item = {
    id: `https://www.bilibili.com/video/${bvid}`,
    type: "url",
    title: String(raw.title || bvid),
    coverUrl: pic,
    posterPath: pic,
    backdropPath: pic,
    description: [
      owner.name ? `${owner.name}` : "",
      stat.view ? `播放：${compactNumber(stat.view)}` : "",
      stat.danmaku ? `弹幕：${compactNumber(stat.danmaku)}` : "",
      raw.tname || ""
    ].filter(Boolean).join(" | "),
    duration: durationSeconds,
    durationText: formatDuration(durationSeconds),
    releaseDate: formatDate(raw.pubdate),
    link: videoLink(bvid, target && pages.length > 1 ? Number(target.cid || 0) : 0),
    playerType: "app"
  };
  if (owner.mid) {
    item.peoples = [{
      id: String(owner.mid),
      title: String(owner.name || owner.mid),
      avatar: normalizeImageUrl(owner.face),
      role: "UP主"
    }];
  }
  if (pages.length > 1) {
    item.episode = page;
    item.episodeItems = pages.map((entry, index) => ({
      id: `bili:video:${bvid}:${entry.cid}`,
      type: "url",
      title: String(entry.part || `P${index + 1}`),
      episode: index + 1,
      link: `bili:video:${bvid}:${entry.cid}`,
      playerType: "app"
    }));
  }
  if (raw.desc) item.description = `${item.description}\n${String(raw.desc).slice(0, 200)}`.trim();
  return item;
}

function cacheVideo(raw) {
  const bvid = cleanBvid(raw && raw.bvid);
  if (!bvid) return raw;
  VIDEO_CACHE[bvid] = { raw, timestamp: Date.now() };
  return raw;
}

function getCachedVideo(bvid) {
  const cached = VIDEO_CACHE[cleanBvid(bvid)];
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= VIDEO_TTL) {
    delete VIDEO_CACHE[cleanBvid(bvid)];
    return null;
  }
  return cached.raw;
}

async function fetchVideoView(params, bvid) {
  const clean = cleanBvid(bvid);
  if (!clean) return null;
  const cached = getCachedVideo(clean);
  if (cached) return cached;
  const data = await apiGet(params, "/x/web-interface/view", { bvid: clean }, `https://www.bilibili.com/video/${clean}`);
  if (!data || cleanBvid(data.bvid) !== clean) return null;
  return cacheVideo(data);
}

loadPopular = async function loadPopular(params = {}) {
  try {
    const page = Math.max(1, Number(params.page || 1));
    const count = Math.min(50, Math.max(1, Number(params.count || 20)));
    const data = await apiGet(params, "/x/web-interface/popular", { ps: count, pn: page });
    const list = Array.isArray(data && data.list) ? data.list : [];
    return list.map((raw) => (cacheVideo(raw), toVideoItem(raw))).filter(Boolean);
  } catch (error) {
    console.error("[Bilibili loadPopular] 失败:", error.message || error);
    throw error;
  }
};

loadRanking = async function loadRanking(params = {}) {
  try {
    const count = Math.min(100, Math.max(1, Number(params.count || 20)));
    const category = /^\d{1,6}$/.test(String(params.category || "0")) ? String(params.category || "0") : "0";
    const data = await apiGet(params, "/x/web-interface/ranking/v2", { rid: category, type: "all" });
    const list = Array.isArray(data && data.list) ? data.list : [];
    return list.slice(0, count).map((raw) => (cacheVideo(raw), toVideoItem(raw))).filter(Boolean);
  } catch (error) {
    console.error("[Bilibili loadRanking] 失败:", error.message || error);
    throw error;
  }
};

loadUploader = async function loadUploader(params = {}) {
  try {
    const mid = cleanMid(params.mid || params.peopleId);
    if (!mid) return [];
    const page = Math.max(1, Number(params.page || 1));
    const count = Math.min(50, Math.max(1, Number(params.count || 20)));
    const signed = await wbiSign(params, {
      mid,
      pn: page,
      ps: count,
      order: "pubdate",
      platform: "web",
      web_location: 1550101
    });
    const data = await apiGet(params, "/x/space/wbi/arc/search", signed, `https://space.bilibili.com/${mid}/video`);
    const list = data && data.list && Array.isArray(data.list.vlist) ? data.list.vlist : [];
    return list.map((raw) => {
      const shaped = {
        bvid: raw.bvid,
        title: raw.title,
        pic: raw.pic,
        owner: { mid, name: raw.author || "", face: "" },
        stat: { view: raw.play, danmaku: raw.video_review },
        duration: raw.length,
        pubdate: raw.created,
        tname: raw.typeid ? "" : "",
        desc: raw.description || ""
      };
      return toVideoItem(shaped);
    }).filter(Boolean);
  } catch (error) {
    if (error && (error.code === -352 || error.code === -101 || error.code === -403)) {
      console.log("[Bilibili loadUploader] 需要登录 Cookie 才能读取 UP 主投稿");
      return [];
    }
    console.error("[Bilibili loadUploader] 失败:", error.message || error);
    throw error;
  }
};

search = async function search(params = {}) {
  try {
    const keyword = String(params.keyword || "").trim();
    if (!keyword) return [];
    const owned = parseBilibiliUrl(keyword);
    if (owned) {
      const item = await loadDetail(videoLink(owned.bvid));
      return item ? [item] : [];
    }
    if (cleanBvid(keyword)) {
      const item = await loadDetail(videoLink(keyword));
      return item ? [item] : [];
    }
    const page = Math.max(1, Number(params.page || 1));
    const count = Math.min(50, Math.max(1, Number(params.count || 20)));
    const data = await apiGet(params, "/x/web-interface/search/type", {
      search_type: "video",
      keyword,
      page,
      page_size: count
    }, "https://search.bilibili.com/");
    const list = Array.isArray(data && data.result) ? data.result : [];
    return list.map((raw) => toVideoItem({
      bvid: raw.bvid,
      title: String(raw.title || "").replace(/<[^>]+>/g, ""),
      pic: raw.pic,
      owner: { mid: raw.mid, name: raw.author, face: "" },
      stat: { view: raw.play, danmaku: raw.video_review },
      duration: raw.duration,
      pubdate: raw.pubdate,
      tname: raw.typename,
      desc: raw.description || ""
    })).filter(Boolean);
  } catch (error) {
    console.error("[Bilibili search] 失败:", error.message || error);
    throw error;
  }
};

loadDetail = async function loadDetail(link) {
  try {
    const context = parseOwnedLink(link);
    if (!context) return null;
    const raw = await fetchVideoView({}, context.bvid);
    if (!raw) return null;
    let page = 1;
    if (context.cid) {
      const pages = Array.isArray(raw.pages) ? raw.pages : [];
      const index = pages.findIndex((entry) => Number(entry.cid) === Number(context.cid));
      page = index >= 0 ? index + 1 : 1;
    } else if (context.page) {
      page = context.page;
    }
    return toVideoItem(raw, page);
  } catch (error) {
    console.error("[Bilibili loadDetail] 失败:", error.message || error);
    return null;
  }
};

function pickQuality(list, prefer) {
  const sorted = (Array.isArray(list) ? list : []).slice().sort((a, b) => Number(b.id) - Number(a.id));
  if (!sorted.length) return null;
  if (prefer) {
    const exact = sorted.find((entry) => Number(entry.id) === Number(prefer));
    if (exact) return exact;
  }
  return sorted[0];
}

function qualityName(id) {
  const map = {
    127: "8K", 126: "杜比视界", 125: "HDR", 120: "4K", 116: "1080P60",
    112: "1080P+", 80: "1080P", 74: "720P60", 64: "720P", 32: "480P", 16: "360P", 6: "240P"
  };
  return map[Number(id)] || `${id}`;
}

/* ------------------------------ DASH → MPD ------------------------------ */

function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 是否是可免 Referer 的 CDN（实测 akamaized 系列不校验） */
function isNoRefererCdn(url) {
  return /akamaized\.net|akamai/i.test(String(url || ""));
}

function buildMpd({ duration, videos, audios }) {
  if (!videos.length) return "";
  const totalSeconds = Math.max(1, Math.ceil(Number(duration || 0)));
  const durationIso = `PT${totalSeconds}S`;

  const videoXml = videos.map((track, index) => {
    const init = escapeXml(track.SegmentBase.Initialization || "");
    const indexRange = escapeXml(track.SegmentBase.indexRange || "");
    const bandwidth = Math.max(1, Math.round(Number(track.bandwidth || 1)));
    const codecs = escapeXml(track.codecs || "avc1.64001f");
    const width = Math.round(Number(track.width || 1920));
    const height = Math.round(Number(track.height || 1080));
    const frameRate = Number(String(track.frameRate || "30").split(".")[0]) || 30;
    return [
      `      <Representation id="v${index}" bandwidth="${bandwidth}" codecs="${codecs}" width="${width}" height="${height}" frameRate="${frameRate}">`,
      `        <BaseURL>${escapeXml(track.baseUrl)}</BaseURL>`,
      `        <SegmentBase indexRange="${indexRange}">`,
      `          <Initialization range="${init}"/>`,
      `        </SegmentBase>`,
      `      </Representation>`
    ].join("\n");
  }).join("\n");

  const audioXml = audios.map((track, index) => {
    const init = escapeXml(track.SegmentBase.Initialization || "");
    const indexRange = escapeXml(track.SegmentBase.indexRange || "");
    const bandwidth = Math.max(1, Math.round(Number(track.bandwidth || 1)));
    const codecs = escapeXml(track.codecs || "mp4a.40.2");
    return [
      `      <Representation id="a${index}" bandwidth="${bandwidth}" codecs="${codecs}">`,
      `        <BaseURL>${escapeXml(track.baseUrl)}</BaseURL>`,
      `        <SegmentBase indexRange="${indexRange}">`,
      `          <Initialization range="${init}"/>`,
      `        </SegmentBase>`,
      `      </Representation>`
    ].join("\n");
  }).join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="${durationIso}" minBufferTime="PT1.5S">`,
    `  <Period id="0" start="PT0S" duration="${durationIso}">`,
    `    <AdaptationSet id="video" contentType="video" mimeType="video/mp4" subsegmentAlignment="true" startWithSAP="1" segmentAlignment="true">`,
    videoXml,
    `    </AdaptationSet>`,
    audios.length
      ? [`    <AdaptationSet id="audio" contentType="audio" mimeType="audio/mp4" subsegmentAlignment="true" startWithSAP="1">`, audioXml, `    </AdaptationSet>`].join("\n")
      : "",
    `  </Period>`,
    `</MPD>`
  ].filter(Boolean).join("\n");
}

function toBase64(text) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const str = String(text || "");
  const bytes = [];
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? "=" : chars[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? "=" : chars[b2 & 63];
  }
  return out;
}

function mpdToDataUrl(mpd) {
  const xml = String(mpd || "");
  if (!xml) return "";
  return `data:application/dash+xml;base64,${toBase64(xml)}`;
}

/**
 * 从 dash 数据挑选轨道并生成可直接播放的 MPD。
 * 优先 avc1 视频（兼容性最广）与 aac 音频。
 */
function buildPlayableMpd(dash, referer) {
  if (!dash || typeof dash !== "object") return null;
  const allVideo = Array.isArray(dash.video) ? dash.video : [];
  const allAudio = Array.isArray(dash.audio) ? dash.audio : [];
  if (!allVideo.length) return null;

  const usable = (track) => track && track.baseUrl && track.SegmentBase;
  const byQuality = (a, b) => {
    const areaA = Number(a.width || 0) * Number(a.height || 0);
    const areaB = Number(b.width || 0) * Number(b.height || 0);
    if (areaA !== areaB) return areaB - areaA;
    return Number(b.bandwidth || 0) - Number(a.bandwidth || 0);
  };

  const avc = allVideo.filter((t) => usable(t) && /^avc1/i.test(t.codecs || "")).sort(byQuality);
  const fallback = allVideo.filter(usable).sort(byQuality);
  const videos = avc.length ? avc : fallback;
  const aac = allAudio.filter((t) => usable(t) && /^mp4a/i.test(t.codecs || "")).sort((a, b) => Number(b.bandwidth || 0) - Number(a.bandwidth || 0));
  const audios = aac.length ? aac : allAudio.filter(usable);

  if (!videos.length) return null;

  // 同清晰度只保留一条（B站 会为同一清晰度给多个编码）
  const seen = new Set();
  const dedupVideo = videos.filter((track) => {
    const key = `${track.width}x${track.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const mpd = buildMpd({
    duration: dash.duration,
    videos: dedupVideo,
    audios: audios.slice(0, 1)
  });
  if (!mpd) return null;

  return {
    mpd,
    url: mpdToDataUrl(mpd),
    bestHeight: Math.max(...dedupVideo.map((t) => Number(t.height || 0))),
    noReferer: dedupVideo.every((t) => isNoRefererCdn(t.baseUrl)),
    videoCount: dedupVideo.length,
    audioCount: Math.min(1, audios.length)
  };
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

    const raw = await fetchVideoView(params, context.bvid);
    if (!raw) return [];
    const pages = Array.isArray(raw.pages) ? raw.pages : [];
    let cid = Number(context.cid || 0);
    if (!cid && pages.length) cid = Number(pages[0].cid || 0);
    if (!cid && raw.cid) cid = Number(raw.cid);
    if (!cid) return [];

    const referer = `https://www.bilibili.com/video/${context.bvid}`;
    const headers = {
      "User-Agent": UA,
      Referer: referer,
      Origin: "https://www.bilibili.com"
    };

    const mode = ["mpd", "merged", "dash", "both"].includes(String(params.qualityMode || ""))
      ? String(params.qualityMode)
      : "mpd";
    const mergedResources = [];

    // MPD：生成 DASH 清单，让播放器自行合并音视频（可到 1080P/4K）
    if (mode === "mpd" || mode === "both") {
      try {
        const dashData = await apiGet(params, "/x/player/playurl", {
          bvid: context.bvid,
          cid,
          qn: 127,
          fnval: 4048,
          fnver: 0,
          fourk: 1
        }, referer);
        const mpd = buildPlayableMpd(dashData && dashData.dash, referer);
        if (mpd && mpd.url) {
          const mpdResource = {
            name: mpd.bestHeight ? `${mpd.bestHeight}P MPD` : "MPD",
            description: [
              `cid:${cid}`,
              "DASH 清单",
              "音视频自动合并",
              `${mpd.videoCount}视频轨/${mpd.audioCount}音频轨`
            ].filter(Boolean).join(" | "),
            url: mpd.url,
            customHeaders: headers,
            playerType: "app"
          };
          if (mode === "mpd") return [mpdResource];
          mergedResources.push(mpdResource);
        }
      } catch (error) {
        console.log("[Bilibili] MPD 生成失败，回退单文件:", error.message || error);
      }
    }

    // 单文件 MP4：音视频已合并，清晰度受 B站 单文件格式限制（通常 720P~1080P）
    if (mode === "merged" || mode === "both" || (mode === "mpd" && mergedResources.length === 0)) {
      const single = await apiGet(params, "/x/player/playurl", {
        bvid: context.bvid,
        cid,
        qn: 127,
        fnval: 1,
        fnver: 0,
        fourk: 1
      }, referer);

      const singleList = single && Array.isArray(single.durl) ? single.durl : [];
      singleList.forEach((entry, index) => {
        const url = String(entry && entry.url || "");
        if (!/^https?:\/\//i.test(url)) return;
        mergedResources.push({
          name: singleList.length > 1 ? `分P${index + 1} ${qualityName(single.quality)}` : qualityName(single.quality),
          description: [single.format || "MP4", `cid:${cid}`, "音视频已合并"].filter(Boolean).join(" | "),
          url,
          customHeaders: headers,
          playerType: "app"
        });
      });
      if (mergedResources.length && mode === "merged") return mergedResources;
    }

    // 回退：DASH 分离轨（部分视频无单文件格式）
    const data = await apiGet(params, "/x/player/playurl", {
      bvid: context.bvid,
      cid,
      qn: 127,
      fnval: 4048,
      fourk: 1,
      fnver: 0
    }, referer);

    const resources = [];
    const dash = data && data.dash;
    if (dash && Array.isArray(dash.video) && dash.video.length) {
      const audioList = Array.isArray(dash.audio) ? dash.audio : [];
      const audio = pickQuality(audioList);
      const seenQuality = new Set();
      const videos = dash.video
        .slice()
        .sort((a, b) => (Number(b.id) - Number(a.id)) || (Number(b.bandwidth || 0) - Number(a.bandwidth || 0)))
        .filter((video) => {
          if (seenQuality.has(Number(video.id))) return false;
          seenQuality.add(Number(video.id));
          return true;
        });
      videos.forEach((video) => {
        const videoUrl = String(video.baseUrl || "");
        if (!/^https?:\/\//i.test(videoUrl)) return;
        const sizeText = video.bandwidth ? `${(Number(video.bandwidth) / 1000).toFixed(0)} kbps` : "";
        resources.push({
          name: qualityName(video.id),
          description: [sizeText, `cid:${cid}`].filter(Boolean).join(" | "),
          url: videoUrl,
          customHeaders: headers,
          playerType: "app"
        });
      });
      const audioUrl = audio ? String(audio.baseUrl || "") : "";
      if (/^https?:\/\//i.test(audioUrl)) {
        resources.push({
          name: "音轨",
          description: "DASH 独立音频轨，需播放器合并",
          url: audioUrl,
          customHeaders: headers,
          playerType: "app"
        });
      }
      if (resources.length) {
        if (mode === "both" || mode === "mpd") return mergedResources.concat(resources);
        return resources;
      }
    }

    const durl = data && Array.isArray(data.durl) ? data.durl : [];
    durl.forEach((entry, index) => {
      const url = String(entry && entry.url || "");
      if (!/^https?:\/\//i.test(url)) return;
      resources.push({
        name: durl.length > 1 ? `分P${index + 1}` : qualityName(data.quality),
        description: data.format || "",
        url,
        customHeaders: headers,
        playerType: "app"
      });
    });
    return mergedResources.concat(resources);
  } catch (error) {
    console.error("[Bilibili loadResource] 失败:", error.message || error);
    throw error;
  }
};
