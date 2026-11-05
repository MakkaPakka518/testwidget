/**
 * 玛卡巴卡云端剧场 Forward Widget
 * 聚合骨朵、豆瓣、精选剧场、热门番剧、芒果TV、FlixPatrol 与动画疯榜单
 */

WidgetMetadata = {
  id: "makkapakka_hub_list_2.0",
  title: "平台剧场",
  description: "骨朵、平台剧场、流媒体 TOP 10 与动画疯人气榜",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  site: "https://t.me/MakkaPakkaOvO",
  version: "1.3.0",
  requiredVersion: "0.0.1",

  modules: [
    {
      title: "豆瓣熱榜",
      description: "豆瓣實時熱門影劇綜",
      functionName: "loadDouban",
      type: "video",
      cacheDuration: 43200,
      params: [
        {
          name: "channel",
          title: "榜單分類",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "全部劇集", value: "tv" },
            { title: "大陸劇集", value: "tv_domestic" },
            { title: "歐美劇集", value: "tv_american" },
            { title: "日本劇集", value: "tv_japanese" },
            { title: "南韓劇集", value: "tv_korean" },
            { title: "動漫番劇", value: "tv_animation" },
            { title: "紀錄片", value: "tv_documentary" },
            { title: "大陸綜藝", value: "show_domestic" },
            { title: "國外綜藝", value: "show_foreign" }
          ]
        },
        {
          name: "sort_type",
          title: "排序方式",
          type: "enumeration",
          value: "default",
          enumOptions: [
            { title: "默認原序", value: "default" },
            { title: "最近更新", value: "updated" },
            { title: "最近發佈", value: "recent" },
            { title: "熱度最高", value: "heat" },
            { title: "流行趨勢", value: "trending" },
            { title: "高分優先", value: "rating" }
          ]
        },
        {
          name: "page",
          title: "頁碼",
          type: "page",
          startPage: 1
        },
        { name: "language", title: "語言", type: "language", value: "zh-CN" }
      ]
    },
    {
      title: "各平臺劇場",
      description: "網路平臺劇場榜單",
      functionName: "loadTheater",
      type: "video",
      cacheDuration: 43200,
      params: [
        {
          name: "brand",
          title: "劇場品牌",
          type: "enumeration",
          value: "迷霧劇場",
          enumOptions: [
            { title: "迷霧劇場", value: "迷雾剧场" },
            { title: "白夜劇場", value: "白夜剧场" },
            { title: " X 劇場", value: "X剧场" },
            { title: "瑪卡的片單", value: "玛卡巴卡的悬疑剧" },
            { title: "橫屏短劇", value: "横屏短剧" },
            { title: "生花劇場", value: "生花剧场" },
            { title: "大家劇場", value: "大家剧场" },
            { title: "小逗劇場", value: "小逗剧场" },
            { title: "十分劇場", value: "十分剧场" },
            { title: "板凳單元", value: "板凳单元" },
            { title: "螢火單元", value: "萤火单元" },
            { title: "正午陽光", value: "正午阳光" },
            { title: "戀戀劇場", value: "恋恋剧场" },
            { title: "懸疑劇場", value: "悬疑剧场" },
            { title: "微塵劇場", value: "微尘剧场" }
          ]
        },
        {
          name: "status",
          title: "播出狀態",
          type: "enumeration",
          value: "all",
          enumOptions: [
            { title: "全部", value: "all" },
            { title: "已開播", value: "aired" },
            { title: "即將推出", value: "upcoming" }
          ]
        },
        {
          name: "sort_type",
          title: "排序方式",
          type: "enumeration",
          value: "default",
          enumOptions: [
            { title: "默認原序", value: "default" },
            { title: "最近更新", value: "updated" },
            { title: "最近發佈", value: "recent" },
            { title: "熱度最高", value: "heat" },
            { title: "流行趨勢", value: "trending" },
            { title: "高分優先", value: "rating" }
          ]
        },
        {
          name: "page",
          title: "頁碼",
          type: "page",
          startPage: 1
        },
        { name: "language", title: "語言", type: "language", value: "zh-CN" }
      ]
    },
    {
      title: "熱門番劇",
      description: "Bangumi 實時熱榜",
      functionName: "loadBangumi",
      type: "video",
      cacheDuration: 43200,
      params: [
        {
          name: "genre",
          title: "番劇類型",
          type: "enumeration",
          value: "",
          enumOptions: [
            { title: "全部", value: "" },
            { title: "動作", value: "28" },
            { title: "冒險", value: "12" },
            { title: "動畫", value: "16" },
            { title: "喜劇", value: "35" },
            { title: "奇幻", value: "14" },
            { title: "劇情", value: "18" },
            { title: "科幻", value: "878" },
            { title: "懸疑", value: "9648" }
          ]
        },
        {
          name: "sort_type",
          title: "排序方式",
          type: "enumeration",
          value: "default",
          enumOptions: [
            { title: "默認原序", value: "default" },
            { title: "最近更新", value: "updated" },
            { title: "最近發佈", value: "recent" },
            { title: "熱度最高", value: "heat" },
            { title: "流行趨勢", value: "trending" },
            { title: "高分優先", value: "rating" }
          ]
        },
        {
          name: "page",
          title: "頁碼",
          type: "page",
          startPage: 1
        },
        { name: "language", title: "語言", type: "language", value: "zh-CN" }
      ]
    },
    {
      title: "芒果TV熱榜",
      description: "最新芒果TV熱播劇集與綜藝",
      functionName: "loadMangoTV",
      type: "video",
      cacheDuration: 43200,
      params: [
        {
          name: "sort_by",
          title: "類型",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "全部劇集", value: "tv" },
            { title: "王牌綜藝", value: "show" }
          ]
        },
        {
          name: "sort_type",
          title: "排序方式",
          type: "enumeration",
          value: "default",
          enumOptions: [
            { title: "默認原序", value: "default" },
            { title: "最近更新", value: "updated" },
            { title: "最近發佈", value: "recent" },
            { title: "熱度最高", value: "heat" },
            { title: "流行趨勢", value: "trending" },
            { title: "高分優先", value: "rating" }
          ]
        },
        {
          name: "page",
          title: "頁碼",
          type: "page",
          startPage: 1
        },
        { name: "language", title: "語言", type: "language", value: "zh-CN" }
      ]
    },
    {
      title: "流媒體 TOP 10",
      description: "FlixPatrol 全球與主要地區榜單",
      functionName: "loadFlixPatrol",
      type: "video",
      cacheDuration: 3600,
      params: [
        {
          name: "country",
          title: "國家/地區",
          type: "enumeration",
          value: "united-states",
          enumOptions: [
            { title: "全球", value: "world" },
            { title: "美國", value: "united-states" },
            { title: "台灣", value: "taiwan" },
            { title: "香港", value: "hong-kong" },
            { title: "新加坡", value: "singapore" },
            { title: "韓國", value: "south-korea" },
            { title: "日本", value: "japan" }
          ]
        },
        {
          name: "platform",
          title: "流媒體平台",
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
            { title: "Peacock", value: "peacock" }
          ]
        },
        {
          name: "chart",
          title: "榜單類型",
          type: "enumeration",
          value: "all",
          enumOptions: [
            { title: "電影 + 劇集", value: "all" },
            { title: "電影 TOP 10", value: "movies" },
            { title: "劇集 TOP 10", value: "tv" },
            { title: "綜合 TOP 10", value: "overall" },
            { title: "兒童電影", value: "kids_movies" },
            { title: "兒童劇集", value: "kids_tv" }
          ]
        },
        { name: "page", title: "頁碼", type: "page", startPage: 1 },
        { name: "language", title: "語言", type: "language", value: "zh-CN" }
      ]
    },
    {
      title: "骨朵熱榜",
      description: "每日全網劇集、動漫、綜藝與電影榜單",
      functionName: "loadGuduo",
      type: "video",
      cacheDuration: 21600,
      params: [
        {
          name: "category",
          title: "榜單分類",
          type: "enumeration",
          value: "剧集",
          enumOptions: [
            { title: "陸劇", value: "剧集" },
            { title: "國漫", value: "动漫" },
            { title: "綜藝", value: "综艺" },
            { title: "電影", value: "电影" }
          ]
        },
        { name: "page", title: "頁碼", type: "page", startPage: 1 },
        { name: "language", title: "語言", type: "language", value: "zh-CN" }
      ]
    },
    {
      title: "動畫瘋人氣榜",
      description: "GitHub 定時抓取的月人氣與年份榜",
      functionName: "loadAniGamer",
      type: "video",
      cacheDuration: 3600,
      params: [
        { name: "sort", title: "排序", type: "enumeration", value: "monthly", enumOptions: [{ title: "月人氣排行", value: "monthly" }, { title: "年份排序", value: "yearly" }] },
        { name: "page", title: "頁碼", type: "page", startPage: 1 },
        { name: "language", title: "語言", type: "language", value: "zh-CN" }
      ]
    }
  ]
};

// ============================================
// Handler Functions
// ============================================

const Utils = {
  emptyTips: [{ id: "empty", type: "text", title: "⚠️ 加载失败", description: "请检查网络连线" }],

  async fetch(filename) {
    const url = `https://raw.githubusercontent.com/MakkaPakka518/List/refs/heads/main/data/${filename}`;
    try {
      const resp = await Widget.http.get(url, { decodable: true });
      if (!resp?.data) return this.emptyTips;
      return typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
    } catch (e) {
      console.error(`[Error] ${url}: ${e.message}`);
      return this.emptyTips;
    }
  },

  // 完全纯本地的同步排序逻辑，速度极快
  sortList(list, sortType) {
    if (!list || !Array.isArray(list) || list.length === 0) return list || [];
    if (!sortType || sortType === "default") return list;

    // 复制数组以防污染原数据
    return [...list].sort((a, b) => {
      switch (sortType) {
        case "updated":
          // 优先取爬虫抓好的 lastUpdateDate，如果没有则回退到 releaseDate (首播)
          const updateA = a.lastUpdateDate ? new Date(a.lastUpdateDate).getTime() : (a.releaseDate ? new Date(a.releaseDate).getTime() : 0);
          const updateB = b.lastUpdateDate ? new Date(b.lastUpdateDate).getTime() : (b.releaseDate ? new Date(b.releaseDate).getTime() : 0);
          return updateB - updateA;
        case "recent":
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA;
        case "heat":
          const heatA = parseFloat(a.voteCount || a.vote_count) || 0;
          const heatB = parseFloat(b.voteCount || b.vote_count) || 0;
          return heatB - heatA;
        case "trending":
          const trendA = parseFloat(a.popularity) || 0;
          const trendB = parseFloat(b.popularity) || 0;
          return trendB - trendA;
        case "rating":
          const rateA = parseFloat(a.rating) || 0;
          const rateB = parseFloat(b.rating) || 0;
          return rateB - rateA;
        default:
          return 0;
      }
    });
  },

  paginate(list, pageNum, pageSize = 24) {
    if (!list || !Array.isArray(list)) return [];
    const p = parseInt(pageNum) || 1;
    const start = (p - 1) * pageSize;
    return list.slice(start, start + pageSize);
  },

  toVideoItem(item) {
    if (!item || item.type === "text") return item;
    const id = Number(item.tmdbId || item.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const mediaType = item.mediaType || "tv";
    if (!["movie", "tv"].includes(mediaType)) return null;
    return { id: `${mediaType}.${id}`, type: "tmdb" };
  },

  toVideoItems(list) {
    return (list || []).map(item => this.toVideoItem(item)).filter(Boolean);
  }
};

/**
 * 模块 1：加载豆瓣榜单
 */
async function loadDouban(params = {}) {
  const data = await Utils.fetch("douban-hot.json");
  if (data === Utils.emptyTips) return data;

  let list = data?.[params.channel] || [];
  list = Utils.sortList(list, params.sort_type); // 直接同步调用，不再 await
  return Utils.toVideoItems(Utils.paginate(list, params.page));
}

/**
 * 模块 2：加载精选剧场
 */
async function loadTheater(params = {}) {
  const data = await Utils.fetch("theater-data.json");
  if (data === Utils.emptyTips) return data;

  const brand = params.brand || "迷雾剧场";
  const status = params.status || "all";

  const brandData = data[brand];
  if (!brandData) return [];

  let list = [];
  if (status === "aired") {
    list = brandData.aired || [];
  } else if (status === "upcoming") {
    list = brandData.upcoming || [];
  } else {
    list = [...(brandData.upcoming || []), ...(brandData.aired || [])];
  }

  list = Utils.sortList(list, params.sort_type); // 同步调用
  return Utils.toVideoItems(Utils.paginate(list, params.page));
}

/**
 * 模块 3：加载热门番剧 (Bangumi)
 */
async function loadBangumi(params = {}) {
  const data = await Utils.fetch("bangumi-hot.json");
  if (data === Utils.emptyTips) return data;

  let list = data?.hot_anime || data?.items || [];

  if (params.genre && params.genre !== "") {
    const genreNames = { "28": "动作", "12": "冒险", "16": "动画", "35": "喜剧", "14": "奇幻", "18": "剧情", "878": "科幻", "9648": "悬疑" };
    const genreName = genreNames[params.genre];
    list = list.filter(item => genreName && String(item.genreTitle || "").includes(genreName));
  }

  list = Utils.sortList(list, params.sort_type); // 同步调用
  return Utils.toVideoItems(Utils.paginate(list, params.page));
}

/**
 * 模块 4：加载芒果TV热榜
 */
async function loadMangoTV(params = {}) {
  const data = await Utils.fetch("mgtv-hot.json");
  if (data === Utils.emptyTips) return data;

  const sort_by = params.sort_by || "tv";
  let list = data?.[sort_by] || [];

  list = Utils.sortList(list, params.sort_type); // 同步调用
  return Utils.toVideoItems(Utils.paginate(list, params.page));
}

/**
 * 模块 5：加载骨朵热榜
 */
async function loadGuduo(params = {}) {
  const data = await Utils.fetch("guduo-hot.json");
  if (data === Utils.emptyTips) return data;
  const list = data?.categories?.[params.category || "剧集"] || [];
  return Utils.toVideoItems(Utils.paginate(list, params.page));
}

/**
 * 模块 7：加载动画疯人气榜
 */
async function loadAniGamer(params = {}) {
  try {
    const data = await Utils.fetch("anigamer-hot.json");
    if (data === Utils.emptyTips || !data?.lists) throw new Error("动画疯榜单 JSON 格式不正确");
    const sort = params.sort === "yearly" ? "yearly" : "monthly";
    const page = String(Math.min(5, Math.max(1, Number(params.page) || 1)));
    return Utils.toVideoItems(data.lists[sort]?.[page] || []);
  } catch (error) {
    let reason = error.message || String(error);
    const status = await Utils.fetch("anigamer-status.json");
    if (status !== Utils.emptyTips && status?.ok === false && status.reason) reason = status.reason;
    console.error("[loadAniGamer] 失败:", reason);
    throw new Error(`动画疯榜单更新失败：${reason}`);
  }
}

/**
 * 模块 6：加载 FlixPatrol 全球流媒体榜
 */
async function loadFlixPatrol(params = {}) {
  const allowedCountries = ["world", "united-states", "taiwan", "hong-kong", "singapore", "south-korea", "japan"];
  const country = allowedCountries.includes(params.country) ? params.country : "united-states";
  const data = await Utils.fetch(`flixpatrol/${country}.json`);
  if (data === Utils.emptyTips || !data?.platforms) return data === Utils.emptyTips ? data : [];

  const chart = ["all", "movies", "tv", "overall", "kids_movies", "kids_tv"].includes(params.chart) ? params.chart : "all";
  const collect = platform => {
    const charts = platform?.charts || {};
    return chart === "all" ? [...(charts.movies || []), ...(charts.tv || [])] : (charts[chart] || []);
  };
  let list = [];
  if (params.platform === "all") {
    for (const platform of Object.values(data.platforms)) list.push(...collect(platform));
  } else {
    const platform = data.platforms[params.platform || "netflix"];
    if (!platform) return [];
    list = collect(platform);
  }

  const unique = [];
  const seen = new Set();
  for (const item of list) {
    const key = `${item.mediaType || "tv"}:${item.tmdbId || item.id || item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return Utils.toVideoItems(Utils.paginate(unique, params.page, 24));
}
